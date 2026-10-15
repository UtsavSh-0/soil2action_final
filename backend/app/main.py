from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes.fields import router as fields_router
from app.api.routes.health import router as health_router
from app.api.routes.soil import router as soil_router
from app.core.config import settings
from app.db.sqlite import initialize_database
from app.repositories.sqlite_repo import RepositoryDataError, repository


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database(repository.db_path)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Soil2Action API",
        version="0.1.0",
        description="Soil health analysis and OCR-backed report management for Soil2Action.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        # Browsers treat localhost and 127.0.0.1 as different origins. Allow
        # either local Vite origin during development, including a fallback port.
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?" if not settings.is_production else None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Request validation failed",
                    "details": jsonable_encoder(exc.errors()),
                }
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail
        message = detail
        code = "http_error"
        if isinstance(detail, dict):
            code = detail.get("code", code)
            message = detail.get("message", message)
        return JSONResponse(status_code=exc.status_code, content={"error": {"code": code, "message": message}})

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_server_error",
                    "message": "An internal server error occurred. Please try again later.",
                }
            },
        )

    @app.exception_handler(RepositoryDataError)
    async def stored_data_error_handler(request: Request, exc: RepositoryDataError) -> JSONResponse:
        return JSONResponse(status_code=500, content={"error": {"code": "stored_data_invalid", "message": "Stored application data could not be read"}})

    @app.exception_handler(sqlite3.Error)
    async def database_error_handler(request: Request, exc: sqlite3.Error) -> JSONResponse:
        return JSONResponse(status_code=503, content={"error": {"code": "database_unavailable", "message": "The local database is unavailable"}})

    app.include_router(health_router)
    app.include_router(fields_router)
    app.include_router(soil_router)
    return app


app = create_app()
