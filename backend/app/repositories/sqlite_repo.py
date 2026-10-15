from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.db.sqlite import connect


class RepositoryDataError(ValueError):
    pass


class SQLiteRepository:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path

    def now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _dump_json(self, value: Any, column: str) -> str:
        try:
            return json.dumps(value, ensure_ascii=False, allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{column} must contain valid JSON data") from exc

    def _load_json(self, value: str | None, column: str, default: Any = None) -> Any:
        if value is None:
            return default
        try:
            return json.loads(value)
        except (TypeError, json.JSONDecodeError) as exc:
            raise RepositoryDataError(f"Stored {column} data is malformed") from exc

    def _field_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        record = dict(row)
        record.update({"name": record["field_name"], "size": record["field_size"], "size_unit": record["field_size_unit"]})
        return record

    def _report_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        report = self._load_json(row["analysis_result"], "analysis_result", {})
        if not isinstance(report, dict):
            raise RepositoryDataError("Stored analysis_result must be a JSON object")
        report["report_id"] = row["id"]
        report["user_id"] = row["user_id"]
        report["field_id"] = row["field_id"]
        report["status"] = row["status"]
        report["created_at"] = row["created_at"]
        report["updated_at"] = row["updated_at"]
        report["measurements"] = self._load_json(row["soil_measurements"], "soil_measurements", {})
        return report

    def _scan_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        fields = self._load_json(row["extracted_fields"], "extracted_fields", {})
        confidence = self._load_json(row["confidence_information"], "confidence_information", {})
        warnings = self._load_json(row["warnings"], "warnings", [])
        confirmed = self._load_json(row["confirmed_measurements"], "confirmed_measurements")
        return {
            "scan_id": row["id"],
            "user_id": row["user_id"],
            "status": row["status"],
            "filename": row["original_filename"],
            "detected_file_type": row["detected_file_type"],
            "extracted_fields": fields,
            "fields_requiring_review": [
                key for key, value in fields.items()
                if isinstance(value, dict) and (not value.get("confirmed", False) or value.get("review_status") not in (None, "confirmed"))
            ],
            "confidence_information": confidence,
            "warnings": warnings,
            "raw_text": row["extracted_text"],
            "requires_user_review": bool(row["requires_user_review"]),
            "confirmed_measurements": confirmed,
            "error_message": row["error_message"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def upsert_farmer_profile(self, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        now = self.now()
        profile = {
            "id": user_id,
            "full_name": payload.get("full_name") or payload.get("name") or "Local farmer",
            "state": payload.get("state") or "",
            "district": payload.get("district") or "",
            "preferred_language": payload.get("preferred_language") or "en",
        }
        with connect(self.db_path) as connection:
            connection.execute(
                """INSERT INTO farmer_profiles
                    (id, full_name, state, district, preferred_language, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        full_name = excluded.full_name,
                        state = excluded.state,
                        district = excluded.district,
                        preferred_language = excluded.preferred_language,
                        updated_at = excluded.updated_at""",
                (profile["id"], profile["full_name"], profile["state"], profile["district"], profile["preferred_language"], now, now),
            )
            row = connection.execute("SELECT * FROM farmer_profiles WHERE id = ?", (user_id,)).fetchone()
        return dict(row)

    def create_field(self, user_id: str, payload: dict[str, Any], *, connection: sqlite3.Connection | None = None) -> dict[str, Any]:
        field_id = str(payload.get("id") or uuid4())
        values = (
            field_id,
            user_id,
            payload.get("farmer_id"),
            payload.get("field_name") or payload.get("name"),
            payload.get("field_size", payload.get("size")),
            payload.get("field_size_unit") or payload.get("size_unit"),
            payload.get("current_crop"),
            payload.get("intended_crop"),
            payload.get("state"),
            payload.get("district"),
            self.now(),
            self.now(),
        )
        sql = """INSERT INTO fields
            (id, user_id, farmer_id, field_name, field_size, field_size_unit,
             current_crop, intended_crop, state, district, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
        if connection is None:
            with connect(self.db_path) as active:
                active.execute(sql, values)
                row = active.execute("SELECT * FROM fields WHERE id = ?", (field_id,)).fetchone()
        else:
            connection.execute(sql, values)
            row = connection.execute("SELECT * FROM fields WHERE id = ?", (field_id,)).fetchone()
        return self._field_dict(row)

    def list_fields(self, user_id: str) -> list[dict[str, Any]]:
        with connect(self.db_path) as connection:
            rows = connection.execute(
                "SELECT * FROM fields WHERE user_id = ? ORDER BY created_at DESC, id", (user_id,)
            ).fetchall()
        return [self._field_dict(row) for row in rows]

    def get_field(self, field_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        sql = "SELECT * FROM fields WHERE id = ?"
        params: tuple[Any, ...] = (field_id,)
        if user_id is not None:
            sql += " AND user_id = ?"
            params += (user_id,)
        with connect(self.db_path) as connection:
            row = connection.execute(sql, params).fetchone()
        return self._field_dict(row) if row else None

    def update_field(self, field_id: str, user_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        field_name = payload.get("field_name") or payload.get("name")
        field_size = payload.get("field_size", payload.get("size"))
        unit = payload.get("field_size_unit") or payload.get("size_unit")
        now = self.now()
        with connect(self.db_path) as connection:
            cursor = connection.execute(
                """UPDATE fields SET field_name = ?, field_size = ?, field_size_unit = ?,
                    current_crop = ?, intended_crop = ?, state = ?, district = ?, updated_at = ?
                    WHERE id = ? AND user_id = ?""",
                (field_name, field_size, unit, payload.get("current_crop"), payload.get("intended_crop"), payload.get("state"), payload.get("district"), now, field_id, user_id),
            )
            row = connection.execute("SELECT * FROM fields WHERE id = ? AND user_id = ?", (field_id, user_id)).fetchone() if cursor.rowcount else None
        return self._field_dict(row) if row else None

    def save_analysis(
        self,
        user_id: str,
        report: dict[str, Any],
        *,
        farmer: dict[str, Any] | None = None,
        field: dict[str, Any] | None = None,
        soil_measurements: dict[str, Any] | None = None,
        test_date: str | None = None,
    ) -> dict[str, Any]:
        now = self.now()
        saved = dict(report)
        report_id = str(saved.get("report_id") or uuid4())
        with connect(self.db_path) as connection:
            if farmer is not None:
                farmer_values = (
                    user_id,
                    farmer.get("full_name") or farmer.get("name") or "Local farmer",
                    farmer.get("state") or "",
                    farmer.get("district") or "",
                    farmer.get("preferred_language") or saved.get("language") or "en",
                    now,
                    now,
                )
                connection.execute(
                    """INSERT INTO farmer_profiles
                        (id, full_name, state, district, preferred_language, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            full_name = excluded.full_name, state = excluded.state,
                            district = excluded.district, preferred_language = excluded.preferred_language,
                            updated_at = excluded.updated_at""",
                    farmer_values,
                )

            field_id = saved.get("field_id")
            saved_field: dict[str, Any] | None = None
            if field is not None:
                requested_id = field.get("id")
                if requested_id:
                    row = connection.execute(
                        "SELECT * FROM fields WHERE id = ? AND user_id = ?", (requested_id, user_id)
                    ).fetchone()
                    if row is None:
                        raise ValueError("Field does not exist or is not owned by this user")
                    saved_field = self._field_dict(row)
                else:
                    saved_field = self.create_field(
                        user_id,
                        {**field, "farmer_id": user_id if farmer is not None else None},
                        connection=connection,
                    )
                field_id = saved_field["id"]

            if saved_field is not None:
                saved.update(
                    {
                        "field_id": field_id,
                        "field_name": saved_field["field_name"],
                        "field_size": saved_field["field_size"],
                        "field_size_unit": saved_field["field_size_unit"],
                        "state": saved_field["state"],
                        "district": saved_field["district"],
                    }
                )
            saved["report_id"] = report_id
            saved["user_id"] = user_id
            saved["field_id"] = field_id
            saved["farmer_name"] = (farmer or {}).get("full_name") or (farmer or {}).get("name")
            saved["created_at"] = saved.get("created_at") or now
            saved["updated_at"] = now
            saved["measurements"] = soil_measurements or {}
            connection.execute(
                """INSERT INTO soil_reports
                    (id, user_id, field_id, report_title, test_date, soil_measurements,
                     analysis_result, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    report_id,
                    user_id,
                    field_id,
                    saved.get("crop"),
                    test_date,
                    self._dump_json(soil_measurements or {}, "soil_measurements"),
                    self._dump_json(saved, "analysis_result"),
                    saved.get("status", "completed"),
                    saved["created_at"],
                    saved["updated_at"],
                ),
            )
        return saved

    def add_report(self, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self.save_analysis(user_id, payload, soil_measurements=payload.get("measurements", {}))

    def _report_filters(
        self,
        user_id: str,
        field_id: str | None,
        crop: str | None,
        start: str | None,
        end: str | None,
        status: str | None,
    ) -> tuple[str, list[Any]]:
        clauses = ["user_id = ?"]
        params: list[Any] = [user_id]
        if field_id:
            clauses.append("field_id = ?")
            params.append(field_id)
        if crop:
            clauses.append("lower(COALESCE(report_title, '')) = lower(?)")
            params.append(crop)
        if start:
            clauses.append("created_at >= ?")
            params.append(start)
        if end:
            clauses.append("created_at <= ?")
            params.append(end)
        if status:
            clauses.append("status = ?")
            params.append(status)
        return " AND ".join(clauses), params

    def list_reports(
        self,
        user_id: str,
        *,
        field_id: str | None = None,
        crop: str | None = None,
        start: str | None = None,
        end: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int | None = None,
    ) -> list[dict[str, Any]]:
        where, params = self._report_filters(user_id, field_id, crop, start, end, status)
        sql = f"SELECT * FROM soil_reports WHERE {where} ORDER BY created_at DESC, id DESC"
        if page_size is not None:
            sql += " LIMIT ? OFFSET ?"
            params.extend((page_size, (page - 1) * page_size))
        with connect(self.db_path) as connection:
            rows = connection.execute(sql, params).fetchall()
        return [self._report_dict(row) for row in rows]

    def count_reports(
        self, user_id: str, *, field_id: str | None = None, crop: str | None = None,
        start: str | None = None, end: str | None = None, status: str | None = None,
    ) -> int:
        where, params = self._report_filters(user_id, field_id, crop, start, end, status)
        with connect(self.db_path) as connection:
            return int(connection.execute(f"SELECT COUNT(*) FROM soil_reports WHERE {where}", params).fetchone()[0])

    def get_report(self, report_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        sql = "SELECT * FROM soil_reports WHERE id = ?"
        params: tuple[Any, ...] = (report_id,)
        if user_id is not None:
            sql += " AND user_id = ?"
            params += (user_id,)
        with connect(self.db_path) as connection:
            row = connection.execute(sql, params).fetchone()
        return self._report_dict(row) if row else None

    def update_report(self, report_id: str, user_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        allowed = {"report_title", "test_date", "soil_measurements", "status"}
        updates = {key: value for key, value in patch.items() if key in allowed}
        if not updates:
            return self.get_report(report_id, user_id)
        if "soil_measurements" in updates:
            updates["soil_measurements"] = self._dump_json(updates["soil_measurements"], "soil_measurements")
        assignments = ", ".join(f"{column} = ?" for column in updates)
        values = list(updates.values())
        values.extend((self.now(), report_id, user_id))
        with connect(self.db_path) as connection:
            cursor = connection.execute(
                f"UPDATE soil_reports SET {assignments}, updated_at = ? WHERE id = ? AND user_id = ?", values
            )
            row = connection.execute(
                "SELECT * FROM soil_reports WHERE id = ? AND user_id = ?", (report_id, user_id)
            ).fetchone() if cursor.rowcount else None
        return self._report_dict(row) if row else None

    def delete_report(self, report_id: str, user_id: str) -> bool:
        with connect(self.db_path) as connection:
            cursor = connection.execute("DELETE FROM soil_reports WHERE id = ? AND user_id = ?", (report_id, user_id))
        return cursor.rowcount > 0

    def add_scan(self, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        scan_id = str(payload.get("scan_id") or uuid4())
        fields = payload.get("extracted_fields") or {}
        confidence = {
            key: value.get("confidence")
            for key, value in fields.items()
            if isinstance(value, dict) and value.get("confidence") is not None
        }
        filename = payload.get("filename") or "upload"
        suffix = Path(filename).suffix.lower()
        file_type = payload.get("detected_file_type") or ("pdf" if suffix == ".pdf" else "image")
        now = self.now()
        with connect(self.db_path) as connection:
            connection.execute(
                """INSERT INTO soil_scan_jobs
                    (id, user_id, original_filename, detected_file_type, status, extracted_text,
                     extracted_fields, confidence_information, warnings, requires_user_review,
                     confirmed_measurements, error_message, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    scan_id, user_id, filename, file_type, payload.get("status", "review_required"),
                    payload.get("raw_text"), self._dump_json(fields, "extracted_fields"),
                    self._dump_json(confidence, "confidence_information"),
                    self._dump_json(payload.get("warnings", []), "warnings"),
                    int(payload.get("requires_user_review", True)),
                    self._dump_json(payload["confirmed_measurements"], "confirmed_measurements") if payload.get("confirmed_measurements") is not None else None,
                    payload.get("error_message"), now, now,
                ),
            )
            row = connection.execute("SELECT * FROM soil_scan_jobs WHERE id = ?", (scan_id,)).fetchone()
        return self._scan_dict(row)

    def get_scan(self, scan_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        sql = "SELECT * FROM soil_scan_jobs WHERE id = ?"
        params: tuple[Any, ...] = (scan_id,)
        if user_id is not None:
            sql += " AND user_id = ?"
            params += (user_id,)
        with connect(self.db_path) as connection:
            row = connection.execute(sql, params).fetchone()
        return self._scan_dict(row) if row else None

    def update_scan(self, scan_id: str, user_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        columns: dict[str, tuple[str, Any]] = {
            "status": ("status", lambda value: value),
            "raw_text": ("extracted_text", lambda value: value),
            "extracted_fields": ("extracted_fields", lambda value: self._dump_json(value, "extracted_fields")),
            "warnings": ("warnings", lambda value: self._dump_json(value, "warnings")),
            "requires_user_review": ("requires_user_review", lambda value: int(bool(value))),
            "confirmed_measurements": ("confirmed_measurements", lambda value: self._dump_json(value, "confirmed_measurements")),
            "error_message": ("error_message", lambda value: value),
        }
        updates = [(columns[key][0], columns[key][1](value)) for key, value in patch.items() if key in columns]
        if not updates:
            return self.get_scan(scan_id, user_id)
        assignments = ", ".join(f"{column} = ?" for column, _ in updates)
        values = [value for _, value in updates]
        values.extend((self.now(), scan_id, user_id))
        with connect(self.db_path) as connection:
            cursor = connection.execute(
                f"UPDATE soil_scan_jobs SET {assignments}, updated_at = ? WHERE id = ? AND user_id = ?", values
            )
            row = connection.execute(
                "SELECT * FROM soil_scan_jobs WHERE id = ? AND user_id = ?", (scan_id, user_id)
            ).fetchone() if cursor.rowcount else None
        return self._scan_dict(row) if row else None


repository = SQLiteRepository()
