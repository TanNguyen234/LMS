"""Live Chrome DevTools acceptance run against a disposable SQL Server database."""

import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import websockets


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
EXPECTED_DATABASE = os.environ.get("LMS_E2E_TEST_DATABASE", "")
FRONTEND_URL = os.environ.get("LMS_E2E_FRONTEND_URL", "http://127.0.0.1:5174").rstrip("/")
CDP_PORT = int(os.environ.get("LMS_E2E_CDP_PORT", "9333"))
PASSWORD = os.environ.get("LMS_E2E_PASSWORD", "Demo@123")
ACCOUNTS = {
    "ADMIN": os.environ.get("LMS_E2E_ADMIN_EMAIL", "admin@university.edu.vn"),
    "LECTURER": os.environ.get("LMS_E2E_LECTURER_EMAIL", "lecturer1@university.edu.vn"),
    "STUDENT": os.environ.get("LMS_E2E_STUDENT_EMAIL", "student1@university.edu.vn"),
}
EVIDENCE_DIR = ROOT / "docs" / "audit" / "2026-10-21" / "evidence" / "crud-e2e"


def validate_test_database() -> None:
    if not EXPECTED_DATABASE.casefold().startswith("universitylms_test_"):
        raise RuntimeError("Set LMS_E2E_TEST_DATABASE to the approved disposable UniversityLms_Test_<id> database.")
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    from backend.app.core.config import settings

    test_url = make_url(settings.DATABASE_URL).set(database=EXPECTED_DATABASE)
    engine = create_engine(test_url)
    try:
        with engine.connect() as connection:
            actual = connection.scalar(text("SELECT DB_NAME()"))
            if actual != EXPECTED_DATABASE:
                raise RuntimeError(f"Database boundary mismatch: expected {EXPECTED_DATABASE}, got {actual}.")
            rows = connection.execute(text("SELECT Role, COUNT(*) FROM Users GROUP BY Role")).all()
            roles = {role: count for role, count in rows}
            if not all(roles.get(role, 0) > 0 for role in ACCOUNTS):
                raise RuntimeError("The disposable database is missing one or more role accounts.")
    finally:
        engine.dispose()


def lookup_test_database_marker() -> tuple[str, str]:
    """Return or seed a disposable-database marker that the Admin UI must read before E2E writes."""
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url
    from sqlalchemy.orm import Session
    from backend.app.core.config import settings
    from backend.app.models.models import Course, User

    engine = create_engine(make_url(settings.DATABASE_URL).set(database=EXPECTED_DATABASE))
    try:
        with Session(engine) as db:
            course = db.query(Course).filter(
                Course.CourseCode.like("E2E%"),
                Course.Title.like("Browser Acceptance%"),
            ).order_by(Course.CreatedAt.desc()).first()
            if course is None:
                lecturer = db.query(User).filter(
                    User.Role == "LECTURER",
                    User.IsActive.is_(True),
                ).order_by(User.Email.asc()).first()
                if lecturer is None:
                    raise RuntimeError("The disposable DB has no active lecturer for the read-only API marker.")
                suffix = uuid.uuid4().hex[:8].upper()
                course = Course(
                    CourseId=uuid.uuid4(),
                    CourseCode=f"E2EPREFLIGHT{suffix}",
                    Title=f"Browser Acceptance Preflight {suffix}",
                    Description="E2E marker in the approved disposable database.",
                    LecturerId=lecturer.UserId,
                    Semester="TEST",
                    AcademicYear="2026-2027",
                    Credits=1,
                    Status="ACTIVE",
                )
                db.add(course)
                db.commit()
                db.refresh(course)
            return course.CourseCode, course.Title
    finally:
        engine.dispose()


