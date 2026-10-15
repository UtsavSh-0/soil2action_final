from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user_id
from app.schemas.common import PaginatedResponse
from app.repositories.sqlite_repo import RepositoryDataError, repository
from app.schemas.soil import AnalyzeRequest, ConfirmScanRequest, ScanJobRead, SoilReportRead
from app.services.ocr_service import OCRService
from app.services.soil_analysis_service import SoilAnalysisService

router = APIRouter(prefix="/api/soil", tags=["soil"])
ocr_service = OCRService()
soil_analysis_service = SoilAnalysisService(repository)


@router.post("/scan", response_model=ScanJobRead, summary="Upload and OCR a soil health card")
async def scan_soil(file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)) -> dict[str, Any]:
    try:
        result = await ocr_service.scan_file(file)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail={"code": "ocr_setup_error", "message": "Tesseract OCR executable was not found or could not run. Install Tesseract with English (eng) language data, or set TESSERACT_CMD in backend/.env to the full path of tesseract.exe, then restart the backend."}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "invalid_upload", "message": str(exc)}) from exc
    stored = await run_in_threadpool(repository.add_scan, user_id, result)
    return stored


@router.get("/scan/{scan_id}/text", summary="Retrieve the raw text extracted from a scan")
def get_scan_text(scan_id: str, user_id: str = Depends(get_current_user_id)) -> dict[str, str]:
    record = repository.get_scan(scan_id, user_id=user_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "scan_not_found", "message": "Scan job not found for this user"})
    return {"scan_id": scan_id, "raw_text": record.get("raw_text") or ""}


@router.get("/scan/{scan_id}", response_model=ScanJobRead, summary="Fetch a scan job result")
def get_scan(scan_id: str, user_id: str = Depends(get_current_user_id)) -> dict[str, Any]:
    record = repository.get_scan(scan_id, user_id=user_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "scan_not_found", "message": "Scan job not found for this user"})
    return record


@router.post("/scan/{scan_id}/confirm", response_model=ScanJobRead, summary="Confirm OCR extracted measurements")
def confirm_scan(scan_id: str, payload: ConfirmScanRequest, user_id: str = Depends(get_current_user_id)) -> dict[str, Any]:
    if not payload.confirmed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "confirmation_required", "message": "The final measurement set must be explicitly confirmed"})
    record = repository.get_scan(scan_id, user_id=user_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "scan_not_found", "message": "Scan job not found for this user"})
    field_map: dict[str, Any] = {}
    if payload.extracted_fields is not None:
        field_map = {
            key: value.model_copy(update={"confirmed": True, "review_status": "confirmed", "source": value.source or "user_review"}).model_dump()
            for key, value in payload.extracted_fields.items()
        }
    elif payload.measurements is not None:
        for key, value in payload.measurements.model_dump(exclude_none=True).items():
            if isinstance(value, dict) and value.get("value") is not None:
                field_map[key] = {"value": value["value"], "unit": value.get("unit"), "source": value.get("source", "manual"), "confirmed": True, "review_status": "confirmed"}
    updated = repository.update_scan(scan_id, user_id, {
        "status": "confirmed",
        "requires_user_review": False,
        "extracted_fields": field_map,
        "confirmed_measurements": field_map,
    })
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "scan_not_found", "message": "Scan job not found for this user"})
    return updated


@router.post("/analyze", response_model=SoilReportRead, summary="Analyze soil measurements and generate a report")
def analyze_soil(payload: AnalyzeRequest, user_id: str = Depends(get_current_user_id)) -> dict[str, Any]:
    field_id = payload.field_id or (payload.field.id if payload.field else None)
    if field_id:
        field = repository.get_field(field_id, user_id)
        if field is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "field_not_found", "message": "Field does not exist or is not owned by this user"})
    try:
        report = soil_analysis_service.analyze(user_id, payload, field_id=field_id)
    except (RepositoryDataError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "invalid_analysis", "message": str(exc)}) from exc
    return report


@router.get("/history", response_model=PaginatedResponse[SoilReportRead], summary="Get paginated soil report history")
def history(
    field_id: str | None = Query(default=None),
    crop: str | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    report_status: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200),
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    try:
        items = repository.list_reports(
            user_id,
            field_id=field_id,
            crop=crop,
            start=from_date,
            end=to_date,
            status=report_status,
            page=page,
            page_size=page_size,
        )
        total = repository.count_reports(
            user_id, field_id=field_id, crop=crop, start=from_date, end=to_date, status=report_status
        )
    except RepositoryDataError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={"code": "stored_data_invalid", "message": "Stored report data could not be read"}) from exc
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/history/{report_id}", response_model=SoilReportRead, summary="Fetch a single report")
def get_report(report_id: str, user_id: str = Depends(get_current_user_id)) -> dict[str, Any]:
    try:
        report = repository.get_report(report_id, user_id=user_id)
    except RepositoryDataError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={"code": "stored_data_invalid", "message": "Stored report data could not be read"}) from exc
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "report_not_found", "message": "Report not found for this user"})
    return report


@router.delete("/history/{report_id}", summary="Delete an authorized report")
def delete_report(report_id: str, user_id: str = Depends(get_current_user_id)) -> dict[str, str]:
    removed = repository.delete_report(report_id, user_id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "report_not_found", "message": "Report not found for this user"})
    return {"status": "deleted", "report_id": report_id}
