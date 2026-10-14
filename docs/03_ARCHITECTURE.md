# 03 — Architecture

## 1. Architecture style

**Modular monolith**, phù hợp prototype học phần: một FastAPI backend, một React SPA, một SQL Server database.

```mermaid
flowchart LR
    U[Browser] --> F[React + TypeScript]
    F -->|HTTPS/JSON| A[FastAPI]
    A --> S[Service layer]
    S --> O[SQLAlchemy 2.x]
    O --> D[(SQL Server)]
    A --> FS[Local configurable file storage]
```

Không microservices. Không queue/cache riêng nếu acceptance criteria không yêu cầu.

## 2. Backend structure đề xuất

```text
backend/
  app/
    main.py
    core/
      config.py
      security.py
      dependencies.py
    db/
      session.py
      base.py
    models/
    schemas/
    api/
      routes/
    services/
    repositories/      # optional, chỉ dùng khi thực sự giảm duplication
    storage/
  alembic/
  tests/
  requirements.txt     # hoặc pyproject.toml, chọn một
  alembic.ini
  .env.example
```

Mục tiêu là dễ đọc, dễ test và map trực tiếp sang các use case. Không áp Clean Architecture nhiều layer chỉ để “đúng mẫu”.

## 3. FastAPI conventions

- `APIRouter` theo module nghiệp vụ.
- Dependency injection bằng `Depends` cho DB session/current user/authorization helper.
- Pydantic schemas tách create/update/read khi cần.
- SQLAlchemy declarative models map 12 tables.
- Alembic quản lý migration.
- Exception handlers trả lỗi nhất quán.
- `/health` cho smoke test.
- `/docs` và `/openapi.json` dùng Swagger/OpenAPI mặc định của FastAPI.

## 4. SQL Server connectivity

Khuyến nghị:

- SQLAlchemy URL dùng `mssql+pyodbc`.
- Driver: ODBC Driver 18 for SQL Server nếu môi trường có sẵn.
- Connection string lấy từ environment variable.
- Không hard-code password DB.

Ví dụ biến môi trường:

```env
DATABASE_URL=mssql+pyodbc://USER:PASSWORD@HOST/UniversityLms?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes
JWT_SECRET=change-me
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=120
APP_ENV=development
UPLOAD_DIR=./storage/uploads
```

Không commit giá trị secret thật.

## 5. Frontend structure đề xuất

```text
frontend/src/
  api/
  auth/
  components/
  layouts/
  pages/
    admin/
    lecturer/
    student/
  routes/
  types/
  utils/
```

## 6. Cross-cutting concerns

- Global API exception handling.
- Request validation qua Pydantic.
- JWT authentication.
- Role checks + resource ownership checks.
- Pagination schema chung.
- Consistent error envelope/status code.
- CORS từ environment.

## 7. File handling

Không lưu binary trong SQL Server.

MVP:
- FastAPI nhận `multipart/form-data` qua `UploadFile`.
- Lưu vào path cấu hình `UPLOAD_DIR`.
- DB lưu relative path/URL.
- Validate extension + size.

Giới hạn demo gợi ý: 10 MB/file.

## 8. Security baseline vừa đủ

- Hash password bằng Argon2 hoặc bcrypt.
- JWT secret từ environment.
- Không nhận `user_id` từ client để quyết định danh tính hiện tại.
- Check role và ownership/enrollment server-side.
- Không trả `CorrectAnswer` cho student trước/đang làm quiz.
- Validate upload type/size.
- Không expose stack trace ngoài development.

## 9. Không over-engineer

Không thêm repository pattern cho mọi bảng nếu service + SQLAlchemy session đã rõ ràng. Không tạo generic CRUD framework nội bộ. Không async hóa toàn bộ chỉ vì FastAPI hỗ trợ async; sync SQLAlchemy session là chấp nhận được cho prototype nếu cấu hình nhất quán.