class DevTools:
    def __init__(self, websocket_url: str):
        self.websocket_url = websocket_url
        self.ws = None
        self.command_id = 0
        self.pending = {}
        self.network_writes = []
        self.api_responses = []
        self.pending_attempt_starts = set()
        self.attempt_start_payloads = []
        self.attempt_capture_errors = []
        self.quiz_submission_attempt_ids = []
        self.expected_api_failures = []
        self.console_errors = 0
        self.console_error_details = []
        self.listener = None

    async def connect(self) -> None:
        self.ws = await websockets.connect(
            self.websocket_url,
            max_size=20 * 1024 * 1024,
            open_timeout=5,
        )
        self.listener = asyncio.create_task(self._listen())
        self.listener.add_done_callback(self._listener_finished)
        for domain in ("Page", "Runtime", "Network", "Console", "Log"):
            await self.send(f"{domain}.enable")

    def _listener_finished(self, task: asyncio.Task) -> None:
        try:
            task.exception()
        except asyncio.CancelledError:
            pass
        for future in self.pending.values():
            if not future.done():
                future.set_exception(RuntimeError("Chrome DevTools listener stopped before command response"))
        self.pending.clear()

    async def _listen(self) -> None:
        async for raw_message in self.ws:
            message = json.loads(raw_message)
            if "id" in message:
                future = self.pending.pop(message["id"], None)
                if future and not future.done():
                    if "error" in message:
                        future.set_exception(RuntimeError(message["error"].get("message", "CDP command failed")))
                    else:
                        future.set_result(message.get("result", {}))
                continue

            method = message.get("method")
            params = message.get("params", {})
            if method == "Network.responseReceived":
                response = params.get("response", {})
                request_id = params.get("requestId")
                request = getattr(self, "requests", {}).get(request_id, {})
                url = response.get("url", "")
                if url.startswith(f"{FRONTEND_URL}/api/"):
                    status = int(response.get("status", 0))
                    verb = request.get("method", "GET")
                    path = url.split("/api/", 1)[-1].split("?", 1)[0]
                    self.api_responses.append((verb, path, status))
                    if verb != "GET":
                        self.network_writes.append((verb, path, status))
                    if path.endswith("/attempts/start") and verb == "POST":
                        self.pending_attempt_starts.add(request_id)
                    if verb == "POST" and path.startswith("quiz-attempts/") and path.endswith("/submit"):
                        self.quiz_submission_attempt_ids.append(path.split("/")[1])
            elif method == "Network.requestWillBeSent":
                if not hasattr(self, "requests"):
                    self.requests = {}
                request = params.get("request", {})
                self.requests[params.get("requestId")] = {"method": request.get("method", "GET")}
            elif method == "Network.loadingFinished" and params.get("requestId") in self.pending_attempt_starts:
                request_id = params.get("requestId")
                self.pending_attempt_starts.discard(request_id)
                asyncio.create_task(self._capture_attempt_start(request_id))
            elif method == "Runtime.exceptionThrown":
                self.console_errors += 1
                details = params.get("exceptionDetails", {})
                exception = details.get("exception", {})
                self.console_error_details.append({
                    "source": "Runtime.exceptionThrown",
                    "message": details.get("text", "")[:300],
                    "exception": exception.get("description", "")[:300],
                    "url": details.get("url", "").split("?", 1)[0],
                    "line": details.get("lineNumber"),
                })
            elif method == "Runtime.consoleAPICalled" and params.get("type") == "error":
                call_frames = params.get("stackTrace", {}).get("callFrames", [])
                first_frame = call_frames[0] if call_frames else {}
                self.console_errors += 1
                self.console_error_details.append({
                    "source": "Runtime.consoleAPICalled",
                    "message": "console.error called",
                    "argument_count": len(params.get("args", [])),
                    "url": first_frame.get("url", "").split("?", 1)[0],
                    "line": first_frame.get("lineNumber"),
                })
            elif (
                method == "Log.entryAdded"
                and params.get("entry", {}).get("level") == "error"
                and params.get("entry", {}).get("source") != "console"
            ):
                self.console_errors += 1
                entry = params.get("entry", {})
                self.console_error_details.append({
                    "source": "Log.entryAdded",
                    "message": entry.get("text", "")[:300],
                    "url": entry.get("url", "").split("?", 1)[0],
                    "line": entry.get("lineNumber"),
                })
            elif method == "Page.javascriptDialogOpening":
                asyncio.create_task(self._accept_dialog())

    async def send(self, method: str, params: dict | None = None) -> dict:
        self.command_id += 1
        command_id = self.command_id
        future = asyncio.get_running_loop().create_future()
        self.pending[command_id] = future
        try:
            await self.ws.send(json.dumps({"id": command_id, "method": method, "params": params or {}}))
            return await asyncio.wait_for(future, timeout=15)
        except TimeoutError as exc:
            raise TimeoutError(f"Chrome DevTools command {method} timed out after 15 seconds") from exc
        finally:
            self.pending.pop(command_id, None)
            if not future.done():
                future.cancel()

    async def _accept_dialog(self) -> None:
        try:
            await self.send("Page.handleJavaScriptDialog", {"accept": True})
        except RuntimeError as exc:
            if "No dialog is showing" not in str(exc):
                raise

    async def _capture_attempt_start(self, request_id: str) -> None:
        try:
            response = await self.send("Network.getResponseBody", {"requestId": request_id})
            body = response.get("body", "")
            if response.get("base64Encoded"):
                body = base64.b64decode(body).decode("utf-8")
            payload = json.loads(body)
            questions = payload.get("questions") or []
            private_fields = []
            for question in questions:
                if isinstance(question, dict):
                    private_fields.extend(
                        field for field in question
                        if any(marker in field.casefold() for marker in ("answer", "correct", "solution", "explanation"))
                    )
            self.attempt_start_payloads.append({
                "attempt_id": payload.get("attemptId"),
                "started_at": payload.get("startedAt"),
                "time_limit_minutes": payload.get("timeLimitMinutes"),
                "max_score": payload.get("maxScore"),
                "question_count": len(questions),
                "private_fields": sorted(set(private_fields)),
            })
        except Exception as exc:
            self.attempt_capture_errors.append(type(exc).__name__)

    async def wait_for_attempt_start(self, timeout: float = 12) -> dict:
        end = time.time() + timeout
        while time.time() < end:
            if self.attempt_start_payloads:
                return self.attempt_start_payloads[-1]
            if self.attempt_capture_errors:
                raise AssertionError(f"Could not inspect the real quiz start response: {self.attempt_capture_errors}")
            await asyncio.sleep(0.2)
        raise AssertionError("The quiz start response body was not captured from Chrome DevTools.")

    async def evaluate(self, expression: str):
        result = await self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
        })
        if "exceptionDetails" in result:
            raise RuntimeError(result["exceptionDetails"].get("text", "Browser JavaScript failed"))
        return result.get("result", {}).get("value")

    async def navigate(self, url: str) -> None:
        await self.send("Page.navigate", {"url": url})
        await asyncio.sleep(0.7)

    async def wait_text(self, text: str, timeout: float = 12) -> None:
        end = time.time() + timeout
        while time.time() < end:
            if await self.evaluate(f"document.body && document.body.innerText.includes({json.dumps(text)})"):
                return
            await asyncio.sleep(0.2)
        body = await self.evaluate("document.body ? document.body.innerText.slice(0, 1000) : ''")
        raise AssertionError(f"Timed out waiting for visible text {text!r}; current page starts: {body!r}")

    async def wait_url(self, fragment: str, timeout: float = 12) -> None:
        end = time.time() + timeout
        while time.time() < end:
            if fragment in (await self.evaluate("location.href")):
                return
            await asyncio.sleep(0.2)
        raise AssertionError(f"Browser did not navigate to a URL containing {fragment!r}.")

    async def wait_authenticated(self, timeout: float = 12) -> None:
        end = time.time() + timeout
        while time.time() < end:
            authenticated = await self.evaluate(
                "location.pathname !== '/login' && !!localStorage.getItem('token') && "
                "!!document.querySelector('button[title=\"Đăng xuất\"]')"
            )
            if authenticated:
                return
            await asyncio.sleep(0.2)
        raise AssertionError("The real login flow did not reach an authenticated page.")

    async def click_button(self, text: str, *, exact: bool = True) -> None:
        match = "b.innerText.trim() === wanted" if exact else "b.innerText.trim().includes(wanted)"
        clicked = await self.evaluate(
            "(() => { const wanted = " + json.dumps(text) + "; const buttons = [...document.querySelectorAll('button')]; "
            f"const button = buttons.find(b => b.getClientRects().length > 0 && !b.disabled && {match}); "
            "if (!button) return false; button.click(); return true; })()"
        )
        if not clicked:
            raise AssertionError(f"Could not click visible button {text!r}.")

    async def wait_button_enabled(self, text: str, timeout: float = 12) -> None:
        end = time.time() + timeout
        while time.time() < end:
            enabled = await self.evaluate(
                "(() => [...document.querySelectorAll('button')].some(b => b.getClientRects().length > 0 && "
                "!b.disabled && b.innerText.trim() === " + json.dumps(text) + "))()"
            )
            if enabled:
                return
            await asyncio.sleep(0.2)
        raise AssertionError(f"Button {text!r} did not become enabled.")

    async def click_selector(self, selector: str) -> None:
        clicked = await self.evaluate(
            "(() => { const element = document.querySelector(" + json.dumps(selector) + "); "
            "if (!element || element.getClientRects().length === 0 || element.disabled) return false; element.click(); return true; })()"
        )
        if not clicked:
            raise AssertionError(f"Could not click visible selector {selector!r}.")

    async def click_link(self, href: str) -> None:
        await self.click_selector(f'a[href="{href}"]')
        await asyncio.sleep(0.3)

    async def fill(self, selector: str, value: str) -> None:
        updated = await self.evaluate(
            "(() => { const element = document.querySelector(" + json.dumps(selector) + "); "
            "if (!element || element.getClientRects().length === 0) return false; "
            "const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set; "
            "setter.call(element, " + json.dumps(value) + "); "
            "element.dispatchEvent(new Event('input', {bubbles:true})); "
            "element.dispatchEvent(new Event('change', {bubbles:true})); return true; })()"
        )
        if not updated:
            raise AssertionError(f"Could not fill visible field {selector!r}.")

    async def choose_option(self, selector: str, text: str) -> None:
        chosen = await self.evaluate(
            "(() => { const select = document.querySelector(" + json.dumps(selector) + "); "
            "if (!select) return false; const option = [...select.options].find(o => o.textContent.includes(" + json.dumps(text) + ")); "
            "if (!option) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; "
            "setter.call(select, option.value); select.dispatchEvent(new Event('change', {bubbles:true})); return true; })()"
        )
        if not chosen:
            raise AssertionError(f"Could not select option containing {text!r}.")

    async def wait_option(self, selector: str, text: str, timeout: float = 12) -> None:
        end = time.time() + timeout
        while time.time() < end:
            found = await self.evaluate(
                "(() => { const select = document.querySelector(" + json.dumps(selector) + "); "
                "return !!select && [...select.options].some(o => o.textContent.includes(" + json.dumps(text) + ")); })()"
            )
            if found:
                return
            await asyncio.sleep(0.2)
        raise AssertionError(f"Select {selector!r} did not load an option containing the requested actor.")

    async def assert_visible(self, text: str) -> None:
        if not await self.evaluate(f"document.body && document.body.innerText.includes({json.dumps(text)})"):
            raise AssertionError(f"Expected text {text!r} is not visible on the actual page.")

    async def assert_absent(self, text: str) -> None:
        if await self.evaluate(f"document.body && document.body.innerText.includes({json.dumps(text)})"):
            raise AssertionError(f"Unexpected text {text!r} is visible on the actual page.")

    async def open_page(self) -> None:
        version = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/version", timeout=3).read())
        target = urllib.request.Request(
            f"http://127.0.0.1:{CDP_PORT}/json/new?{FRONTEND_URL}/login",
            method="PUT",
        )
        page = json.loads(urllib.request.urlopen(target, timeout=3).read())
        await self.connect_to_page(page.get("webSocketDebuggerUrl"), version)
        await self.evaluate("localStorage.clear(); sessionStorage.clear();")
        await self.navigate(f"{FRONTEND_URL}/login")

    async def connect_to_page(self, page_websocket: str, _version: dict) -> None:
        self.websocket_url = page_websocket
        for attempt in range(3):
            try:
                await self.connect()
                return
            except (TimeoutError, OSError, RuntimeError, websockets.exceptions.WebSocketException):
                await self.close()
                if attempt == 2:
                    raise
                await asyncio.sleep(0.35)

    async def screenshot_main(self, name: str) -> Path:
        rect = await self.evaluate(
            "(() => { const main = document.querySelector('main'); if (!main) return null; "
            "const r = main.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()"
        )
        if not rect or rect["width"] <= 0 or rect["height"] <= 0:
            raise AssertionError("The actual main content area was not available for evidence capture.")
        response = await self.send("Page.captureScreenshot", {
            "format": "png",
            "clip": {**rect, "scale": 1},
            "captureBeyondViewport": False,
        })
        target = EVIDENCE_DIR / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(base64.b64decode(response["data"]))
        return target

    async def close(self) -> None:
        listener = self.listener
        self.listener = None
        if listener:
            listener.cancel()
            try:
                await listener
            except asyncio.CancelledError:
                pass
        ws = self.ws
        self.ws = None
        if ws:
            await ws.close()


