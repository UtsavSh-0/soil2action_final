from __future__ import annotations

import io
import statistics
import math
import os
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
FIELD_PATTERNS = {
    "ph": (r"\bp\s*h\b", "pH"),
    "electrical_conductivity": (r"\b(?:EC|electrical conductivity)\b", None),
    "organic_carbon": (r"\b(?:OC|organic carbon)\b", None),
    "available_nitrogen": (r"\b(?:available\s+)?nitrogen\b|\bN\b", None),
    "available_phosphorus": (r"\b(?:available\s+)?phosph(?:orus|orous)\b|\bP\b", None),
    "available_potassium": (r"\b(?:available\s+)?potassium\b|\bK\b", None),
    "sulfur": (r"\b(?:sulfur|sulphur)\b|\bS\b", None),
    "zinc": (r"\b(?:zinc|Zn)\b", None), "iron": (r"\b(?:iron|Fe)\b", None),
    "manganese": (r"\b(?:manganese|Mn)\b", None), "copper": (r"\b(?:copper|Cu)\b", None),
    "boron": (r"\b(?:boron|B)\b", None),
    "farmer_name": (r"\b(?:farmer(?:'s)? name|name of farmer)\b", None),
    "card_number": (r"\b(?:soil health card (?:no|number)|card no|report id)\b", None),
    "state": (r"\bstate\b", None), "district": (r"\bdistrict\b", None),
    "block_village": (r"\b(?:block|village)\b", None),
    "sample_date": (r"\b(?:sample collection|sampling) date\b", None),
    "test_date": (r"\b(?:soil test|test) date\b", None),
    "survey_field_id": (r"\b(?:survey|field) (?:no|number|id)\b", None),
}
UNIT_RE = re.compile(r"(?i)(dS\s*/\s*m|mmho\s*/\s*cm|kg\s*/\s*ha|mg\s*/\s*kg|ppm|%)")


class OCRProvider(ABC):
    @abstractmethod
    async def scan_file(self, upload: UploadFile) -> dict[str, Any]:
        raise NotImplementedError


