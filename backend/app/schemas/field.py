from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

FieldSizeUnit = Literal["acre", "hectare", "bigha"]


class FieldBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    field_name: str = Field(..., min_length=1, max_length=200)
    field_size: float = Field(..., gt=0)
    field_size_unit: FieldSizeUnit
    current_crop: str | None = None
    intended_crop: str | None = None
    state: str | None = None
    district: str | None = None

    @model_validator(mode="before")
    @classmethod
    def accept_frontend_names(cls, value):
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        for frontend_name, api_name in (("name", "field_name"), ("size", "field_size"), ("size_unit", "field_size_unit")):
            if api_name not in normalized and frontend_name in normalized:
                normalized[api_name] = normalized[frontend_name]
        return normalized

    @field_validator("field_size")
    @classmethod
    def validate_field_size(cls, value: float) -> float:
        if value.is_integer() if hasattr(value, "is_integer") else False:
            return value
        return value


class FieldCreate(FieldBase):
    pass


class FieldUpdate(FieldBase):
    pass


class FieldRead(FieldBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    name: str
    size: float
    size_unit: FieldSizeUnit
    created_at: str | None = None
    updated_at: str | None = None
