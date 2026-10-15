from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request, status


def get_current_user_id(request: Request) -> str:
    from app.core.config import settings

    if settings.ENVIRONMENT.lower() == "development":
        return request.headers.get("x-user-id") or "local-user"
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "authentication_not_configured", "message": "This local application has no production authentication configured"},
    )
