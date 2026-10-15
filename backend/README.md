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
