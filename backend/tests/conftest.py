import sys
import os
import pytest
from fastapi.testclient import TestClient

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.app.main import app
from backend.app.db.session import SessionLocal, engine
from backend.app.db.init_db import init_development_passwords
from backend.app.models.models import User, Course, Enrollment, Assignment, Quiz


@pytest.fixture(scope="session")
def client():
    database_name = engine.url.database or ""
    if not database_name.lower().startswith("universitylms_test_"):
        pytest.fail(
            "Integration tests require an isolated SQL Server database named UniversityLms_Test_<id>; "
            "the configured database will not be modified.",
            pytrace=False,
        )
    # Ensure demo passwords initialized
    db = SessionLocal()
    init_development_passwords(db)
    db.close()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def admin_token(client):
    response = client.post("/api/auth/login", json={
        "email": "admin@university.edu.vn",
        "password": "Demo@123"
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="session")
def lecturer1_token(client):
    response = client.post("/api/auth/login", json={
        "email": "lecturer1@university.edu.vn",
        "password": "Demo@123"
    })
    assert response.status_code == 200, f"Lecturer1 login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="session")
def lecturer2_token(client):
    response = client.post("/api/auth/login", json={
        "email": "lecturer2@university.edu.vn",
        "password": "Demo@123"
    })
    assert response.status_code == 200, f"Lecturer2 login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="session")
def student1_token(client):
    response = client.post("/api/auth/login", json={
        "email": "student1@university.edu.vn",
        "password": "Demo@123"
    })
    assert response.status_code == 200, f"Student1 login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="session")
def student2_token(client):
    response = client.post("/api/auth/login", json={
        "email": "student2@university.edu.vn",
        "password": "Demo@123"
    })
    assert response.status_code == 200, f"Student2 login failed: {response.text}"
    return response.json()["access_token"]