class OCRService(OCRProvider):
    def __init__(self, language: str | None = None) -> None:
        self.language = language or settings.OCR_LANGUAGE
        if settings.TESSERACT_CMD:
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
        if settings.TESSDATA_PREFIX:
            os.environ["TESSDATA_PREFIX"] = settings.TESSDATA_PREFIX

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

    def _parse_extracted_values(self, raw_text: str, confidence: float | dict[int, float] | None = None) -> dict[str, dict[str, Any]]:
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
        extracted: dict[str, dict[str, Any]] = {}
        for name, (label_pattern, default_unit) in FIELD_PATTERNS.items():
            for index, line in enumerate(lines):
                label = re.search(label_pattern, line, re.I)
                if not label:
                    continue
                tail = line[label.end():].strip(" :\t=-")
                line_confidence = confidence.get(index) if isinstance(confidence, dict) else confidence
                is_text_field = name in {"farmer_name", "card_number", "state", "district", "block_village", "sample_date", "test_date", "survey_field_id"}
                if is_text_field:
                    value = tail
                    if not value and index + 1 < len(lines):
                        value = lines[index + 1].strip()
                        if isinstance(confidence, dict):
                            line_confidence = confidence.get(index + 1, line_confidence)
                    if value:
                        extracted[name] = {"value": value, "unit": None, "confidence": line_confidence, "source": line, "confirmed": False, "review_status": "uncertain" if line_confidence is None or line_confidence < 65 else "needs_review"}
                        break
                value_match = re.search(r"[+-]?\d+(?:[.,]\d+)?", tail)
                source = line
                value_context = tail
                if not value_match and index + 1 < len(lines):
                    value_match = re.search(r"[+-]?\d+(?:[.,]\d+)?", lines[index + 1])
                    if value_match:
                        source = f"{line} {lines[index + 1]}"
                        value_context = lines[index + 1][value_match.end():]
                        if isinstance(confidence, dict):
                            following_confidence = confidence.get(index + 1)
                            if following_confidence is not None:
                                line_confidence = (line_confidence + following_confidence) / 2 if line_confidence is not None else following_confidence
                if value_match:
                    unit_match = UNIT_RE.match(value_context[value_match.end():].lstrip())
                    value = value_match.group(0)
                    extracted[name] = {
                        "value": value, "unit": unit_match.group(0) if unit_match else default_unit,
                        "confidence": line_confidence, "source": source, "confirmed": False,
                        "review_status": "uncertain" if line_confidence is None or line_confidence < 65 else "needs_review",
                    }
                    break
        known_patterns = [re.compile(pattern, re.I) for pattern, _ in FIELD_PATTERNS.values()]
        for index, line in enumerate(lines):
            match = re.match(r"^([A-Za-z][A-Za-z /()_-]{1,35})\s*[:=]\s*([+-]?\d+(?:[.,]\d+)?)\s*(.*)$", line)
            if not match or any(pattern.search(match.group(1)) for pattern in known_patterns):
                continue
            label, value, suffix = match.groups()
            key = "other_measurement_" + re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
            if key not in extracted:
                unit = UNIT_RE.match(suffix.strip())
                score = confidence.get(index) if isinstance(confidence, dict) else confidence
                extracted[key] = {
                    "value": value, "unit": unit.group(0) if unit else None, "confidence": score,
                    "source": line, "confirmed": False,
                    "review_status": "uncertain" if score is None or score < 65 else "needs_review",
                }
        return extracted

    def _image_to_text(self, image_bytes: bytes) -> tuple[str, dict[int, float]]:
        try:
            with Image.open(io.BytesIO(image_bytes)) as opened:
                dimensions = opened.width * opened.height
                if dimensions > 25_000_000:
                    raise ValueError("Image dimensions exceed the supported limit")
                image = ImageOps.exif_transpose(opened).convert("RGB")
                image.thumbnail((5000, 5000))
        except ValueError:
            raise
        except OSError as exc:
            raise ValueError("The image could not be decoded") from exc
        self._ensure_tesseract()
        try:
            import cv2
            import numpy as np
            gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
            processed = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11)
            data = pytesseract.image_to_data(processed, lang=self.language, output_type=pytesseract.Output.DICT)
            grouped: dict[tuple[int, int, int], list[tuple[str, float]]] = {}
            order: list[tuple[int, int, int]] = []
            for i, raw_word in enumerate(data["text"]):
                word = str(raw_word).strip()
                if not word:
                    continue
                key = (int(data["block_num"][i]), int(data["par_num"][i]), int(data["line_num"][i]))
                if key not in grouped:
                    grouped[key] = []
                    order.append(key)
                score = float(data["conf"][i])
                grouped[key].append((word, score))
            lines = [" ".join(word for word, _ in grouped[key]) for key in order]
            line_scores = {line_index: statistics.mean(score for _, score in grouped[key] if score >= 0)
                           for line_index, key in enumerate(order) if any(score >= 0 for _, score in grouped[key])}
            return "\n".join(lines), line_scores
        except Exception as exc:  # pragma: no cover - error path
            raise RuntimeError(f"OCR processing failed: {exc}") from exc

    def _pdf_to_text(self, pdf_bytes: bytes) -> tuple[str, float | None]:
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as exc:  # pragma: no cover
            raise ValueError("The PDF could not be opened or is malformed") from exc
        try:
            if doc.is_encrypted:
                raise ValueError("Encrypted PDFs are not supported")
            if len(doc) > 3:
                raise ValueError("PDFs may contain no more than 3 pages")
            pages = len(doc)
            text_chunks: list[str] = []
            for index in range(pages):
                page = doc[index]
                text = page.get_text("text")
                if text and text.strip():
                    text_chunks.append(text)
                    continue
                self._ensure_tesseract()
                if page.rect.width * page.rect.height * 4 > 25_000_000:
                    raise ValueError("PDF page dimensions exceed the supported limit")
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                try:
                    text_chunks.append(pytesseract.image_to_string(image, lang=self.language))
                except Exception as exc:  # pragma: no cover - OCR binary error path
                    raise RuntimeError("OCR processing failed; check the local Tesseract installation") from exc
            return "\n".join(text_chunks), None
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
            text, confidence = self._image_to_text(content)
        elif file_type == "pdf":
            text, confidence = self._pdf_to_text(content)
        preserved_text = "\n".join(line.rstrip() for line in text.splitlines()).strip()[:7500]
        extracted_fields = self._parse_extracted_values(preserved_text, confidence)
        if not extracted_fields:
            warnings.append("No soil parameters were confidently recognized from the uploaded document.")
        result = {
            "scan_id": str(uuid4()),
            "status": "review_required",
            "filename": filename,
            "detected_file_type": file_type,
            "extracted_fields": extracted_fields,
            "warnings": warnings,
            "raw_text": preserved_text,
            "requires_user_review": True,
        }
        return result
