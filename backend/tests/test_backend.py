from __future__ import annotations

from io import BytesIO
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.core.config import settings
from app.main import app
from app.schemas.soil import SoilMeasurementPayload
from app.services.ocr_service import OCRService
from app.db.sqlite import connect
from app.repositories.sqlite_repo import RepositoryDataError, SQLiteRepository, repository

client = TestClient(app, raise_server_exceptions=False)


def headers(user_id: str = "user-1") -> dict[str, str]:
    return {"X-User-Id": user_id}


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_valid_and_invalid_measurement_payloads() -> None:
    valid = SoilMeasurementPayload(
        ph={"value": 6.8, "unit": "pH", "source": "manual"},
        electrical_conductivity={"value": 0.65, "unit": "dS/m", "source": "manual"},
        organic_carbon={"value": 0.8, "unit": "%", "source": "manual"},
        available_nitrogen={"value": 240, "unit": "kg/ha", "source": "manual"},
        available_phosphorus={"value": 36, "unit": "kg/ha", "source": "manual"},
        available_potassium={"value": 205, "unit": "kg/ha", "source": "manual"},
    )
    assert valid.ph.value == 6.8

    with pytest.raises(ValueError):
        SoilMeasurementPayload(ph={"value": float("nan"), "unit": "pH"})

    with pytest.raises(ValueError):
        SoilMeasurementPayload(ph={"value": 6.8})


def test_missing_values_vs_zero_are_preserved() -> None:
    payload = SoilMeasurementPayload(
        ph={"value": 0, "unit": "pH"},
        electrical_conductivity=None,
    )
    assert payload.ph.value == 0
    assert payload.electrical_conductivity is None


