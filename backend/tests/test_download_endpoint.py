from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_download_sample_users_xlsx():
    response = client.get("/api/download", params={
        "path": "sample_users_bulk_import.xlsx",
        "name": "Danh_sach_nguoi_dung_mau.xlsx"
    })
    assert response.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("content-type", "")
    assert "attachment" in response.headers.get("content-disposition", "")
    assert "Danh_sach_nguoi_dung_mau.xlsx" in response.headers.get("content-disposition", "")
    assert len(response.content) > 1000

def test_download_sample_courses_csv():
    response = client.get("/api/download", params={
        "path": "sample_courses_bulk_import.csv",
        "name": "Danh_sach_khoa_hoc_mau.csv"
    })
    assert response.status_code == 200
    assert "text/csv" in response.headers.get("content-type", "")
    assert "charset=utf-8" in response.headers.get("content-type", "")
    assert "attachment" in response.headers.get("content-disposition", "")
    assert len(response.content) > 100

def test_download_nonexistent_file():
    response = client.get("/api/download", params={
        "path": "non_existent_random_file_12345.xlsx"
    })
    assert response.status_code == 404
