from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.repositories.sqlite_repo import SQLiteRepository
from app.schemas.soil import AnalyzeRequest, SoilMeasurementPayload
from app.services.recommendation_service import RecommendationService


PARAMETER_LABELS = {
    "ph": "pH",
    "electrical_conductivity": "Electrical conductivity",
    "organic_carbon": "Organic carbon",
    "available_nitrogen": "Available nitrogen",
    "available_phosphorus": "Available phosphorus",
    "available_potassium": "Available potassium",
    "sulfur": "Sulfur",
    "zinc": "Zinc",
    "iron": "Iron",
    "manganese": "Manganese",
    "copper": "Copper",
    "boron": "Boron",
}


class SoilAnalysisService:
    def __init__(self, repository: SQLiteRepository) -> None:
        self.repository = repository
        self.recommendation_service = RecommendationService()

    def _measurement_value(self, measurement: Any) -> float | None:
        if measurement is None:
            return None
        if isinstance(measurement, dict):
            value = measurement.get("value")
            return float(value) if value is not None else None
        if isinstance(measurement, (int, float)):
            return float(measurement)
        return None

    def analyze(self, user_id: str, payload: AnalyzeRequest, field_id: str | None = None) -> dict[str, Any]:
        measurements = payload.measurements
        valid_values = {
            key: value
            for key, measurement in measurements.model_dump(exclude_none=True).items()
            if (value := self._measurement_value(measurement)) is not None
        }
        missing = [name for name in PARAMETER_LABELS if name not in valid_values]
        nutrient_status: dict[str, Any] = {}
        observations: list[str] = []
        warnings: list[str] = []
        if measurements.ph and measurements.ph.value is not None:
            ph = float(measurements.ph.value)
            if ph < 5.5:
                nutrient_status["ph"] = {"status": "acidic", "value": ph, "label": "pH"}
                observations.append("The soil is acidic and may need liming before sensitive crops are grown.")
            elif ph > 8.5:
                nutrient_status["ph"] = {"status": "alkaline", "value": ph, "label": "pH"}
                observations.append("The soil is alkaline; micronutrient availability may be reduced.")
            else:
                nutrient_status["ph"] = {"status": "neutral", "value": ph, "label": "pH"}
        if measurements.electrical_conductivity and measurements.electrical_conductivity.value is not None:
            ec = float(measurements.electrical_conductivity.value)
            if ec > 4.0:
                nutrient_status["electrical_conductivity"] = {"status": "high", "value": ec, "label": "Electrical conductivity"}
                observations.append("Electrical conductivity is elevated, so salinity management should be checked.")
            else:
                nutrient_status["electrical_conductivity"] = {"status": "optimal", "value": ec, "label": "Electrical conductivity"}

        if measurements.organic_carbon and measurements.organic_carbon.value is not None:
            oc = float(measurements.organic_carbon.value)
            if oc < 0.5:
                nutrient_status["organic_carbon"] = {"status": "low", "value": oc, "label": "Organic carbon"}
                observations.append("Organic carbon is low and soil structure and water retention may be weaker.")
            else:
                nutrient_status["organic_carbon"] = {"status": "optimal", "value": oc, "label": "Organic carbon"}

        if not valid_values:
            warnings.append("No measurement values were supplied. The analysis is limited to a check for missing information.")

        recommendations = self.recommendation_service.generate(
            valid_values,
            payload.crop or payload.intended_crop or (payload.field.current_crop if payload.field else None),
            language=(payload.language or "en"),
        ) if valid_values else []
        field = payload.field.model_dump(exclude_none=True) if payload.field else None
        farmer = payload.farmer.model_dump(exclude_none=True) if payload.farmer else None
        frontend_measurements = {
            "ph": measurements.ph.value if measurements.ph else None,
            "electrical_conductivity": measurements.electrical_conductivity.value if measurements.electrical_conductivity else None,
            "organic_carbon": measurements.organic_carbon.value if measurements.organic_carbon else None,
            "nitrogen": measurements.available_nitrogen.value if measurements.available_nitrogen else None,
            "phosphorus": measurements.available_phosphorus.value if measurements.available_phosphorus else None,
            "potassium": measurements.available_potassium.value if measurements.available_potassium else None,
            "nutrient_unit": (
                measurements.available_nitrogen.unit if measurements.available_nitrogen else "kg/ha"
            ),
            "micronutrient_unit": measurements.zinc.unit if measurements.zinc else "ppm",
            "micronutrients": {
                "zinc": measurements.zinc.value if measurements.zinc else None,
                "iron": measurements.iron.value if measurements.iron else None,
                "manganese": measurements.manganese.value if measurements.manganese else None,
                "copper": measurements.copper.value if measurements.copper else None,
                "boron": measurements.boron.value if measurements.boron else None,
                "sulphur": measurements.sulfur.value if measurements.sulfur else None,
            },
            "test_date": payload.test_date.isoformat() if payload.test_date else None,
        }
        parameters: list[dict[str, Any]] = []
        for key, measurement in measurements.model_dump(exclude_none=True).items():
            if not isinstance(measurement, dict) or measurement.get("value") is None:
                continue
            assessment = nutrient_status.get(key, {})
            parameters.append(
                {
                    "key": key,
                    "label": PARAMETER_LABELS.get(key, key),
                    "value": measurement["value"],
                    "unit": measurement.get("unit"),
                    "status": assessment.get("status", "unknown"),
                }
            )
        analysis_result = {
            "report_id": str(uuid4()),
            "overall_assessment": {
                "label": "Review indicated parameters" if nutrient_status else "Limited assessment",
                "summary": " ".join(observations) if observations else " ".join(warnings),
            },
            "parameters": parameters,
            "concerns": observations,
            "crop_guidance": [],
            "recommendations": recommendations,
            "missing_information": missing,
            "limitations": warnings,
        }
        report = {
            **analysis_result,
            "field_id": field_id,
            "status": "completed",
            "crop": payload.crop or payload.intended_crop or (field or {}).get("current_crop") or "unknown",
            "field_size": payload.field_size,
            "field_size_unit": payload.field_size_unit,
            "measurement_summary": {
                "total_measured_parameters": len(valid_values),
                "parameters_measured": list(valid_values.keys()),
            },
            "nutrient_status": nutrient_status,
            "observations": observations or ["The available measurements do not show a strong immediate deficiency."] ,
            "recommendations": recommendations,
            "missing_information": missing,
            "warnings": warnings,
            "sources": ["The analysis follows conservative agronomic interpretation rules and is not a substitute for lab confirmation."],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "measurements": frontend_measurements,
            "analysis": analysis_result,
        }
        return self.repository.save_analysis(
            user_id,
            report,
            farmer=farmer,
            field=field,
            soil_measurements=frontend_measurements,
            test_date=payload.test_date.isoformat() if payload.test_date else None,
        )
