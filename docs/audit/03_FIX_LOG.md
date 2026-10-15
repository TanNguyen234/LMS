# Audit Document 03: Engineering Fix & Patch Log

This document records the exact patches applied across frontend, backend, database scripts, and PM documentation, explaining the architectural rationale and why alternative implementations were rejected.

---

## 1. Authentication & Session Architecture

### Patch: Normalized JSON Auth & Seed Alignment
- **Files Touched:**
  - `frontend/src/api/client.ts`
  - `frontend/src/auth/AuthContext.tsx`
  - `frontend/src/pages/LoginPage.tsx`
- **Changes Applied:**
  - Converted `login` method in `client.ts` from creating `FormData` with OAuth2 `username` parameter to sending raw `application/json` payload `{ email, password }`.
  - Replaced hardcoded dummy email `student@university.edu.vn` with actual seed account `student1@university.edu.vn`.
  - Stored user token and user profile in `localStorage` with unified property names (`userId`, `email`, `fullName`, `role`).
- **Alternative Rejected:**
  - *Adopting OAuth2PasswordRequestForm in FastAPI*: Rejected because the project specification dictates standard JSON REST payload with email as primary identifier across academic systems.

---

## 2. API Contract & DTO Normalization

### Patch: Pagination Unwrapping & ID Mapping
- **Files Touched:**
  - `frontend/src/pages/AdminUsersPage.tsx`
  - `frontend/src/pages/CourseDetailPage.tsx`
  - `frontend/src/api/client.ts`
  - `frontend/src/types/index.ts`
- **Changes Applied:**
  - Enhanced `client.ts` methods to accept and unwrap `PaginatedResponse<T>`: `res.items ? res.items : res`.
  - Normalized all entity IDs to string UUIDs, eliminating arbitrary `parseInt` and number casts.
  - Corrected enrollment deletion signature to accept `enrollmentId` instead of `studentId`.
  - Decoupled `fetchUsers` in `CourseDetailPage.tsx` so non-Admin users (Lecturers and Students) do not trigger 403 Forbidden errors when viewing their courses.
- **Alternative Rejected:**
  - *Flattening backend responses to raw lists*: Rejected because backend pagination envelope (`items`, `total`, `skip`, `limit`) is standard enterprise practice for scalability with large academic registries.

---

## 3. Assignment Business Invariants & Lifecycle

### Patch: Status Whitelisting & Submissions
- **Files Touched:**
  - `backend/app/api/routes/assignments.py`
- **Changes Applied:**
  - Relaxed assignment detail visibility check: students are permitted to view assignments with status `PUBLISHED` and `CLOSED`, hiding only `DRAFT`.
  - Updated submission guard: rejected only `DRAFT` and `CLOSED` assignments:
    ```python
    if a.Status in ["DRAFT", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit to an assignment with status '{a.Status}'"
        )
    ```
  - Enforced deadline policy: late submissions are rejected unless `AllowLate == True`.
  - Prevented resubmission of already `GRADED` assignments.
- **Alternative Rejected:**
  - *Changing database constraint to include 'ACTIVE'*: Rejected because the database schema is canonical and already deployed in production environments; aligning the backend logic to the schema avoids destructive migrations.

---

## 4. Timed Quiz Scoring & Cheating Prevention

### Patch: Server-Side Timer & Question Sanitization
- **Files Touched:**
  - `backend/app/api/routes/quizzes.py`
- **Changes Applied:**
  - In `get_quiz_detail`, filtered out `CorrectAnswer` from question responses when accessed by users with role `STUDENT`.
  - In `submit_quiz_attempt`, computed elapsed time since `StartedAt`. If elapsed time exceeds `TimeLimitMinutes` by more than 60 seconds (network grace period), marked attempt status as `EXPIRED` with score `0.0`.
  - Enforced `MaxAttempts` check before allowing creation of a new attempt.
- **Alternative Rejected:**
  - *Relying on client-side timer*: Rejected because client-side JavaScript timers can be frozen or manipulated in browser devtools, violating academic assessment integrity.

---

## 5. Scope Boundary Enforcement

### Patch: Removal of Student Self-Enrollment
- **Files Touched:**
  - `frontend/src/pages/CourseDetailPage.tsx`
- **Changes Applied:**
  - Removed `StudentSelfEnroll` CTA button and related mock handler.
  - Confined enrollment management strictly to Admin and authorized course instructors.
- **Alternative Rejected:**
  - *Hiding the button via CSS*: Rejected because leaving dead code creates confusion for future developers and potential security risks if endpoints are inadvertently exposed.
