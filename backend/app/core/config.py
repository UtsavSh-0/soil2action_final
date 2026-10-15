from __future__ import annotations

import json
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _parse_cors_env(value: str | list[str] | None) -> list[str]:
    if value is None:
        return ["http://localhost:5173"]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return ["http://localhost:5173"]
        if stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except json.JSONDecodeError:
                pass
        return [item.strip() for item in stripped.split(",") if item.strip()]
    return [str(value).strip()]


class Settings(BaseSettings):
    DATABASE_PATH: Path = Path("data/soil2action.db")
    CORS_ORIGINS: str = "http://localhost:5173"
    MAX_UPLOAD_SIZE_MB: int = 10
    OCR_LANGUAGE: str = "eng"
    TESSERACT_CMD: str | None = None
    TESSDATA_PREFIX: str | None = None
    ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    @property
    def cors_origins(self) -> list[str]:
        return _parse_cors_env(self.CORS_ORIGINS)

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def database_path(self) -> Path:
        path = self.DATABASE_PATH.expanduser()
        if path.is_absolute():
            return path
        return Path(__file__).resolve().parents[2] / path


settings = Settings()
