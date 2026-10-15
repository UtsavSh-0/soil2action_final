from __future__ import annotations

import math
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


MeasuredUnit = Literal[
    "pH",
    "dS/m",
    "%",
    "kg/ha",
    "mg/kg",
    "ppm",
    "ppm",
    "mmho/cm",
]


class MeasuredValue(BaseModel):
    value: float | int | None = None
    unit: str | None = None
    source: str | None = None

    @field_validator("value")
    @classmethod
    def validate_finite(cls, value: float | int | None) -> float | int | None:
        if value is None:
            return value
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            raise ValueError("value must be a finite number")
        return value

    @model_validator(mode="after")
    def validate_unit(self):
        if self.value is not None and self.unit is None:
            raise ValueError("unit is required when a value is provided")
        return self


class SoilMeasurementPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ph: MeasuredValue | None = None
    electrical_conductivity: MeasuredValue | None = None
    organic_carbon: MeasuredValue | None = None
    available_nitrogen: MeasuredValue | None = None
    available_phosphorus: MeasuredValue | None = None
    available_potassium: MeasuredValue | None = None
    sulfur: MeasuredValue | None = None
    zinc: MeasuredValue | None = None
    iron: MeasuredValue | None = None
    manganese: MeasuredValue | None = None
    copper: MeasuredValue | None = None
    boron: MeasuredValue | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_frontend_measurements(cls, value):
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        nutrient_unit = normalized.pop("nutrient_unit", "kg/ha")
        micronutrient_unit = normalized.pop("micronutrient_unit", "ppm")
        micronutrients = normalized.pop("micronutrients", {}) or {}
        normalized.pop("test_date", None)
        frontend_fields = {
            "nitrogen": ("available_nitrogen", nutrient_unit),
            "phosphorus": ("available_phosphorus", nutrient_unit),
            "potassium": ("available_potassium", nutrient_unit),
            "sulphur": ("sulfur", micronutrient_unit),
        }
        for key in ("zinc", "iron", "manganese", "copper", "boron"):
            frontend_fields[key] = (key, micronutrient_unit)
        for frontend_name, (api_name, unit) in frontend_fields.items():
            raw = normalized.pop(frontend_name, None)
            if frontend_name in ("zinc", "iron", "manganese", "copper", "boron", "sulphur"):
                raw = micronutrients.get(frontend_name, raw)
            if api_name not in normalized and raw is not None:
                normalized[api_name] = raw if isinstance(raw, dict) else {"value": raw, "unit": unit}

        default_units = {
            "ph": "pH",
            "electrical_conductivity": "dS/m",
            "organic_carbon": "%",
            "available_nitrogen": nutrient_unit,
            "available_phosphorus": nutrient_unit,
            "available_potassium": nutrient_unit,
            "sulfur": micronutrient_unit,
            "zinc": micronutrient_unit,
            "iron": micronutrient_unit,
            "manganese": micronutrient_unit,
            "copper": micronutrient_unit,
            "boron": micronutrient_unit,
        }
        for key, unit in default_units.items():
            raw = normalized.get(key)
            if isinstance(raw, (int, float)):
                normalized[key] = {"value": raw, "unit": unit}
        return normalized

    @property
    def populated_fields(self) -> dict[str, float | int]:
        out: dict[str, float | int] = {}
        for key, value in self.model_dump(exclude_none=True).items():
            if isinstance(value, dict) and value.get("value") is not None:
                out[key] = value["value"]
        return out


class OCRExtractedField(BaseModel):
    value: str | float | int | None = None
    unit: str | None = None
    confidence: float | None = None
    confirmed: bool = False
    source: str | None = None
    review_status: Literal["missing", "uncertain", "needs_review", "confirmed"] = "needs_review"


class OCRScanResult(BaseModel):
    scan_id: str
    status: str = "review_required"
    filename: str
    extracted_fields: dict[str, OCRExtractedField] = Field(default_factory=dict)
    fields_requiring_review: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    raw_text: str | None = None
    requires_user_review: bool = True


class ConfirmScanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    extracted_fields: dict[str, OCRExtractedField] | None = None
    measurements: SoilMeasurementPayload | None = None
    confirmed: bool

    @model_validator(mode="after")
    def require_fields(self):
        if self.extracted_fields is None and self.measurements is None:
            raise ValueError("extracted_fields or measurements must be provided")
        return self


class ScanJobRead(BaseModel):
    model_config = ConfigDict(extra="allow")

    scan_id: str
    status: str
    filename: str
    extracted_fields: dict[str, Any] = Field(default_factory=dict)
    fields_requiring_review: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    raw_text: str | None = None
    requires_user_review: bool = True


class SoilReportRead(BaseModel):
    model_config = ConfigDict(extra="allow")

    report_id: str
    user_id: str
    status: Literal["completed", "pending", "failed"]
    field_id: str | None = None
    field_name: str | None = None
    field_size: float | None = None
    field_size_unit: str | None = None
    crop: str | None = None
    farmer_name: str | None = None
    measurements: dict[str, Any] = Field(default_factory=dict)
    analysis: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str


class FarmerPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    full_name: str | None = None
    state: str | None = None
    district: str | None = None
    preferred_language: str | None = None


class AnalysisFieldPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str | None = None
    name: str | None = None
    size: float | None = Field(default=None, gt=0)
    size_unit: Literal["acre", "hectare", "bigha"] | None = None
    current_crop: str | None = None
    intended_crop: str | None = None
    state: str | None = None
    district: str | None = None


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    farmer: FarmerPayload | None = None
    field: AnalysisFieldPayload | None = None
    field_id: str | None = None
    measurements: SoilMeasurementPayload
    crop: str | None = None
    intended_crop: str | None = None
    field_size: float | None = None
    field_size_unit: str | None = None
    test_date: date | None = None
    language: str = "en"
    reference: str | None = None

    @model_validator(mode="before")
    @classmethod
    def accept_frontend_request(cls, value):
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        field_data = normalized.get("field")
        if isinstance(field_data, dict):
            normalized.setdefault("field_id", field_data.get("id"))
            normalized.setdefault("crop", field_data.get("current_crop"))
            normalized.setdefault("intended_crop", field_data.get("intended_crop"))
            normalized.setdefault("field_size", field_data.get("size"))
            normalized.setdefault("field_size_unit", field_data.get("size_unit"))
        measurements = normalized.get("measurements")
        if "test_date" not in normalized and isinstance(measurements, dict):
            normalized["test_date"] = measurements.get("test_date")
        return normalized

    @field_validator("field_size")
    @classmethod
    def field_size_positive(cls, value: float | None) -> float | None:
        if value is not None and value <= 0:
            raise ValueError("field_size must be greater than zero when supplied")
        return value
