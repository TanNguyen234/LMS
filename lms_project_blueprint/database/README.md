# Database Setup

Database target: **Microsoft SQL Server**.

## Run order

1. Tạo database, ví dụ `UniversityLms`.
2. Chạy `01_schema.sql`.
3. Chạy `02_seed.sql`.
4. Chạy `04_seed_validation.sql`.
5. Dùng `03_demo_queries.sql` để kiểm tra/demo.

## Seed guarantee

Blueprint đặt mục tiêu **10 rows cho mỗi một trong 12 tables**. `04_seed_validation.sql` dùng để kiểm tra nhanh count/integrity trước demo.

## Development password

Seed không lưu plain-text password. Tất cả demo users có:

```text
PasswordHash = '__SET_ON_FIRST_RUN__'
```

FastAPI development initializer hoặc CLI bootstrap phải:

1. Query users có sentinel.
2. Hash `Demo@123` bằng password hasher của backend.
3. Update `PasswordHash`.
4. Commit transaction.
5. Chỉ chạy trong `APP_ENV=development` hoặc equivalent.

## SQLAlchemy + Alembic

- SQLAlchemy models phải tương thích key/datatype/constraint quan trọng trong `01_schema.sql`.
- Alembic migration phục vụ source code lifecycle.
- `01_schema.sql` vẫn là schema reference độc lập dùng cho bài báo cáo/demo database.
- Không để Alembic model và SQL reference schema trôi khác nhau mà không ghi lại lý do.

## SQL Server driver

Backend dự kiến dùng `mssql+pyodbc` với Microsoft ODBC Driver 18 for SQL Server.

Connection string phải lấy từ environment, không commit credential thật.
