# Soil2Action local backend

The FastAPI backend stores fields, soil reports, farmer metadata, and OCR scan jobs in a local SQLite database. It does not require a database server or cloud account. The development API has no user authentication and is intended for local use only; do not expose it to a network or the public internet.

## Windows PowerShell setup

From the repository root:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that terminal and activate again. The application uses `DATABASE_PATH=data/soil2action.db` by default; the directory and database are created automatically. An existing `.env` does not need to be replaced. The `DATABASE_PATH` setting may be an absolute path or a path relative to `backend`.

Start FastAPI from the `backend` directory:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open the API documentation at [http://localhost:8000/docs](http://localhost:8000/docs). The local database is at `backend/data/soil2action.db` by default. `backend/data/` is ignored by Git so local records are not committed.

## OCR prerequisites

Python dependencies for images and PDFs are installed from `requirements.txt`. Image OCR also requires the Tesseract executable installed locally and available on `PATH`. Without it, `/api/soil/scan` returns an OCR setup error; no scan result is fabricated. Text-based PDFs can still be read by PyMuPDF, while scanned PDFs need Tesseract.

On Windows, either install Tesseract OCR from an elevated PowerShell with Chocolatey:

```powershell
choco install tesseract -y
tesseract --version
```

Or use a Windows installer listed by the [Tesseract project documentation](https://tesseract-ocr.github.io/tessdoc/Downloads.html). Reopen PowerShell after installation so PATH is refreshed. If it is installed in the usual location but not on PATH, set `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe` in `backend/.env`, then restart FastAPI. If language files are stored separately, set `TESSDATA_PREFIX` to the directory containing the selected `*.traineddata` files. `OCR_LANGUAGE=eng` selects English; install the matching Tesseract language data before setting a different language.

## Soil Health Card scanner

Open `/scan` in the frontend to capture a still frame from the browser camera or choose a JPG, PNG, or PDF (maximum 10 MB). Camera access requires `localhost` or HTTPS and browser permission. On mobile, the rear camera is preferred when available; the camera switch control appears when multiple cameras are available. The preview stays in the browser until the user selects **Extract text**. A framing guide is provided for manual capture; automatic card-boundary detection is not implemented.

The backend validates file content, reads embedded PDF text when available, and uses local Tesseract OCR for images and scanned PDF pages. It extracts candidate fields with source context and OCR confidence where available. Values stay unconfirmed until edited or reviewed and confirmed. The raw text and extraction record are stored in SQLite. This scanner performs extraction only: confirmation does not run soil analysis or create recommendations. To test, run the backend and frontend, open `http://localhost:5173/scan`, and upload an actual card image or PDF. OCR accuracy depends on image quality, language data, and card layout; inspect and correct the result before confirming it.

## Tests

From the `backend` directory with the virtual environment active:

```powershell
python -m pytest -q
```

Tests use a separate temporary SQLite database. They do not delete or overwrite `data/soil2action.db`.

## Backup and restore

Stop the API before copying the database. From the repository root, create a dated backup:

```powershell
Copy-Item .\backend\data\soil2action.db .\soil2action-backup.db
```

To restore, stop the API and copy the backup over the local database:

```powershell
Copy-Item .\soil2action-backup.db .\backend\data\soil2action.db -Force
```

SQLite files can be inspected with a local GUI such as DB Browser for SQLite. Open `backend/data/soil2action.db`; the GUI is optional and no database service is needed.

## Troubleshooting

- **Database is locked:** close other programs holding the database, stop duplicate backend processes, and retry. SQLite waits up to 10 seconds for a lock; avoid placing the file on a network or synced folder.
- **Permission denied:** ensure the current Windows user can write to `backend/data/`, and check that the database is not open read-only in another application.
- **Database path not found:** run Uvicorn from `backend` and check `DATABASE_PATH` in `backend/.env`. Relative paths are resolved from that backend directory.
- **Port already in use:** use another port, for example `--port 8001`.
- **OCR setup error:** install Tesseract, add its install directory to `PATH`, reopen PowerShell, and retry.