def test_unsupported_upload_is_rejected() -> None:
    response = client.post(
        "/api/soil/scan",
        files={"file": ("notes.txt", b"hello world", "text/plain")},
        headers=headers(),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_upload"


def test_oversized_upload_is_rejected() -> None:
    original_limit = settings.MAX_UPLOAD_SIZE_MB
    settings.MAX_UPLOAD_SIZE_MB = 0
    try:
        response = client.post(
            "/api/soil/scan",
            files={"file": ("card.jpg", b"\xff\xd8\xff\x00junk", "image/jpeg")},
            headers=headers(),
        )
        assert response.status_code == 400
    finally:
        settings.MAX_UPLOAD_SIZE_MB = original_limit


def test_invalid_pdf_is_rejected() -> None:
    response = client.post(
        "/api/soil/scan",
        files={"file": ("bad.pdf", b"not-a-pdf", "application/pdf")},
        headers=headers(),
    )
    assert response.status_code == 400


def test_malformed_image_is_rejected_cleanly() -> None:
    with pytest.raises(ValueError, match="could not be decoded"):
        OCRService()._image_to_text(b"\xff\xd8\xffnot-an-image")


def test_ocr_extraction_from_text_fixture() -> None:
    service = OCRService()
    parsed = service._parse_extracted_values("pH 6.8 Organic Carbon 0.8% Available N 240 kg/ha")
    assert parsed["ph"]["value"] == "6.8"
    assert parsed["organic_carbon"]["value"] == "0.8"
    assert parsed["available_nitrogen"]["value"] == "240"
    assert parsed["available_nitrogen"]["unit"] == "kg/ha"


def test_parser_preserves_text_and_marks_missing_fields_uncertain() -> None:
    parsed = OCRService()._parse_extracted_values("Farmer Name: Radha Devi\nDistrict: Sehore\npH 6,8\nCalcium: 12 mg/kg", confidence=None)
    assert parsed["farmer_name"]["value"] == "Radha Devi"
    assert parsed["district"]["value"] == "Sehore"
    assert parsed["ph"]["value"] == "6,8"
    assert parsed["ph"]["review_status"] == "uncertain"
    assert parsed["other_measurement_calcium"]["value"] == "12"
    assert "boron" not in parsed


def test_low_confidence_ocr_requires_manual_review(monkeypatch) -> None:
    async def fake_scan_file(self, upload):
        return {
            "scan_id": "scan-123",
            "status": "review_required",
            "filename": "sample.jpg",
            "extracted_fields": {"ph": {"value": 5.9, "unit": "pH", "confidence": 0.2, "confirmed": False, "source": "ocr"}},
            "warnings": ["Low confidence value detected"],
            "raw_text": "pH 5.9",
            "requires_user_review": True,
        }

    monkeypatch.setattr(OCRService, "scan_file", fake_scan_file)
    response = client.post(
        "/api/soil/scan",
        files={"file": ("sample.jpg", b"\xff\xd8\xff", "image/jpeg")},
        headers=headers(),
    )
    assert response.status_code == 200
    assert response.json()["requires_user_review"] is True


def test_missing_tesseract_error() -> None:
    import shutil
    import pytesseract

    original = shutil.which
    shutil.which = lambda name: None
    try:
        pytesseract.pytesseract.tesseract_cmd = None
        with pytest.raises(RuntimeError):
            OCRService()._ensure_tesseract()
    finally:
        shutil.which = original


def test_scan_returns_clear_service_error_when_tesseract_is_unavailable(monkeypatch) -> None:
    def missing(self):
        raise RuntimeError("Tesseract is not installed or not on PATH")

    monkeypatch.setattr(OCRService, "_ensure_tesseract", missing)
    image = BytesIO()
    Image.new("RGB", (20, 20), "white").save(image, format="PNG")
    response = client.post("/api/soil/scan", files={"file": ("card.png", image.getvalue(), "image/png")}, headers=headers())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "ocr_setup_error"
    assert "TESSERACT_CMD" in response.json()["error"]["message"]


def test_scan_confirmation_requires_explicit_confirmation() -> None:
    payload = {
        "measurements": {"ph": {"value": 6.8, "unit": "pH"}},
        "confirmed": False,
    }
    response = client.post("/api/soil/scan/scan-1/confirm", json=payload, headers=headers())
    assert response.status_code == 400


def test_analysis_without_sufficient_measurement_set_still_returns_partial_result() -> None:
    payload = {
        "measurements": {"ph": {"value": 6.8, "unit": "pH", "source": "manual"}},
        "crop": "wheat",
        "language": "en",
    }
    response = client.post("/api/soil/analyze", json=payload, headers=headers("user-2"))
    assert response.status_code == 200
    body = response.json()
    assert body["missing_information"]
    assert body["status"] == "completed"


def test_database_failure_returns_server_error(monkeypatch) -> None:
    from app.services.soil_analysis_service import SoilAnalysisService

    def boom(*args, **kwargs):
        raise RuntimeError("database down")

    monkeypatch.setattr(SoilAnalysisService, "analyze", boom)
    payload = {
        "measurements": {"ph": {"value": 6.8, "unit": "pH"}},
        "crop": "rice",
    }
    response = client.post("/api/soil/analyze", json=payload, headers=headers("user-3"))
    assert response.status_code == 500


def test_unauthorized_report_access_is_denied() -> None:
    payload = {
        "measurements": {"ph": {"value": 6.4, "unit": "pH"}, "organic_carbon": {"value": 0.7, "unit": "%"}},
        "crop": "rice",
    }
    create_response = client.post("/api/soil/analyze", json=payload, headers=headers("user-4"))
    report_id = create_response.json()["report_id"]
    response = client.get(f"/api/soil/history/{report_id}", headers=headers("user-5"))
    assert response.status_code == 404


def test_cross_user_field_access_is_denied() -> None:
    create_response = client.post(
        "/api/fields",
        json={"field_name": "North Plot", "field_size": 2.5, "field_size_unit": "acre", "current_crop": "rice"},
        headers=headers("user-6"),
    )
    field_id = create_response.json()["id"]
    response = client.get(f"/api/fields/{field_id}", headers=headers("user-7"))
    assert response.status_code == 404


def test_pagination_and_filtering_work() -> None:
    for index in range(2):
        client.post(
            "/api/soil/analyze",
            json={
                "measurements": {"ph": {"value": 6.2 + index, "unit": "pH"}},
                "crop": "wheat",
            },
            headers=headers(f"user-8-{index}"),
        )
    response = client.get("/api/soil/history", params={"page": 1, "page_size": 1, "crop": "wheat"}, headers=headers("user-8-0"))
    assert response.status_code == 200
    body = response.json()
    assert body["page_size"] == 1
    assert body["total"] >= 1
    frontend_page = client.get(
        "/api/soil/history",
        params={"page": 1, "page_size": 200},
        headers=headers("user-8-0"),
    )
    assert frontend_page.status_code == 200


def test_analysis_persists_frontend_payload_across_repository_instances() -> None:
    payload = {
        "farmer": {"name": "Test farmer", "state": "State", "district": "District"},
        "field": {"name": "North plot", "size": 1.5, "size_unit": "acre", "current_crop": "rice"},
        "measurements": {
            "ph": 6.7,
            "electrical_conductivity": None,
            "organic_carbon": 0.8,
            "nitrogen": 180,
            "phosphorus": 28,
            "potassium": 140,
            "nutrient_unit": "kg/ha",
            "micronutrient_unit": "ppm",
            "micronutrients": {"zinc": None, "iron": None, "manganese": None, "copper": None, "boron": None, "sulphur": 1.4},
            "test_date": "2026-10-16",
        },
        "language": "en",
    }
    response = client.post("/api/soil/analyze", json=payload, headers=headers("local-user"))
    assert response.status_code == 200, response.text
    report_id = response.json()["report_id"]

    reopened = SQLiteRepository(repository.db_path)
    report = reopened.get_report(report_id, "local-user")
    assert report is not None
    assert report["measurements"]["ph"] == 6.7
    assert report["measurements"]["micronutrients"]["sulphur"] == 1.4
    assert report["field_name"] == "North plot"
    assert report["analysis"]["parameters"]
    assert reopened.list_reports("local-user", page=1, page_size=10)[0]["report_id"] == report_id


def test_report_survives_fastapi_process_restart() -> None:
    repository.save_analysis(
        "restart-user",
        {"report_id": "restart-report", "status": "completed", "crop": "rice"},
        soil_measurements={"ph": 6.5},
    )
    backend_directory = Path(__file__).resolve().parents[1]
    script = """
from fastapi.testclient import TestClient
from app.main import app
with TestClient(app) as client:
    response = client.get('/api/soil/history/restart-report', headers={'X-User-Id': 'restart-user'})
    assert response.status_code == 200, response.text
    assert response.json()['measurements']['ph'] == 6.5
"""
    environment = os.environ.copy()
    environment["DATABASE_PATH"] = str(repository.db_path)
    environment["ENVIRONMENT"] = "development"
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=backend_directory,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def test_report_create_update_delete_and_missing_id() -> None:
    record = repository.add_report(
        "crud-user",
        {"report_id": "crud-report", "status": "completed", "crop": "rice", "measurements": {"ph": 6.2}},
    )
    assert repository.get_report(record["report_id"], "crud-user") is not None
    updated = repository.update_report("crud-report", "crud-user", {"status": "pending"})
    assert updated is not None and updated["status"] == "pending"
    assert repository.delete_report("crud-report", "crud-user")
    assert repository.get_report("crud-report", "crud-user") is None
    response = client.get("/api/soil/history/missing-report", headers=headers("crud-user"))
    assert response.status_code == 404


def test_sqlite_enforces_foreign_keys() -> None:
    with pytest.raises(sqlite3.IntegrityError):
        repository.create_field(
            "owner-1",
            {"name": "Invalid link", "size": 1, "size_unit": "acre", "farmer_id": "missing-farmer"},
        )


def test_malformed_persisted_json_is_reported() -> None:
    now = repository.now()
    with connect(repository.db_path) as connection:
        connection.execute(
            """INSERT INTO soil_reports
                (id, user_id, report_title, soil_measurements, analysis_result, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            ("bad-json", "local-user", "rice", "{not-json", "{}", "completed", now, now),
        )
    with pytest.raises(RepositoryDataError):
        repository.get_report("bad-json", "local-user")


def test_scan_job_persists_for_reopened_repository(monkeypatch) -> None:
    async def fake_scan_file(self, upload):
        return {
            "scan_id": "persistent-scan",
            "status": "review_required",
            "filename": "sample.jpg",
            "detected_file_type": "image",
            "extracted_fields": {"ph": {"value": 6.4, "unit": "pH", "confidence": 0.8, "confirmed": False}},
            "warnings": [],
            "raw_text": "pH 6.4",
            "requires_user_review": True,
        }

    monkeypatch.setattr(OCRService, "scan_file", fake_scan_file)
    response = client.post(
        "/api/soil/scan",
        files={"file": ("sample.jpg", b"\xff\xd8\xff", "image/jpeg")},
        headers=headers("scan-user"),
    )
    assert response.status_code == 200
    scan = SQLiteRepository(repository.db_path).get_scan("persistent-scan", "scan-user")
    assert scan is not None
    assert scan["requires_user_review"] is True
    assert scan["extracted_fields"]["ph"]["confirmed"] is False


def test_scan_text_and_corrected_extraction_can_be_confirmed_without_analysis(monkeypatch) -> None:
    async def fake_scan_file(self, upload):
        return {
            "scan_id": "review-scan", "status": "review_required", "filename": "card.png",
            "detected_file_type": "image", "extracted_fields": {"ph": {"value": "6.1", "unit": "pH", "confidence": 72, "confirmed": False}},
            "warnings": [], "raw_text": "pH 6.1", "requires_user_review": True,
        }
    monkeypatch.setattr(OCRService, "scan_file", fake_scan_file)
    uploaded = client.post("/api/soil/scan", files={"file": ("card.png", b"fake", "image/png")}, headers=headers("review-user"))
    assert uploaded.status_code == 200
    text_response = client.get("/api/soil/scan/review-scan/text", headers=headers("review-user"))
    assert text_response.json()["raw_text"] == "pH 6.1"
    confirmed = client.post("/api/soil/scan/review-scan/confirm", headers=headers("review-user"), json={
        "confirmed": True,
        "extracted_fields": {"ph": {"value": "6.4", "unit": "pH", "confidence": 72, "confirmed": False, "source": "user corrected"}},
    })
    assert confirmed.status_code == 200
    assert confirmed.json()["extracted_fields"]["ph"]["value"] == "6.4"
    assert confirmed.json()["extracted_fields"]["ph"]["confirmed"] is True
    assert repository.count_reports("review-user") == 0


def test_invalid_analysis_payload_returns_validation_error() -> None:
    response = client.post(
        "/api/soil/analyze",
        json={"measurements": {"ph": {"value": 6.8}}},
        headers=headers("invalid-user"),
    )
    assert response.status_code == 422
