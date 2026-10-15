from __future__ import annotations

from fastapi import APIRouter, HTTPException
import sqlite3

from app.db.sqlite import initialize_database
from app.repositories.sqlite_repo import repository

router = APIRouter(tags=["health"])


@router.get("/health", summary="API health check")
def health() -> dict[str, str | bool]:
    try:
        initialize_database(repository.db_path)
        return {"status": "ok", "database_ready": True, "database": "sqlite"}
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(status_code=503, detail={"code": "database_unavailable", "message": "The local SQLite database is unavailable"}) from exc


@router.get("/ready", summary="Readiness check")
def readiness() -> dict[str, str | bool]:
    result = health()
    return {"status": "ready", "database_ready": result["database_ready"], "database": "sqlite"}