def start_chrome_if_needed() -> None:
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/version", timeout=2).close()
        return
    except Exception:
        pass
    candidates = [
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Google" / "Chrome" / "Application" / "chrome.exe",
    ]
    chrome = next((path for path in candidates if path.exists()), None)
    if not chrome:
        raise RuntimeError("Chrome was not found on this computer.")
    profile = Path(tempfile.gettempdir()) / "lms-live-crud-e2e-chrome"
    subprocess.Popen([
        str(chrome), f"--remote-debugging-port={CDP_PORT}", f"--user-data-dir={profile}",
        "--no-first-run", "--no-default-browser-check", f"{FRONTEND_URL}/login",
    ])
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/version", timeout=1).close()
            return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError("Chrome did not expose the requested DevTools port in time.")


async def fill_login(browser: DevTools, email: str) -> None:
    await browser.navigate(f"{FRONTEND_URL}/login")
    await browser.wait_text("Đăng nhập hệ thống")
    await browser.fill('input[placeholder="name@university.edu.vn"]', email)
    await browser.fill('input[type="password"]', PASSWORD)
    await browser.click_button("Đăng nhập")
    await browser.wait_authenticated()
    expected_role = next((role for role, account_email in ACCOUNTS.items() if account_email == email), None)
    actual_role = await browser.evaluate("JSON.parse(localStorage.getItem('user') || 'null')?.role")
    if actual_role != expected_role:
        raise AssertionError(f"The login flow authenticated role {actual_role!r}; expected {expected_role!r}.")
    await browser.send("Page.reload")
    await asyncio.sleep(0.8)
    await browser.wait_authenticated()
    reloaded_role = await browser.evaluate("JSON.parse(localStorage.getItem('user') || 'null')?.role")
    if reloaded_role != expected_role:
        raise AssertionError(f"Reload restored role {reloaded_role!r}; expected {expected_role!r}.")


def create_expired_student_token() -> str:
    """Sign an expired JWT for the seeded student in the explicitly disposable database."""
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url
    from sqlalchemy.orm import Session
    from backend.app.core.config import settings
    from backend.app.core.security import create_access_token
    from backend.app.models.models import User

    engine = create_engine(make_url(settings.DATABASE_URL).set(database=EXPECTED_DATABASE))
    try:
        with Session(engine) as db:
            student = db.query(User).filter(User.Email == ACCOUNTS["STUDENT"]).one()
            return create_access_token(
                subject=student.UserId,
                role=student.Role,
                email=student.Email,
                expires_delta=timedelta(seconds=-60),
            )
    finally:
        engine.dispose()


