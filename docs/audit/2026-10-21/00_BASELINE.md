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

## Kết quả follow-up sau khi có quyền dùng DB test riêng

Các ghi nhận ở trên là lịch sử đúng tại baseline; chúng được thay thế cho trạng thái hiện tại bởi các phép kiểm tra dưới đây. PR #1 đã merge vào `main` (merge commit `3c722e0a46a7804b60232000d8115e492ef6978b`). Fix branch tiếp tục chứa thay đổi mới sau merge; base commit của working tree trước lượt sửa cuối là `821ddf21210f275b167b4345c176bc1ce525ffc3`.

- API test và browser E2E chạy trên `UniversityLms_Test_20261021_0124`; tên DB được xác minh bằng `SELECT DB_NAME()`. DB ứng dụng `UniversityLms` không được sử dụng cho ghi.
- Bootstrap độc lập cuối cùng tạo `UniversityLms_Test_Repeat_20261021_1027`; `01_schema.sql`, `02_seed.sql`, `04_seed_validation.sql` chạy thành công, 12 bảng nghiệp vụ có 10 hàng seed mỗi bảng, Alembic stamp ở `6f2d4db8312a`.
- Backend full suite pass 44/44 theo thứ tự chuẩn và thứ tự file đảo ngược. Lần chạy thứ tự ngược đầu trên DB Bootstrap cũ cho thấy DB tại thời điểm chạy không có bảng `Users`; lần chạy đó không được tính là pass. DB mới Repeat được tạo và kiểm tra riêng; full suite thứ tự ngược trên DB mới pass 44/44. Xem `evidence/live_backend_pytest_independent_reverse.txt`, `evidence/live_fresh_repeat_bootstrap.txt`, `evidence/live_backend_pytest_fresh_repeat_final.txt`.
- Chrome DevTools E2E cuối trên API thật và Vite thật: 29 thao tác qua ADMIN, LECTURER, STUDENT; 43 browser writes thành công; 226 API responses 2xx và hai 401 duy nhất là GET `/api/auth/me` trong kiểm tra token hết hạn; 10 kiểm tra SQL persistence; 0 lỗi console ngoài 2 resource log tương ứng. Xem `evidence/crud-e2e/live_crud_e2e.log` và stdout.
- Build frontend exit 0; lint exit 0 với 15 cảnh báo style/hooks không chặn. Backend suite 44 passed, 15 warning phụ thuộc/deprecation.
- CRG không khả dụng trong phiên này; kết luận được dựa trên source/rg, test SQL Server, HTTP probe và trình duyệt Chrome thật. Không tuyên bố review graph-backed.

Các log hiện hành và giới hạn còn lại được ghi tại [03_TEST_MATRIX.md](03_TEST_MATRIX.md) và [05_RELEASE_GATE.md](05_RELEASE_GATE.md). Không có claim deployment hay uptime ngoài môi trường local.


## Safety probe discovered during this branch

The first full-suite probe exposed that backend/tests/test_recon2_challenger.py created a module-level TestClient outside the shared database guard. Its question-create request returned HTTP 409 because the selected seeded quiz already had an attempt; route inspection shows this branch returned before add/commit. No row was written. The module now has an autouse guard requiring UniversityLms_Test_<id>, and its contract test creates a fresh quiz rather than mutating a seeded one. The original command output is retained at evidence/full_pytest_pre_guard.txt.
