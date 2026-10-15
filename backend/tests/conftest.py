import os

import pytest

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

from fastapi.testclient import TestClient

from app.main import app
from app.repositories.sqlite_repo import repository


@pytest.fixture(autouse=True)
def isolate_database(tmp_path, monkeypatch):
	monkeypatch.setattr(repository, "db_path", tmp_path / "soil2action-test.db")


client = TestClient(app, raise_server_exceptions=False)