def create_test_names() -> dict:
    run_id = datetime.now(timezone.utc).strftime("%H%M%S") + os.urandom(2).hex().upper()
    return {
        "run": run_id,
        "user_name": f"Browser E2E {run_id}",
        "user_email": f"lms-e2e-{run_id.lower()}@example.com",
        "user_updated_email": f"lms-e2e-updated-{run_id.lower()}@example.com",
        "course_code": f"E2E{run_id[:8]}",
        "course_title": f"Browser Acceptance {run_id}",
        "course_updated_title": f"Browser Acceptance Edited {run_id}",
        "module_title": f"E2E Module {run_id}",
        "module_updated_title": f"E2E Module Edited {run_id}",
        "lesson_title": f"E2E Lesson {run_id}",
        "lesson_updated_title": f"E2E Lesson Edited {run_id}",
        "lesson_body": f"Actual browser lesson content {run_id}",
        "assignment_title": f"E2E Assignment {run_id}",
        "assignment_updated_title": f"E2E Assignment Edited {run_id}",
        "assignment_submission": f"Actual student submission {run_id}",
        "assignment_feedback": f"Reviewed in Chrome DevTools {run_id}",
        "quiz_title": f"E2E Quiz {run_id}",
        "quiz_updated_title": f"E2E Quiz Edited {run_id}",
        "question_text": f"Which key identifies the test run {run_id}?",
        "question_updated_text": f"Edited question for test run {run_id}?",
    }


def verify_persisted_results(names: dict) -> dict:
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url
    from sqlalchemy.orm import Session
    from backend.app.core.config import settings
    from backend.app.models.models import (
        Assignment, Course, Enrollment, Grade, Lesson, Module, Quiz,
        QuizAttempt, QuizQuestion, Submission, User,
    )

    engine = create_engine(make_url(settings.DATABASE_URL).set(database=EXPECTED_DATABASE))
    try:
        with Session(engine) as db:
            edited_user = db.query(User).filter(User.Email == names["user_updated_email"]).one()
            course = db.query(Course).filter(Course.CourseCode == names["course_code"]).one()
            student = db.query(User).filter(User.Email == ACCOUNTS["STUDENT"]).one()
            enrollment = db.query(Enrollment).filter(
                Enrollment.CourseId == course.CourseId,
                Enrollment.StudentId == student.UserId,
            ).one()
            module = db.query(Module).filter(
                Module.CourseId == course.CourseId,
                Module.Title == names["module_updated_title"],
            ).one()
            lesson = db.query(Lesson).filter(
                Lesson.ModuleId == module.ModuleId,
                Lesson.Title == names["lesson_updated_title"],
            ).one()
            assignment = db.query(Assignment).filter(
                Assignment.CourseId == course.CourseId,
                Assignment.Title == names["assignment_updated_title"],
            ).one()
            submission = db.query(Submission).filter(
                Submission.AssignmentId == assignment.AssignmentId,
                Submission.StudentId == student.UserId,
            ).one()
            quiz = db.query(Quiz).filter(
                Quiz.CourseId == course.CourseId,
                Quiz.Title == names["quiz_updated_title"],
            ).one()
            question = db.query(QuizQuestion).filter(
                QuizQuestion.QuizId == quiz.QuizId,
                QuizQuestion.QuestionText == names["question_updated_text"],
            ).one()
            attempt = db.query(QuizAttempt).filter(
                QuizAttempt.QuizId == quiz.QuizId,
                QuizAttempt.StudentId == student.UserId,
            ).one()
            assignment_grade = db.query(Grade).filter(
                Grade.SourceType == "ASSIGNMENT",
                Grade.SourceId == assignment.AssignmentId,
                Grade.StudentId == student.UserId,
            ).one()
            quiz_grade = db.query(Grade).filter(
                Grade.SourceType == "QUIZ",
                Grade.SourceId == quiz.QuizId,
                Grade.StudentId == student.UserId,
            ).one()

            checks = {
                "user_updated_active": edited_user.IsActive and edited_user.FullName.endswith("Edited"),
                "course_updated_active": course.Status == "ACTIVE" and course.Title == names["course_updated_title"],
                "enrollment_restored": enrollment.Status == "ACTIVE",
                "module_published": module.IsPublished,
                "lesson_published": lesson.IsPublished and names["lesson_body"] in (lesson.ContentHtml or ""),
                "assignment_graded": assignment.Status == "PUBLISHED" and submission.Status == "GRADED" and float(submission.Score) == 8.0,
                "assignment_feedback_saved": assignment_grade.Feedback == names["assignment_feedback"],
                "quiz_attempt_submitted": quiz.IsPublished and attempt.Status == "SUBMITTED" and float(attempt.Score) == 2.5,
                "quiz_question_updated": question.QuestionText == names["question_updated_text"],
                "quiz_grade_saved": float(quiz_grade.Score) == 2.5 and float(quiz_grade.MaxScore) == 2.5,
            }
            failed = [name for name, passed in checks.items() if not passed]
            if failed:
                raise AssertionError(f"Persisted SQL Server acceptance checks failed: {failed}")
            return checks
    finally:
        engine.dispose()


async def click_card_button(browser: DevTools, heading: str, button_text: str) -> None:
    clicked = await browser.evaluate(
        "(() => { const heading = [...document.querySelectorAll('h2,h3')].find(e => e.innerText.trim() === "
        + json.dumps(heading)
        + "); if (!heading) return false; let card = heading.closest('.bg-white'); if (!card) return false; "
        "const button = [...card.querySelectorAll('button,a')].find(b => b.innerText.trim() === "
        + json.dumps(button_text)
        + " && b.getClientRects().length > 0); if (!button) return false; button.click(); return true; })()"
    )
    if not clicked:
        raise AssertionError(f"Could not click {button_text!r} in the card titled {heading!r}.")


async def wait_card_button(browser: DevTools, heading: str, button_text: str, timeout: float = 12) -> None:
    end = time.time() + timeout
    while time.time() < end:
        available = await browser.evaluate(
            "(() => { const heading = [...document.querySelectorAll('h2,h3')].find(e => e.innerText.trim() === "
            + json.dumps(heading)
            + "); if (!heading) return false; const card = heading.closest('.bg-white'); if (!card) return false; "
            "return [...card.querySelectorAll('button,a')].some(b => b.innerText.trim() === "
            + json.dumps(button_text)
            + " && b.getClientRects().length > 0); })()"
        )
        if available:
            return
        await asyncio.sleep(0.2)
    raise AssertionError(f"Card {heading!r} did not reach the state with action {button_text!r}.")


