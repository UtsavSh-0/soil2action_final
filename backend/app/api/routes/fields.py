from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_user_id
from app.repositories.sqlite_repo import RepositoryDataError, repository
from app.schemas.field import FieldCreate, FieldRead, FieldUpdate

router = APIRouter(prefix="/api", tags=["fields"])


@router.get("/fields", response_model=list[FieldRead], summary="List a farmer's fields")
def list_fields(user_id: str = Depends(get_current_user_id)) -> list[FieldRead]:
    records = repository.list_fields(user_id)
    return [FieldRead.model_validate(record) for record in records]


@router.get("/fields/{field_id}", response_model=FieldRead, summary="Get a field by id")
def get_field(field_id: str, user_id: str = Depends(get_current_user_id)) -> FieldRead:
    record = repository.get_field(field_id, user_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "field_not_found", "message": "Field not found for this user"})
    return FieldRead.model_validate(record)


@router.post("/fields", response_model=FieldRead, status_code=status.HTTP_201_CREATED, summary="Create a field")
def create_field(payload: FieldCreate, user_id: str = Depends(get_current_user_id)) -> FieldRead:
    try:
        record = repository.create_field(user_id, payload.model_dump())
    except (ValueError, RepositoryDataError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "invalid_field", "message": str(exc)}) from exc
    return FieldRead.model_validate(record)


@router.put("/fields/{field_id}", response_model=FieldRead, summary="Update a field")
def update_field(field_id: str, payload: FieldUpdate, user_id: str = Depends(get_current_user_id)) -> FieldRead:
    try:
        record = repository.update_field(field_id, user_id, payload.model_dump())
    except (ValueError, RepositoryDataError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "invalid_field", "message": str(exc)}) from exc
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "field_not_found", "message": "Field not found for this user"})
    return FieldRead.model_validate(record)
