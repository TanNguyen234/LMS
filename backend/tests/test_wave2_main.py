from pathlib import Path
from types import SimpleNamespace
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app.core.config import DEFAULT_DEMO_JWT_SECRET


def _build_spa_test_client(tmp_path: Path) -> TestClient:
    dist_dir = tmp_path / "dist"
    assets_dir = dist_dir / "assets"
    assets_dir.mkdir(parents=True)
    (dist_dir / "index.html").write_text("<html><body>SPA_SHELL</body></html>", encoding="utf-8")
    (dist_dir / "favicon.ico").write_bytes(b"ICO_BYTES")
    (assets_dir / "bundle.js").write_text("console.log('ok');", encoding="utf-8")

    test_app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)

    @test_app.get("/api/ping")
    async def api_ping():
        return {"ok": True}

    main_module.register_spa_routes(test_app, dist_dir)
    return TestClient(test_app)


@pytest.mark.parametrize(
    "missing_path",
    [
        "/missing.pdf",
        "/files/syllabus.PDF",
        "/images/banner.png",
        "/images/avatar.jpg",
        "/images/photo.jpeg",
        "/icons/logo.svg",
        "/chunks/missing.js",
        "/styles/missing.css",
        "/apple-touch-icon.ico",
        "/chunks/bundle.js.map",
        "/fonts/inter.woff2",
        "/manifest.json",
        "/api/non-existent",
        "/api",
        "/uploads/report.pdf",
        "/uploads",
        "/assets/missing.js",
        "/docs/unknown",
        "/openapi.json",
        "/health",
    ],
)
def test_serve_spa_returns_json_404_for_missing_assets_and_reserved_paths(
    tmp_path: Path, missing_path: str
):
    client = _build_spa_test_client(tmp_path)
    response = client.get(missing_path)
    assert response.status_code == 404
    assert "SPA_SHELL" not in response.text
    if not missing_path.startswith("/assets/"):
        assert response.headers["content-type"].startswith("application/json")
        assert response.json() == {"detail": "Not found"}


def test_serve_spa_serves_real_files_and_valid_spa_routes(tmp_path: Path):
    client = _build_spa_test_client(tmp_path)

    api_resp = client.get("/api/ping")
    assert api_resp.status_code == 200
    assert api_resp.json() == {"ok": True}

    ico_resp = client.get("/favicon.ico")
    assert ico_resp.status_code == 200
    assert ico_resp.content == b"ICO_BYTES"

    js_resp = client.get("/assets/bundle.js")
    assert js_resp.status_code == 200
    assert "console.log('ok')" in js_resp.text

    for spa_route in [
        "/",
        "/dashboard",
        "/courses/CS101",
        "/courses/CS101/assignments/ASG-1",
        "/users/release.v1.0",
    ]:
        spa_resp = client.get(spa_route)
        assert spa_resp.status_code == 200
        assert "SPA_SHELL" in spa_resp.text


def test_lifespan_logs_warning_and_stays_up_on_transient_db_failure(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
):
    dev_settings = SimpleNamespace(
        APP_ENV="development",
        JWT_SECRET="dev-local-jwt-secret-key-not-used-in-production",
    )
    monkeypatch.setattr(main_module, "settings", dev_settings)

    def broken_session_factory():
        raise RuntimeError("transient sql connection error")

    monkeypatch.setattr(main_module, "SessionLocal", broken_session_factory)

    lifespan_app = FastAPI(lifespan=main_module.lifespan)

    @lifespan_app.get("/probe")
    async def probe():
        return {"status": "alive"}

    with caplog.at_level(logging.WARNING):
        with TestClient(lifespan_app) as client:
            resp = client.get("/probe")
            assert resp.status_code == 200
            assert resp.json() == {"status": "alive"}

    assert any("Skipping development password warmup during startup" in rec.message for rec in caplog.records)


def test_lifespan_logs_warning_and_closes_session_when_password_warmup_raises(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
):
    dev_settings = SimpleNamespace(
        APP_ENV="development",
        JWT_SECRET="dev-local-jwt-secret-key-not-used-in-production",
    )
    monkeypatch.setattr(main_module, "settings", dev_settings)

    state = {"closed": False}

    class DummySession:
        def close(self):
            state["closed"] = True

    monkeypatch.setattr(main_module, "SessionLocal", lambda: DummySession())

    def failing_init(_db):
        raise RuntimeError("warmup timeout")

    monkeypatch.setattr(main_module, "init_development_passwords", failing_init)

    lifespan_app = FastAPI(lifespan=main_module.lifespan)

    @lifespan_app.get("/probe")
    async def probe():
        return {"status": "alive"}

    with caplog.at_level(logging.WARNING):
        with TestClient(lifespan_app) as client:
            assert client.get("/probe").status_code == 200

    assert state["closed"] is True
    assert any("warmup timeout" in rec.message for rec in caplog.records)


@pytest.mark.parametrize("bad_secret", [DEFAULT_DEMO_JWT_SECRET, "short", "change-me"])
def test_lifespan_fails_fast_on_weak_production_jwt_secret(
    monkeypatch: pytest.MonkeyPatch, bad_secret: str
):
    prod_settings = SimpleNamespace(
        APP_ENV="production",
        JWT_SECRET=bad_secret,
    )
    monkeypatch.setattr(main_module, "settings", prod_settings)

    db_called = {"value": False}

    def fail_if_called():
        db_called["value"] = True
        raise AssertionError("SessionLocal should not be called when JWT validation fails")

    monkeypatch.setattr(main_module, "SessionLocal", fail_if_called)

    lifespan_app = FastAPI(lifespan=main_module.lifespan)
    with pytest.raises(RuntimeError):
        with TestClient(lifespan_app):
            pass

    assert db_called["value"] is False