async def wait_card_text(browser: DevTools, heading: str, expected_text: str, timeout: float = 12) -> None:
    end = time.time() + timeout
    while time.time() < end:
        visible = await browser.evaluate(
            "(() => { const heading = [...document.querySelectorAll('h2,h3')].find(e => e.innerText.trim() === "
            + json.dumps(heading)
            + "); const card = heading?.closest('.bg-white'); return !!card && card.innerText.includes("
            + json.dumps(expected_text)
            + "); })()"
        )
        if visible:
            return
        await asyncio.sleep(0.2)
    raise AssertionError(f"Card {heading!r} did not show expected text {expected_text!r}.")


async def assert_card_action_absent(browser: DevTools, heading: str, action_text: str) -> None:
    present = await browser.evaluate(
        "(() => { const heading = [...document.querySelectorAll('h2,h3')].find(e => e.innerText.trim() === "
        + json.dumps(heading)
        + "); const card = heading?.closest('.bg-white'); return !!card && "
        "[...card.querySelectorAll('button,a')].some(e => e.innerText.trim() === "
        + json.dumps(action_text)
        + " && e.getClientRects().length > 0); })()"
    )
    if present:
        raise AssertionError(f"Card {heading!r} unexpectedly exposes action {action_text!r}.")


async def click_row_button(browser: DevTools, row_text: str, button_text: str) -> None:
    clicked = await browser.evaluate(
        "(() => { const row = [...document.querySelectorAll('tr')].find(e => e.innerText.includes("
        + json.dumps(row_text)
        + ")); if (!row) return false; const button = [...row.querySelectorAll('button')].find(b => b.innerText.includes("
        + json.dumps(button_text)
        + ") || b.title.includes(" + json.dumps(button_text) + ")); if (!button) return false; button.click(); return true; })()"
    )
    if not clicked:
        raise AssertionError(f"Could not click {button_text!r} in the table row containing {row_text!r}.")


