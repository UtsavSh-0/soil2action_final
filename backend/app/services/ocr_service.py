from __future__ import annotations

import io
import math
import re
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any
from uuid import uuid4

import fitz
import pytesseract
from fastapi import UploadFile
from PIL import Image, ImageOps
from starlette.concurrency import run_in_threadpool

from app.core.config import settings


VALUE_RE = re.compile(r"(-?\d+(?:\.\d+)?)")


class OCRProvider(ABC):
    @abstractmethod
    async def scan_file(self, upload: UploadFile) -> dict[str, Any]:
        raise NotImplementedError


class OCRService(OCRProvider):
    def __init__(self, language: str | None = None) -> None:
        self.language = language or settings.OCR_LANGUAGE

    def _ensure_tesseract(self) -> None:
        command = pytesseract.pytesseract.tesseract_cmd
        if shutil.which("tesseract") is None and (not command or not Path(command).is_file()):
            raise RuntimeError("Tesseract is not installed or not on PATH")

    def _normalize_text(self, text: str) -> str:
        return re.sub(r"\s+", " ", text or "").strip()

    def _safe_float(self, value: str) -> float | None:
        try:
            parsed = float(value)
            if not math.isfinite(parsed):
                return None
            return parsed
        except ValueError:
            return None

    def _label_value(self, text: str, key_names: list[str], description: str) -> tuple[float | None, str | None, float]:
        for label in key_names:
            pattern = re.compile(rf"(?i){re.escape(label)}\s*[:=]?\s*([\d]+(?:\.\d+)?)\s*(?:%|kg/ha|kg/ha|kg|ppm|dS/m|pH|mmho/cm|mg/kg)?")
            match = pattern.search(text)
            if match:
                value = self._safe_float(match.group(1))
                if value is not None:
                    return value, description, 0.7
        return None, None, 0.0

    def _parse_extracted_values(self, raw_text: str) -> dict[str, dict[str, Any]]:
        normalized = self._normalize_text(raw_text)
        extracted: dict[str, dict[str, Any]] = {}
        for field_name, labels, unit in [
            ("ph", ["pH", "ph"], "pH"),
            ("electrical_conductivity", ["EC", "Electrical Conductivity", "electrical conductivity"], "dS/m"),
            ("organic_carbon", ["Organic Carbon", "OC", "organic carbon"], "%"),
            ("available_nitrogen", ["Available N", "Available Nitrogen", "Nitrogen"], "kg/ha"),
            ("available_phosphorus", ["Available P", "Available Phosphorus", "Phosphorus"], "kg/ha"),
            ("available_potassium", ["Available K", "Available Potassium", "Potassium"], "kg/ha"),
            ("sulfur", ["Sulfur", "S"], "kg/ha"),
            ("zinc", ["Zinc", "Zn"], "ppm"),
            ("iron", ["Iron", "Fe"], "ppm"),
            ("manganese", ["Manganese", "Mn"], "ppm"),
            ("copper", ["Copper", "Cu"], "ppm"),
            ("boron", ["Boron", "B"], "ppm"),
        ]:
            value, _, confidence = self._label_value(normalized, labels, unit)
            if value is not None:
                extracted[field_name] = {"value": value, "unit": unit, "confidence": confidence, "confirmed": False, "source": "ocr"}
        return extracted

    def _image_to_text(self, image_bytes: bytes) -> str:
        try:
            with Image.open(io.BytesIO(image_bytes)) as opened:
                image = ImageOps.exif_transpose(opened).convert("RGB")
        except (OSError, ValueError) as exc:
            raise ValueError("The image could not be decoded") from exc
        self._ensure_tesseract()
        try:
            return pytesseract.image_to_string(image, lang=self.language)
        except Exception as exc:  # pragma: no cover - error path
            raise RuntimeError(f"OCR processing failed: {exc}") from exc

    def _pdf_to_text(self, pdf_bytes: bytes) -> str:
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as exc:  # pragma: no cover
            raise ValueError("The PDF could not be opened or is malformed") from exc
        try:
            if doc.is_encrypted:
                raise ValueError("Encrypted PDFs are not supported")
            pages = min(len(doc), 3)
            text_chunks: list[str] = []
            for index in range(pages):
                page = doc[index]
                text = page.get_text("text")
                if text and text.strip():
                    text_chunks.append(text)
                    continue
                self._ensure_tesseract()
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                try:
                    text_chunks.append(pytesseract.image_to_string(image, lang=self.language))
                except Exception as exc:  # pragma: no cover - OCR binary error path
                    raise RuntimeError("OCR processing failed; check the local Tesseract installation") from exc
            return "\n".join(text_chunks)
        finally:
            doc.close()

    def _validate_upload(self, filename: str | None, content: bytes) -> tuple[str, str]:
        if not filename:
            raise ValueError("The uploaded file is missing a filename")
        file_lower = filename.lower()
        if file_lower.endswith((".jpg", ".jpeg", ".png")):
            signature = content[:8]
            if file_lower.endswith(".png") and not signature.startswith(b"\x89PNG"):
                raise ValueError("The PNG file is invalid")
            if file_lower.endswith((".jpg", ".jpeg")) and not signature.startswith(b"\xff\xd8\xff"):
                raise ValueError("The JPG file is invalid")
            return file_lower, "image"
        if file_lower.endswith(".pdf"):
            if not content.startswith(b"%PDF"):
                raise ValueError("The PDF file is invalid")
            return file_lower, "pdf"
        raise ValueError("Unsupported file type. Upload JPG, PNG, or PDF files only")

    async def scan_file(self, upload: UploadFile) -> dict[str, Any]:
        content = await upload.read(settings.max_upload_bytes + 1)
        if len(content) > settings.max_upload_bytes:
            raise ValueError(f"Uploaded file exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB limit")
        filename = (upload.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
        filename, file_type = self._validate_upload(filename, content)
        return await run_in_threadpool(self._scan_content, filename, file_type, content)

    def _scan_content(self, filename: str, file_type: str, content: bytes) -> dict[str, Any]:
        warnings: list[str] = []
        text = ""
        if file_type == "image":
            text = self._image_to_text(content)
        elif file_type == "pdf":
            text = self._pdf_to_text(content)
        normalized_text = self._normalize_text(text)
        extracted_fields = self._parse_extracted_values(normalized_text)
        if not extracted_fields:
            warnings.append("No soil parameters were confidently recognized from the uploaded document.")
        result = {
            "scan_id": str(uuid4()),
            "status": "review_required",
            "filename": filename,
            "detected_file_type": file_type,
            "extracted_fields": extracted_fields,
            "warnings": warnings,
            "raw_text": normalized_text[:7500],
            "requires_user_review": True,
        }
        return result
