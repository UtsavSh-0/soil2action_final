from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from threading import RLock
from typing import Iterator

from app.core.config import settings


_migration_lock = RLock()
_MIGRATIONS: tuple[tuple[int, tuple[str, ...]], ...] = (
    (
        1,
        (
            """CREATE TABLE farmer_profiles (
                id TEXT PRIMARY KEY,
                full_name TEXT NOT NULL,
                state TEXT NOT NULL,
                district TEXT NOT NULL,
                preferred_language TEXT NOT NULL DEFAULT 'en',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )""",
            """CREATE TABLE fields (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                farmer_id TEXT REFERENCES farmer_profiles(id) ON DELETE SET NULL,
                field_name TEXT NOT NULL CHECK (length(trim(field_name)) > 0),
                field_size REAL NOT NULL CHECK (field_size > 0),
                field_size_unit TEXT NOT NULL CHECK (field_size_unit IN ('acre', 'hectare', 'bigha')),
                current_crop TEXT,
                intended_crop TEXT,
                state TEXT,
                district TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )""",
            """CREATE TABLE soil_reports (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                field_id TEXT REFERENCES fields(id) ON DELETE SET NULL,
                report_title TEXT,
                test_date TEXT,
                soil_measurements TEXT NOT NULL,
                analysis_result TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )""",
            """CREATE TABLE soil_scan_jobs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                detected_file_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'review_required' CHECK (status IN ('review_required', 'confirmed', 'failed')),
                extracted_text TEXT,
                extracted_fields TEXT NOT NULL,
                confidence_information TEXT NOT NULL,
                warnings TEXT NOT NULL,
                requires_user_review INTEGER NOT NULL DEFAULT 1 CHECK (requires_user_review IN (0, 1)),
                confirmed_measurements TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )""",
            "CREATE INDEX idx_fields_user_id ON fields(user_id)",
            "CREATE INDEX idx_fields_farmer_id ON fields(farmer_id)",
            "CREATE INDEX idx_soil_reports_user_id_created ON soil_reports(user_id, created_at DESC)",
            "CREATE INDEX idx_soil_reports_field_id ON soil_reports(field_id)",
            "CREATE INDEX idx_soil_reports_status ON soil_reports(status)",
            "CREATE INDEX idx_soil_scan_jobs_user_id_created ON soil_scan_jobs(user_id, created_at DESC)",
        ),
    ),
)


def _open_connection(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path, timeout=10, isolation_level="DEFERRED")
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def initialize_database(path: Path | None = None) -> Path:
    database_path = path or settings.database_path
    database_path = database_path.expanduser().resolve()
    database_path.parent.mkdir(parents=True, exist_ok=True)

    with _migration_lock:
        connection = _open_connection(database_path)
        try:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
            )
            current_version = connection.execute(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations"
            ).fetchone()[0]
            for version, statements in _MIGRATIONS:
                if version <= current_version:
                    continue
                connection.execute("BEGIN IMMEDIATE")
                try:
                    for statement in statements:
                        connection.execute(statement)
                    connection.execute(
                        "INSERT INTO schema_migrations(version, applied_at) "
                        "VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                        (version,),
                    )
                    connection.commit()
                except Exception:
                    connection.rollback()
                    raise
        finally:
            connection.close()
    return database_path


@contextmanager
def connect(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    database_path = initialize_database(path)
    connection = _open_connection(database_path)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()