async def main() -> None:
    validate_test_database()
    test_marker = lookup_test_database_marker()
    start_chrome_if_needed()
    names = create_test_names()
    browser = DevTools("")
    operations = []
    screenshots = []
    try:
        await browser.open_page()
        # Admin: create and edit user, toggle active state, create/edit/archive course, enroll/drop/re-enroll.
        await fill_login(browser, ACCOUNTS["ADMIN"])
        await browser.click_link("/courses")
        await browser.wait_text("Quản lý Khóa học")
        await wait_card_text(browser, test_marker[1], test_marker[0])
        await browser.click_link("/users")
        await browser.wait_text("Quản lý Người dùng")
        await browser.click_button("Thêm người dùng mới")
        await browser.fill('input[placeholder="Nguyễn Văn A"]', names["user_name"])
        await browser.fill('input[placeholder="nguyenvana"]', names["user_email"].split("@")[0])
        await browser.fill('input[placeholder="vana@university.edu.vn"]', names["user_email"])
        await browser.fill('input[type="password"]', PASSWORD)
        await browser.click_button("Thêm tài khoản")
        await browser.wait_text(names["user_email"])
        operations.append("ADMIN user create")

        await browser.click_selector(f'button[aria-label="Sửa {names["user_name"]}"]')
        await browser.fill('input[placeholder="Nguyễn Văn A"]', names["user_name"] + " Edited")
        await browser.fill('input[placeholder="vana@university.edu.vn"]', names["user_updated_email"])
        await browser.click_button("Lưu thay đổi")
        await browser.wait_text(names["user_updated_email"])
        operations.append("ADMIN user update")

        await click_row_button(browser, names["user_updated_email"], "Khóa tài khoản")
        await browser.wait_text("Đã khóa")
        await click_row_button(browser, names["user_updated_email"], "Kích hoạt tài khoản")
        await browser.wait_text("Hoạt động")
        operations.append("ADMIN user deactivate/reactivate")

        await browser.click_link("/courses")
        await browser.wait_text("Quản lý Khóa học")
        await browser.click_button("Thêm khóa học mới")
        await browser.fill('input[placeholder="CS101"]', names["course_code"])
        await browser.fill('input[placeholder="Nhập môn Lập trình Web"]', names["course_title"])
        await browser.fill('textarea[placeholder*="Mô tả mục tiêu"]', "Created and updated through the real browser workflow.")
        await browser.wait_option("form select", ACCOUNTS["LECTURER"])
        await browser.choose_option("form select", ACCOUNTS["LECTURER"])
        await browser.click_button("Lưu khóa học")
        await browser.wait_text(names["course_title"])
        operations.append("ADMIN course create")

        await browser.click_selector(f'button[aria-label="Sửa khóa học {names["course_code"]}"]')
        await browser.fill('input[placeholder="Nhập môn Lập trình Web"]', names["course_updated_title"])
        await browser.click_button("Lưu khóa học")
        await browser.wait_text(names["course_updated_title"])
        operations.append("ADMIN course update")

        await click_card_button(browser, names["course_updated_title"], "Chi tiết")
        await browser.wait_url("/courses/")
        await browser.wait_text(names["course_updated_title"])
        await browser.wait_text("Danh sách sinh viên")
        await browser.click_button("Danh sách sinh viên", exact=False)
        await browser.click_button("Ghi danh sinh viên")
        await browser.wait_option("form select", ACCOUNTS["STUDENT"])
        await browser.choose_option("form select", ACCOUNTS["STUDENT"])
        await browser.click_button("Xác nhận ghi danh")
        await browser.wait_text("Rút ghi danh")
        operations.append("ADMIN enrollment create")

        await click_row_button(browser, ACCOUNTS["STUDENT"], "Rút ghi danh")
        await browser.wait_text("DROPPED")
        operations.append("ADMIN enrollment soft delete")
        await browser.click_button("Ghi danh sinh viên")
        await browser.wait_option("form select", ACCOUNTS["STUDENT"])
        await browser.choose_option("form select", ACCOUNTS["STUDENT"])
        await browser.click_button("Xác nhận ghi danh")
        await browser.wait_text("Rút ghi danh")
        operations.append("ADMIN enrollment restore")
        print("PHASE_ADMIN_PASS", flush=True)

        await browser.click_selector('button[title="Đăng xuất"]')
        await browser.wait_text("Đăng nhập hệ thống")

        # Lecturer: manage published content and assignments/quizzes in the assigned course.
        await fill_login(browser, ACCOUNTS["LECTURER"])
        await browser.click_link("/courses")
        await browser.wait_text(names["course_updated_title"])
        course_href = await browser.evaluate(
            "(() => [...document.querySelectorAll('a[href^=\"/courses/\"]')].find(a => a.innerText.includes("
            + json.dumps(names["course_updated_title"])
            + "))?.getAttribute('href'))()"
        )
        if not course_href:
            raise AssertionError("The lecturer could not open the course assigned by the admin.")
        await browser.click_link(course_href)
        await browser.wait_text(names["course_updated_title"])
        await browser.wait_text("Chưa có chương học nào trong khóa này.")

        await browser.click_button("+ Chương học")
        await browser.fill('input[placeholder^="Chương 1"]', names["module_title"])
        await browser.fill("textarea", "Initial module summary.")
        await browser.click_button("Lưu chương")
        await browser.wait_text(names["module_title"])
        operations.append("LECTURER module create")

        await browser.click_selector(f'button[aria-label="Sửa chương {names["module_title"]}"]')
        await browser.fill('input[placeholder^="Chương 1"]', names["module_updated_title"])
        await browser.fill("textarea", "Edited module summary.")
        await browser.click_button("Lưu thay đổi")
        await browser.wait_text(names["module_updated_title"])
        await browser.click_button("Ẩn")
        await browser.wait_text("Bản nháp")
        await browser.click_button("Xuất bản")
        await browser.wait_text("Đã xuất bản")
        operations.append("LECTURER module update/publish/unpublish")

        await browser.click_button("+ Thêm bài")
        await browser.fill('input[placeholder^="Bài 1"]', names["lesson_title"])
        await browser.fill("textarea", names["lesson_body"])
        await browser.click_button("Lưu bài giảng")
        await browser.wait_text(names["lesson_title"])
        operations.append("LECTURER lesson create")

        await browser.click_selector(f'button[aria-label="Sửa bài giảng {names["lesson_title"]}"]')
        await browser.fill('input[placeholder^="Bài 1"]', names["lesson_updated_title"])
        await browser.fill("textarea", names["lesson_body"] + " edited")
        await browser.click_button("Lưu thay đổi")
        await browser.wait_text(names["lesson_updated_title"])
        await browser.click_button("Ẩn bài")
        await browser.wait_text("Xuất bản")
        await browser.click_button("Xuất bản")
        operations.append("LECTURER lesson update/publish/unpublish")

        await browser.click_link("/assignments")
        await browser.wait_text("Bài tập")
        await browser.wait_option("select", names["course_code"])
        await browser.choose_option("select", names["course_code"])
        await browser.click_button("Tạo bài tập mới")
        await browser.fill('input[placeholder^="Bài tập tuần"]', names["assignment_title"])
        await browser.fill('textarea[placeholder^="Nêu rõ yêu cầu"]', "Submit a short response from the student account.")
        due_value = await browser.evaluate("(() => { const d=new Date(Date.now()+10*86400000); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); })()")
        await browser.fill('input[type="datetime-local"]', due_value)
        await browser.click_button("Giao bài tập")
        await browser.wait_text(names["assignment_title"])
        operations.append("LECTURER assignment create")

        await click_card_button(browser, names["assignment_title"], "Sửa")
        await browser.fill('input[placeholder^="Bài tập tuần"]', names["assignment_updated_title"])
        await browser.click_button("Lưu thay đổi")
        await browser.wait_text(names["assignment_updated_title"])
        await click_card_button(browser, names["assignment_updated_title"], "Đóng")
        await browser.wait_text("CLOSED")
        operations.append("LECTURER assignment create/update/close")

        await browser.click_link("/quizzes")
        await browser.wait_text("Bài kiểm tra Trắc nghiệm")
        await browser.wait_option("select", names["course_code"])
        await browser.choose_option("select", names["course_code"])
        await browser.click_button("Tạo bài Quiz mới")
        await browser.fill('input[placeholder="Kiểm tra trắc nghiệm Chương 1"]', names["quiz_title"])
        await browser.fill("textarea", "Real browser authored quiz.")
        await browser.click_button("Lưu bài Quiz")
        await browser.wait_text(names["quiz_title"])
        operations.append("LECTURER quiz create")

        await click_card_button(browser, names["quiz_title"], "+ Câu hỏi")
        await browser.fill('input[placeholder*="ưu điểm cốt lõi"]', names["question_text"])
        for option, value in zip("ABCD", ("Choice A", "Choice B", "Choice C", "Choice D")):
            await browser.fill(f'input[placeholder="Nội dung đáp án {option}"]', value)
        await browser.choose_option("form select", "Đáp án A")
        await browser.click_button("Lưu câu hỏi")
        operations.append("LECTURER quiz question create")

        await click_card_button(browser, names["quiz_title"], "Sửa")
        await browser.fill('input[placeholder="Kiểm tra trắc nghiệm Chương 1"]', names["quiz_updated_title"])
        await browser.wait_button_enabled("Lưu thay đổi")
        await browser.click_button("Lưu thay đổi")
        await browser.wait_text(names["quiz_updated_title"])
        await click_card_button(browser, names["quiz_updated_title"], "Ẩn")
        await browser.wait_text("Bản nháp / đã ẩn")
        await click_card_button(browser, names["quiz_updated_title"], "Xuất bản")
        await click_card_button(browser, names["quiz_updated_title"], "Xem trước")
        await browser.wait_text(names["question_text"])
        await browser.click_button("Sửa câu hỏi")
        await browser.fill('input[placeholder*="ưu điểm cốt lõi"]', names["question_updated_text"])
        await browser.wait_button_enabled("Lưu thay đổi")
        await browser.click_button("Lưu thay đổi")
        await browser.wait_text(names["question_updated_text"])
        await browser.screenshot_main("lecturer_quiz_question_edit.png")
        screenshots.append("lecturer_quiz_question_edit.png")
        await browser.click_selector('button[aria-label="Đóng bản xem trước"]')
        operations.append("LECTURER quiz/question update and publish lifecycle")
        print("PHASE_LECTURER_AUTHORING_PASS", flush=True)

        await browser.click_selector('button[title="Đăng xuất"]')
        await browser.wait_text("Đăng nhập hệ thống")

        # Student: view real published records, submit work, attempt quiz, and view grade.
        await fill_login(browser, ACCOUNTS["STUDENT"])
        await browser.click_link("/courses")
        await browser.wait_text(names["course_updated_title"])
        course_href = await browser.evaluate(
            "(() => [...document.querySelectorAll('a[href^=\"/courses/\"]')].find(a => a.innerText.includes("
            + json.dumps(names["course_updated_title"])
            + "))?.getAttribute('href'))()"
        )
        if not course_href:
            raise AssertionError("The actively enrolled student could not open the course from the actual course list.")
        await browser.click_link(course_href)
        await browser.wait_text(names["lesson_updated_title"])
        await browser.assert_visible(names["lesson_body"] + " edited")
        await browser.screenshot_main("student_published_lesson.png")
        screenshots.append("student_published_lesson.png")
        operations.append("STUDENT course and published lesson view")

        await browser.click_link("/assignments")
        await browser.wait_option("select", names["course_code"])
        await browser.choose_option("select", names["course_code"])
        await browser.wait_text(names["assignment_updated_title"])
        await wait_card_text(browser, names["assignment_updated_title"], "Đã đóng")
        await assert_card_action_absent(browser, names["assignment_updated_title"], "Nộp bài tập")
        operations.append("STUDENT sees closed assignment without submit action")

        await browser.click_selector('button[title="Đăng xuất"]')
        await browser.wait_text("Đăng nhập hệ thống")
        await fill_login(browser, ACCOUNTS["LECTURER"])
        await browser.click_link("/assignments")
        await browser.wait_option("select", names["course_code"])
        await browser.choose_option("select", names["course_code"])
        await browser.wait_text(names["assignment_updated_title"])
        await click_card_button(browser, names["assignment_updated_title"], "Mở lại")
        await wait_card_button(browser, names["assignment_updated_title"], "Đóng")
        operations.append("LECTURER reopens assignment after student-state check")

        await browser.click_selector('button[title="Đăng xuất"]')
        await browser.wait_text("Đăng nhập hệ thống")
        await fill_login(browser, ACCOUNTS["STUDENT"])
        await browser.click_link("/assignments")
        await browser.wait_option("select", names["course_code"])
        await browser.choose_option("select", names["course_code"])
        await browser.wait_text(names["assignment_updated_title"])
        await browser.click_button("Nộp bài tập")
        await browser.fill('textarea[placeholder^="Dán câu trả lời"]', names["assignment_submission"])
        await browser.click_button("Xác nhận nộp bài")
        await browser.wait_text(names["assignment_updated_title"])
        await wait_card_button(browser, names["assignment_updated_title"], "Cập nhật bài nộp")
        operations.append("STUDENT assignment submit")

        await browser.click_link("/quizzes")
        await browser.wait_text(names["quiz_updated_title"])
        await click_card_button(browser, names["quiz_updated_title"], "Làm bài")
        await browser.wait_text(names["question_updated_text"])
        attempt_start = await browser.wait_for_attempt_start()
        if (
            not attempt_start["attempt_id"]
            or not attempt_start["started_at"]
            or int(attempt_start["time_limit_minutes"] or 0) <= 0
            or float(attempt_start["max_score"] or 0) <= 0
            or attempt_start["question_count"] <= 0
            or attempt_start["private_fields"]
        ):
            raise AssertionError(f"Actual quiz start response violated the student-safe contract: {attempt_start}")
        question_id = await browser.evaluate("document.querySelector('input[type=radio]')?.name")
        if not question_id:
            raise AssertionError("The student quiz attempt did not render real answer controls.")
        await browser.click_selector(f'input[name="{question_id}"][value="A"]')
        await browser.click_button("Nộp bài", exact=False)
        await browser.wait_text("Kết quả bài làm của bạn")
        score_text = await browser.evaluate("document.body.innerText")
        if "2.5 / 2.5" not in score_text:
            raise AssertionError("The real quiz attempt did not render the expected score out of the computed maximum.")
        if attempt_start["attempt_id"] not in browser.quiz_submission_attempt_ids:
            raise AssertionError(
                "The real browser submitted a quiz attempt ID that did not match the ID returned by /attempts/start."
            )
        await browser.screenshot_main("student_quiz_result.png")
        screenshots.append("student_quiz_result.png")
        operations.append("STUDENT quiz attempt, submit, score view")
        print("PHASE_STUDENT_SUBMISSION_PASS", flush=True)
        await browser.click_button("Hoàn thành và Đóng")

        await browser.click_selector('button[title="Đăng xuất"]')
        await browser.wait_text("Đăng nhập hệ thống")

        # Lecturer verifies the real submission and quiz attempt, then grades the assignment.
        await fill_login(browser, ACCOUNTS["LECTURER"])
        await browser.click_link("/assignments")
        await browser.wait_option("select", names["course_code"])
        await browser.choose_option("select", names["course_code"])
        await browser.wait_text(names["assignment_updated_title"])
        await click_card_button(browser, names["assignment_updated_title"], "Xem & Chấm bài")
        await browser.wait_text(names["assignment_submission"])
        await browser.click_button("Chấm điểm")
        await browser.fill('input[type="number"]', "8")
        await browser.fill('textarea[placeholder^="Ghi nhận xét"]', names["assignment_feedback"])
        await browser.click_button("Lưu điểm")
        await browser.wait_text("Danh sách bài nộp")
        operations.append("LECTURER submission view and grade")

        await browser.click_link("/quizzes")
        await browser.wait_text(names["quiz_updated_title"])
        await click_card_button(browser, names["quiz_updated_title"], "Lượt làm")
        await browser.wait_text("SUBMITTED")
        await browser.assert_visible("2.5 điểm")
        operations.append("LECTURER quiz attempt view")

        await browser.click_selector('button[title="Đăng xuất"]')
        await browser.wait_text("Đăng nhập hệ thống")

        await fill_login(browser, ACCOUNTS["STUDENT"])
        await browser.click_link("/assignments")
        await browser.wait_option("select", names["course_code"])
        await browser.choose_option("select", names["course_code"])
        await wait_card_text(browser, names["assignment_updated_title"], "Đã chấm")
        await assert_card_action_absent(browser, names["assignment_updated_title"], "Cập nhật bài nộp")
        await assert_card_action_absent(browser, names["assignment_updated_title"], "Nộp bài tập")
        operations.append("STUDENT sees graded assignment without edit/submit actions")
        await browser.click_link("/grades")
        await browser.wait_text("Bảng điểm & Kết quả học tập cá nhân")
        await browser.wait_text(names["assignment_updated_title"])
        await browser.wait_text(names["quiz_updated_title"])
        await browser.wait_text(names["assignment_feedback"])
        operations.append("STUDENT gradebook view after grading")
        print("PHASE_GRADEBOOK_PASS", flush=True)
        expired_token = create_expired_student_token()
        expiration_response_start = len(browser.api_responses)
        await browser.evaluate("localStorage.setItem('token', " + json.dumps(expired_token) + ")")
        await browser.send("Page.reload")
        await asyncio.sleep(0.8)
        await browser.wait_text("Đăng nhập hệ thống")
        cleared_session = await browser.evaluate(
            "localStorage.getItem('token') === null && localStorage.getItem('user') === null"
        )
        if not cleared_session:
            raise AssertionError("An expired student token did not clear the browser session.")
        expiration_responses = [
            response for response in browser.api_responses[expiration_response_start:]
            if response == ("GET", "auth/me", 401)
        ]
        if not expiration_responses:
            raise AssertionError("The real API did not reject the expired token on /auth/me.")
        browser.expected_api_failures.extend(expiration_responses)
        operations.append("STUDENT expired token clears session and redirects to login")

        # Admin proves reversible drop/archive states and leaves the test course active for later inspection.
        await fill_login(browser, ACCOUNTS["ADMIN"])
        await browser.navigate(f"{FRONTEND_URL}/courses")
        await browser.wait_text(names["course_updated_title"])
        await click_card_button(browser, names["course_updated_title"], "Lưu trữ")
        await wait_card_button(browser, names["course_updated_title"], "Mở lại")
        await click_card_button(browser, names["course_updated_title"], "Mở lại")
        await wait_card_button(browser, names["course_updated_title"], "Lưu trữ")
        operations.append("ADMIN course archive/reactivate")

        await click_card_button(browser, names["course_updated_title"], "Chi tiết")
        await browser.wait_text(names["course_updated_title"])
        await browser.wait_text("Danh sách sinh viên")
        await browser.click_button("Danh sách sinh viên", exact=False)
        await click_row_button(browser, ACCOUNTS["STUDENT"], "Rút ghi danh")
        await browser.wait_text("DROPPED")
        await browser.click_button("Ghi danh sinh viên")
        await browser.wait_option("form select", ACCOUNTS["STUDENT"])
        await browser.choose_option("form select", ACCOUNTS["STUDENT"])
        await browser.click_button("Xác nhận ghi danh")
        await browser.wait_text("Rút ghi danh")
        operations.append("ADMIN enrollment drop/reactivate")
        print("PHASE_ADMIN_REVERSIBLE_DELETE_PASS", flush=True)

        persisted = verify_persisted_results(names)
        if any(status < 200 or status >= 300 for _, _, status in browser.network_writes):
            failed = [entry for entry in browser.network_writes if entry[2] < 200 or entry[2] >= 300]
            raise AssertionError(f"Actual browser write requests returned non-success statuses: {failed}")
        failed_api = [entry for entry in browser.api_responses if entry[2] < 200 or entry[2] >= 300]
        unexpected_api_failures = list(failed_api)
        for expected in browser.expected_api_failures:
            if expected in unexpected_api_failures:
                unexpected_api_failures.remove(expected)
        if unexpected_api_failures:
            raise AssertionError(f"Actual browser API requests returned unexpected non-success statuses: {unexpected_api_failures}")
        if len(browser.expected_api_failures) != len(failed_api):
            raise AssertionError(
                f"Observed API rejection count did not match the expired-session scenario: "
                f"expected {browser.expected_api_failures}, observed {failed_api}"
            )
        expected_auth_resource_errors = [
            detail for detail in browser.console_error_details
            if detail.get("source") == "Log.entryAdded"
            and detail.get("message") == "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
            and detail.get("url", "").rstrip("/").endswith("/api/auth/me")
        ]
        unexpected_console_errors = [
            detail for detail in browser.console_error_details
            if detail not in expected_auth_resource_errors
        ]
        expected_auth_401_count = sum(
            response == ("GET", "auth/me", 401)
            for response in browser.expected_api_failures
        )
        if len(expected_auth_resource_errors) != expected_auth_401_count:
            raise AssertionError(
                f"Expected one DevTools auth/me resource error per actual 401 response, got "
                f"{len(expected_auth_resource_errors)} log entries for {expected_auth_401_count} responses."
            )
        if unexpected_console_errors:
            raise AssertionError(
                "Chrome DevTools observed unexpected console errors/exceptions: "
                f"{json.dumps(unexpected_console_errors, ensure_ascii=False)}"
            )

        screenshot_names = ", ".join(screenshots)
        log_lines = [
            f"# Live Chrome DevTools CRUD E2E — {datetime.now(timezone.utc).isoformat()}",
            f"Database boundary: {EXPECTED_DATABASE} (verified by SQL Server SELECT DB_NAME()).",
            f"Frontend: {FRONTEND_URL}; API: http://127.0.0.1:8001 (SQL Server-backed).",
            "All browser interactions used visible controls on the real app; API writes went through the app UI.",
            "Actors authenticated: ADMIN, LECTURER, STUDENT seeded in the disposable database.",
            f"API-to-database preflight: ADMIN UI loaded course {test_marker[0]} from test DB marker {test_marker[1]!r} before writes.",
            "Passed operations:",
            *[f"- {operation}" for operation in operations],
            f"Successful browser write requests: {len(browser.network_writes)}.",
            f"Successful API responses: {sum(200 <= status < 300 for _, _, status in browser.api_responses)}; expected expired-session 401 responses: {len(browser.expected_api_failures)}; unexpected non-2xx responses: 0.",
            f"Quiz start response attempt_id: {attempt_start['attempt_id']}; same ID used on submit: {attempt_start['attempt_id'] in browser.quiz_submission_attempt_ids}; question_count: {attempt_start['question_count']}; private_fields: {attempt_start['private_fields']}.",
            f"SQL Server persisted checks passed: {len(persisted)}.",
            f"Unexpected console exceptions/errors observed: {len(unexpected_console_errors)}; expected expired-token auth/me resource errors: {len(expected_auth_resource_errors)}.",
            f"Screenshots captured from actual main content: {screenshot_names}.",
        ]
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        (EVIDENCE_DIR / "live_crud_e2e.log").write_text("\n".join(log_lines) + "\n", encoding="utf-8")
        print("LIVE_E2E=PASS")
        print(f"DATABASE={EXPECTED_DATABASE}")
        print(f"OPERATIONS={len(operations)}")
        print(f"BROWSER_WRITES={len(browser.network_writes)}")
        print(f"PERSISTED_CHECKS={len(persisted)}")
        print(f"UNEXPECTED_CONSOLE_ERRORS={len(unexpected_console_errors)}")
        print(f"EXPECTED_AUTH_RESOURCE_401_LOGS={len(expected_auth_resource_errors)}")
        print(f"EVIDENCE={EVIDENCE_DIR}")
    except Exception:
        print(f"BROWSER_WRITES_BEFORE_FAILURE={browser.network_writes}", flush=True)
        print(f"CONSOLE_ERRORS_BEFORE_FAILURE={browser.console_errors}", flush=True)
        if browser.console_error_details:
            print(
                "CONSOLE_ERROR_DETAILS_BEFORE_FAILURE="
                + json.dumps(browser.console_error_details, ensure_ascii=False),
                flush=True,
            )
        raise
    finally:
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
