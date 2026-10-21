# Baseline forensic 2026-10-21

## Căn cứ và phạm vi

- Repo: University LMS, working directory D:\Download\LMS.
- Snapshot gốc và origin/main tại lúc bắt đầu: 4fc2ead72d929ace0c3ed6ce85ae09dc4ac3fa6a.
- Nhánh sửa: fix/lms-forensic-acceptance-20261021.
- Working tree sạch trước khi thay đổi. Không reset/checkout lại main.
- Nền tảng: Windows 11, PowerShell, ngày 2026-10-21 (Asia/Bangkok). Python project venv và Node/npm trong workspace.
- CRG không khả dụng: truy vấn danh mục tool hiện hành không tìm thấy namespace/tool CRG. Thay thế bằng source inspection, rg và OpenAPI schema sinh trực tiếp từ app; báo cáo này không tuyên bố review graph-backed.

## Baseline đã chạy trước sửa

| Lệnh | CWD | Kết quả | Bằng chứng |
|---|---|---|---|
| git status --short; git rev-parse HEAD; git rev-parse origin/main | repo root | working tree sạch; HEAD và origin/main cùng snapshot SHA | ghi nhận đầu phiên |
| npm ci | frontend | thành công; 113 package cài đặt | command đã chạy đầu phiên; không lưu log riêng |
| npm run build | frontend | exit 0; TypeScript check và Vite build thành công | evidence/baseline_frontend.txt |
| npm run lint | frontend | exit 0, 16 warnings; không có lỗi chặn | evidence/baseline_frontend.txt |
| python -m pytest --collect-only -q backend/tests | repo root, backend venv | thu thập 26 test function hiện hữu; test không chạy | ghi nhận đầu phiên |
| read-only ODBC connection đến master | local SQL Server Express | kết nối chỉ đọc được; không truy vấn database ứng dụng | ghi nhận đầu phiên |

## Môi trường và giới hạn

- ODBC legacy driver “SQL Server” có sẵn; Microsoft ODBC Driver 17/sqlcmd không khả dụng.
- Backend local configuration có DATABASE_URL trỏ tới UniversityLms. Không in hoặc lưu giá trị connection string.
- Lệnh tạo disposable SQL Server database bị command policy từ chối trước khi thực thi. Không có database nào được tạo, seed, migrate hoặc sửa. Không chạy test fixture trên UniversityLms.
- SQL Server integration, seed validation, live /health, live /openapi.json qua HTTP và browser E2E do đó chưa có baseline thực tế.
- Frontend baseline build/lint là kết quả trước thay đổi; bằng chứng cuối nhánh được lưu riêng sau khi sửa.

## Bằng chứng nguồn

Repo test tại snapshot ban đầu có 10 test_acceptance, 10 test_challenger_recon và 6 test_recon2_challenger. Đây là test count tĩnh, không phải kết quả pass.


## Safety probe discovered during this branch

The first full-suite probe exposed that backend/tests/test_recon2_challenger.py created a module-level TestClient outside the shared database guard. Its question-create request returned HTTP 409 because the selected seeded quiz already had an attempt; route inspection shows this branch returned before add/commit. No row was written. The module now has an autouse guard requiring UniversityLms_Test_<id>, and its contract test creates a fresh quiz rather than mutating a seeded one. The original command output is retained at evidence/full_pytest_pre_guard.txt.
