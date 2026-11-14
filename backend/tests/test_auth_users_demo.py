"""Wave 1 (admin-demo-dev): auth by code, profile/password, demo switch, user admin hardening, CSV import."""
import uuid

import pytest

from backend.app.core.config import settings
from backend.app.db.session import SessionLocal
from backend.app.models.models import User

DEMO_PASSWORD = "Demo@123"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_user(client, admin_token, **overrides) -> dict:
    suffix = uuid.uuid4().hex[:10]
    payload = {
        "email": f"w1admin-{suffix}@example.edu.vn",
        "fullName": "Người dùng kiểm thử",
        "role": "STUDENT",
        "password": "TestPass123",
    }
    payload.update(overrides)
    resp = client.post("/api/users", headers=_auth(admin_token), json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _delete_users_by_emails(emails):
    if not emails:
        return
    with SessionLocal() as db:
        db.query(User).filter(User.Email.in_(list(emails))).delete(synchronize_session=False)
        db.commit()


# ---------------------------------------------------------------------------
# Password byte limits -> 422 (never 500 / never silently ignored)
# ---------------------------------------------------------------------------


def test_create_user_with_73_byte_password_returns_422(client, admin_token):
    resp = client.post(
        "/api/users",
        headers=_auth(admin_token),
        json={
            "email": f"w1admin-long-{uuid.uuid4().hex[:8]}@example.edu.vn",
            "fullName": "Mật khẩu dài",
            "role": "STUDENT",
            "password": "a" * 73,
        },
    )
    assert resp.status_code == 422, resp.text


def test_update_user_with_5_char_password_returns_422(client, admin_token):
    created = _create_user(client, admin_token)
    try:
        resp = client.put(
            f"/api/users/{created['userId']}",
            headers=_auth(admin_token),
            json={"password": "12345"},
        )
        assert resp.status_code == 422, resp.text
    finally:
        _delete_users_by_emails([created["email"]])


def test_admin_can_reset_password_and_change_codes(client, admin_token):
    code = f"SVT{uuid.uuid4().hex[:6].upper()}"
    created = _create_user(client, admin_token)
    try:
        resp = client.put(
            f"/api/users/{created['userId']}",
            headers=_auth(admin_token),
            json={"password": "NewPass456", "studentCode": code, "role": "student"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["studentCode"] == code
        login = client.post("/api/auth/login", json={"identifier": code, "password": "NewPass456"})
        assert login.status_code == 200, login.text
    finally:
        _delete_users_by_emails([created["email"]])


def test_duplicate_student_code_is_rejected_with_409(client, admin_token):
    code = f"SVD{uuid.uuid4().hex[:6].upper()}"
    first = _create_user(client, admin_token, studentCode=code)
    try:
        resp = client.post(
            "/api/users",
            headers=_auth(admin_token),
            json={
                "email": f"w1admin-dup-{uuid.uuid4().hex[:8]}@example.edu.vn",
                "fullName": "Trùng mã",
                "role": "STUDENT",
                "password": "TestPass123",
                "studentCode": code,
            },
        )
        assert resp.status_code == 409, resp.text
    finally:
        _delete_users_by_emails([first["email"]])


# ---------------------------------------------------------------------------
# Admin self-protection
# ---------------------------------------------------------------------------


def test_admin_cannot_lock_or_demote_self(client, admin_token):
    me = client.get("/api/auth/me", headers=_auth(admin_token)).json()
    admin_id = me["userId"]

    lock = client.patch(f"/api/users/{admin_id}/status", headers=_auth(admin_token), json={"isActive": False})
    assert lock.status_code == 400, lock.text

    lock_via_put = client.put(f"/api/users/{admin_id}", headers=_auth(admin_token), json={"isActive": False})
    assert lock_via_put.status_code == 400, lock_via_put.text

    demote = client.put(f"/api/users/{admin_id}", headers=_auth(admin_token), json={"role": "STUDENT"})
    assert demote.status_code == 400, demote.text

    still_admin = client.get("/api/auth/me", headers=_auth(admin_token)).json()
    assert still_admin["role"] == "ADMIN"
    assert still_admin["isActive"] is True


# ---------------------------------------------------------------------------
# Login by code, profile, change password
# ---------------------------------------------------------------------------


def test_login_with_student_code_and_staff_code(client):
    by_student_code = client.post("/api/auth/login", json={"identifier": "SV001", "password": DEMO_PASSWORD})
    assert by_student_code.status_code == 200, by_student_code.text
    assert by_student_code.json()["user"]["email"] == "student1@university.edu.vn"

    by_staff_code = client.post("/api/auth/login", json={"identifier": "gv001", "password": DEMO_PASSWORD})
    assert by_staff_code.status_code == 200, by_staff_code.text
    assert by_staff_code.json()["user"]["role"] == "LECTURER"

    legacy_email = client.post("/api/auth/login", json={"email": "SV001", "password": DEMO_PASSWORD})
    assert legacy_email.status_code == 200, legacy_email.text

    missing = client.post("/api/auth/login", json={"password": DEMO_PASSWORD})
    assert missing.status_code == 422, missing.text

    wrong = client.post("/api/auth/login", json={"identifier": "SV001", "password": "WrongPass!1"})
    assert wrong.status_code == 401


def test_profile_update_and_change_password_flow(client, admin_token):
    created = _create_user(client, admin_token, password="OldPass123")
    try:
        login = client.post("/api/auth/login", json={"identifier": created["email"], "password": "OldPass123"})
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]

        me = client.get("/api/auth/me", headers=_auth(token))
        assert me.status_code == 200
        assert me.json()["userId"] == created["userId"]

        profile = client.put("/api/auth/me", headers=_auth(token), json={"fullName": "  Tên mới đầy đủ  "})
        assert profile.status_code == 200, profile.text
        assert profile.json()["fullName"] == "Tên mới đầy đủ"

        wrong_current = client.post(
            "/api/auth/change-password",
            headers=_auth(token),
            json={"currentPassword": "NotMyPass1", "newPassword": "BrandNew123"},
        )
        assert wrong_current.status_code == 400, wrong_current.text

        too_long = client.post(
            "/api/auth/change-password",
            headers=_auth(token),
            json={"currentPassword": "OldPass123", "newPassword": "b" * 73},
        )
        assert too_long.status_code == 422, too_long.text

        ok = client.post(
            "/api/auth/change-password",
            headers=_auth(token),
            json={"currentPassword": "OldPass123", "newPassword": "BrandNew123"},
        )
        assert ok.status_code == 200, ok.text

        old_login = client.post("/api/auth/login", json={"identifier": created["email"], "password": "OldPass123"})
        assert old_login.status_code == 401
        new_login = client.post("/api/auth/login", json={"identifier": created["email"], "password": "BrandNew123"})
        assert new_login.status_code == 200
    finally:
        _delete_users_by_emails([created["email"]])


# ---------------------------------------------------------------------------
# Demo accounts / demo switch
# ---------------------------------------------------------------------------


def test_demo_accounts_and_switch_in_development(client, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "development")
    accounts = client.get("/api/auth/demo-accounts")
    assert accounts.status_code == 200, accounts.text
    items = accounts.json()
    roles = {item["role"] for item in items}
    assert {"ADMIN", "LECTURER", "STUDENT"} <= roles
    assert all(item["email"].endswith("@university.edu.vn") for item in items)

    switched = client.post("/api/auth/demo-switch", json={"email": "lecturer1@university.edu.vn"})
    assert switched.status_code == 200, switched.text
    body = switched.json()
    assert body["access_token"]
    assert body["user"]["email"] == "lecturer1@university.edu.vn"
    me = client.get("/api/auth/me", headers=_auth(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["role"] == "LECTURER"


def test_demo_switch_rejects_non_demo_email(client, admin_token, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "development")
    outsider = _create_user(client, admin_token)
    try:
        resp = client.post("/api/auth/demo-switch", json={"email": outsider["email"]})
        assert resp.status_code in (403, 404), resp.text
        seeded_but_not_listed = client.post("/api/auth/demo-switch", json={"email": "student9@university.edu.vn"})
        assert seeded_but_not_listed.status_code in (403, 404), seeded_but_not_listed.text
    finally:
        _delete_users_by_emails([outsider["email"]])


def test_demo_endpoints_hidden_in_production(client, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "development")
    assert client.post("/api/auth/demo-switch", json={"email": "admin@university.edu.vn"}).status_code == 200

    monkeypatch.setattr(settings, "APP_ENV", "production")
    assert client.get("/api/auth/demo-accounts").status_code == 404
    assert client.post("/api/auth/demo-switch", json={"email": "admin@university.edu.vn"}).status_code == 404


# ---------------------------------------------------------------------------
# CSV import
# ---------------------------------------------------------------------------


def test_import_csv_reports_created_skipped_errors(client, admin_token):
    suffix = uuid.uuid4().hex[:8]
    new_email = f"csv-new-{suffix}@example.edu.vn"
    lecturer_email = f"csv-gv-{suffix}@example.edu.vn"
    csv_text = (
        "email,fullName,role,studentCode,staffCode,password\n"
        f"{new_email},Nguyễn Văn Nhập,student,SVC{suffix[:5].upper()},,Import123\n"
        f"{lecturer_email},Trần Thị Giảng,LECTURER,,GVC{suffix[:5].upper()},\n"
        "admin@university.edu.vn,Trùng Admin,ADMIN,,,Import123\n"
        f"{new_email},Trùng trong tệp,STUDENT,,,Import123\n"
        "not-an-email,Sai Email,STUDENT,,,Import123\n"
        f"bad-role-{suffix}@example.edu.vn,Sai vai trò,GUEST,,,Import123\n"
        f"short-pw-{suffix}@example.edu.vn,Mật khẩu ngắn,STUDENT,,,123\n"
    )
    content = ("\ufeff" + csv_text).encode("utf-8")
    try:
        resp = client.post(
            "/api/users/import-csv",
            headers=_auth(admin_token),
            files={"file": ("users.csv", content, "text/csv")},
        )
        assert resp.status_code == 200, resp.text
        report = resp.json()
        assert report["created"] == 2
        assert report["skipped"] == 2
        assert len(report["errors"]) == 3
        error_rows = sorted(item["row"] for item in report["errors"])
        assert error_rows == [6, 7, 8]
        assert all(item["message"] for item in report["errors"])

        login = client.post("/api/auth/login", json={"identifier": new_email, "password": "Import123"})
        assert login.status_code == 200, login.text
        lecturer_login = client.post(
            "/api/auth/login", json={"identifier": lecturer_email, "password": DEMO_PASSWORD}
        )
        assert lecturer_login.status_code == 200, lecturer_login.text
        assert lecturer_login.json()["user"]["fullName"] == "Trần Thị Giảng"
    finally:
        _delete_users_by_emails([new_email, lecturer_email])


def test_import_csv_rejects_missing_columns_and_bad_encoding(client, admin_token):
    missing = client.post(
        "/api/users/import-csv",
        headers=_auth(admin_token),
        files={"file": ("users.csv", b"email,password\na@b.vn,123456\n", "text/csv")},
    )
    assert missing.status_code == 400, missing.text

    bad_encoding = client.post(
        "/api/users/import-csv",
        headers=_auth(admin_token),
        files={"file": ("users.csv", "email,fullName,role\nx@y.vn,Tên,STUDENT\n".encode("utf-16"), "text/csv")},
    )
    assert bad_encoding.status_code == 400, bad_encoding.text


# ---------------------------------------------------------------------------
# Server-side pagination / filtering
# ---------------------------------------------------------------------------


def test_user_pagination_total_and_filters(client, admin_token):
    marker = f"pgmark{uuid.uuid4().hex[:6]}"
    emails = []
    try:
        for idx in range(3):
            created = _create_user(
                client,
                admin_token,
                email=f"{marker}-{idx}@example.edu.vn",
                fullName=f"Phân trang {marker} {idx}",
                role="LECTURER" if idx == 0 else "STUDENT",
            )
            emails.append(created["email"])

        with SessionLocal() as db:
            expected_total = db.query(User).count()
            expected_students = db.query(User).filter(User.Role == "STUDENT").count()

        page1 = client.get("/api/users?page=1&pageSize=5", headers=_auth(admin_token)).json()
        assert page1["total"] == expected_total
        assert len(page1["items"]) == 5

        students = client.get("/api/users?role=student&pageSize=1", headers=_auth(admin_token)).json()
        assert students["total"] == expected_students

        searched = client.get(f"/api/users?search={marker}&pageSize=2&page=2", headers=_auth(admin_token)).json()
        assert searched["total"] == 3
        assert len(searched["items"]) == 1

        searched_lecturer = client.get(
            f"/api/users?search={marker}&role=LECTURER", headers=_auth(admin_token)
        ).json()
        assert searched_lecturer["total"] == 1

        inactive = client.get(f"/api/users?search={marker}&status=inactive", headers=_auth(admin_token)).json()
        assert inactive["total"] == 0
        active = client.get(f"/api/users?search={marker}&status=ACTIVE", headers=_auth(admin_token)).json()
        assert active["total"] == 3

        by_code = client.get("/api/users?search=SV001", headers=_auth(admin_token)).json()
        assert any(item["studentCode"] == "SV001" for item in by_code["items"])
    finally:
        _delete_users_by_emails(emails)


@pytest.mark.parametrize("bad_status", ["LOCKEDX"])
def test_user_list_rejects_unknown_status(client, admin_token, bad_status):
    resp = client.get(f"/api/users?status={bad_status}", headers=_auth(admin_token))
    assert resp.status_code == 422, resp.text
