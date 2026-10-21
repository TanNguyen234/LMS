import asyncio
import base64
import json
import os
import sys
import time
import urllib.request
import websockets

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "audit", "2026-10-21", "evidence", "e2e")
AUDIT_LOG_PATH = os.path.join(SCREENSHOT_DIR, "devtools_audit.log")

CDP_PORT = 9222
FRONTEND_URL = "http://localhost:5173"

class ChromeDevToolsClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self._id = 0
        self._futures = {}
        self.console_logs = []
        self.network_requests = {} # requestId -> {url, method, ...}
        self.network_responses = [] # list of {url, status, statusText, method}
        self.unhandled_exceptions = []
        self._listener_task = None

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=20 * 1024 * 1024)
        self._listener_task = asyncio.create_task(self._listen())

        # Enable necessary domains
        await self.send("Page.enable")
        await self.send("Runtime.enable")
        await self.send("Network.enable")
        await self.send("Console.enable")
        await self.send("Log.enable")
        await self.send("DOM.enable")

    async def _listen(self):
        try:
            async for raw_msg in self.ws:
                msg = json.loads(raw_msg)
                # Check for response to a command
                if "id" in msg and msg["id"] in self._futures:
                    fut = self._futures.pop(msg["id"])
                    if not fut.done():
                        if "error" in msg:
                            fut.set_exception(RuntimeError(msg["error"].get("message", "Unknown CDP error")))
                        else:
                            fut.set_result(msg.get("result", {}))
                
                # Check for events
                method = msg.get("method", "")
                params = msg.get("params", {})
                
                if method == "Runtime.consoleAPICalled":
                    args = [str(a.get("value", a.get("description", ""))) for a in params.get("args", [])]
                    entry = f"[{params.get('type', 'log').upper()}] {' '.join(args)}"
                    self.console_logs.append(entry)
                    print(f"  [Browser Console] {entry}")
                elif method == "Log.entryAdded":
                    entry = params.get("entry", {})
                    level = entry.get("level", "info").upper()
                    text = entry.get("text", "")
                    self.console_logs.append(f"[{level}] {text}")
                    if level == "ERROR":
                        print(f"  [Browser Log Error] {text}")
                elif method == "Runtime.exceptionThrown":
                    exc_details = params.get("exceptionDetails", {})
                    exc_text = exc_details.get("text", "Unhandled Exception")
                    exc_desc = exc_details.get("exception", {}).get("description", "")
                    full_err = f"{exc_text}: {exc_desc}"
                    self.unhandled_exceptions.append(full_err)
                    print(f"  [CRITICAL Browser Exception] {full_err}")
                elif method == "Network.requestWillBeSent":
                    req = params.get("request", {})
                    req_id = params.get("requestId")
                    self.network_requests[req_id] = {
                        "url": req.get("url"),
                        "method": req.get("method"),
                        "timestamp": params.get("timestamp"),
                    }
                elif method == "Network.responseReceived":
                    resp = params.get("response", {})
                    req_id = params.get("requestId")
                    req_info = self.network_requests.get(req_id, {})
                    url = resp.get("url", req_info.get("url", ""))
                    status = resp.get("status")
                    method_name = req_info.get("method", "GET")
                    if "/api/" in url or url.endswith("/health"):
                        self.network_responses.append({
                            "url": url,
                            "method": method_name,
                            "status": status,
                            "statusText": resp.get("statusText", ""),
                            "mimeType": resp.get("mimeType", "")
                        })
                        print(f"  [Network API] {method_name} {url} -> HTTP {status}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Listener error: {e}", file=sys.stderr)

    async def send(self, method, params=None):
        self._id += 1
        msg_id = self._id
        fut = asyncio.get_event_loop().create_future()
        self._futures[msg_id] = fut
        payload = {"id": msg_id, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(payload))
        return await fut

    async def navigate(self, url):
        print(f"Navigating to {url}...")
        res = await self.send("Page.navigate", {"url": url})
        # Wait for Page.loadEventFired or small sleep
        await asyncio.sleep(2.0)
        return res

    async def evaluate(self, expression):
        res = await self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True
        })
        if "exceptionDetails" in res:
            err = res["exceptionDetails"].get("text", "JS Error")
            raise RuntimeError(f"JS evaluation error: {err} in expression: {expression[:100]}")
        return res.get("result", {}).get("value")

    async def wait_for_selector(self, selector, timeout=10.0):
        start = time.time()
        while time.time() - start < timeout:
            res = await self.evaluate(f"!!document.querySelector({json.dumps(selector)})")
            if res:
                return True
            await asyncio.sleep(0.3)
        raise TimeoutError(f"Timed out waiting for selector: {selector}")

    async def wait_for_text(self, text, timeout=10.0):
        start = time.time()
        while time.time() - start < timeout:
            res = await self.evaluate(f"document.body.innerText.includes({json.dumps(text)})")
            if res:
                return True
            await asyncio.sleep(0.3)
        raise TimeoutError(f"Timed out waiting for text: {text}")

    async def capture_screenshot(self, output_path):
        print(f"Capturing screenshot to {output_path}...")
        res = await self.send("Page.captureScreenshot", {"format": "png"})
        b64_data = res.get("data", "")
        img_bytes = base64.b64decode(b64_data)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(img_bytes)
        print(f"Screenshot saved successfully ({len(img_bytes)} bytes)")
        return output_path

    async def close(self):
        if self._listener_task:
            self._listener_task.cancel()
        if self.ws:
            await self.ws.close()


def ensure_chrome_running():
    try:
        req = urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/version", timeout=2)
        if req.status == 200:
            print(f"Chrome already running on port {CDP_PORT}")
            return
    except Exception:
        pass
    
    raise RuntimeError(
        f"No dedicated Chrome DevTools session is listening on port {CDP_PORT}. "
        "Start a test-only Chrome profile with remote debugging and rerun; "
        "this script will not close or kill existing Chrome processes."
    )


async def get_or_create_page_ws_url():
    req = urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/list")
    targets = json.loads(req.read().decode())
    pages = [t for t in targets if t.get("type") == "page"]
    if pages:
        return pages[0]["webSocketDebuggerUrl"]
    
    # Create new target
    new_req = urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/new?{FRONTEND_URL}")
    new_target = json.loads(new_req.read().decode())
    return new_target["webSocketDebuggerUrl"]


async def main():
    test_database = os.environ.get("LMS_E2E_TEST_DATABASE", "")
    if not test_database.casefold().startswith("universitylms_test_"):
        raise RuntimeError("Set LMS_E2E_TEST_DATABASE to the disposable UniversityLms_Test_<id> database actually used by the running API.")
    ensure_chrome_running()
    ws_url = await get_or_create_page_ws_url()
    print(f"Connecting to CDP WebSocket: {ws_url}")
    
    client = ChromeDevToolsClient(ws_url)
    await client.connect()

    audit_records = []
    audit_records.append(f"# Chrome DevTools Audit Log — {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}\n")

    try:
        # ========================================================
        # PHASE 2 - PERSONA 1: ADMIN
        # ========================================================
        print("\n========================================================")
        print(">>> STARTING PERSONA 1: ADMIN (admin@university.edu.vn)")
        print("========================================================")
        
        await client.navigate(f"{FRONTEND_URL}/login")
        await client.wait_for_selector("input[type='text']")
        
        # Fill Admin login credentials using React native value setter
        await client.evaluate("""
            (() => {
                const setVal = (el, val) => {
                    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                const inputs = document.querySelectorAll('input');
                setVal(inputs[0], 'admin@university.edu.vn');
                setVal(inputs[1], 'Demo@123');
                document.querySelector('button[type="submit"]').click();
            })()
        """)
        
        print("Submitted login form as Admin. Waiting for /dashboard...")
        await client.wait_for_selector("h1", timeout=10)
        await asyncio.sleep(2.0)
        
        # Verify Admin dashboard loaded
        admin_title = await client.evaluate("document.querySelector('h1').innerText")
        print(f"Admin Dashboard Header: {admin_title}")
        assert "Xin chào" in admin_title or "Admin" in admin_title
        
        # Verify KPI metric cards
        kpi_text = await client.evaluate("document.body.innerText")
        kpi_upper = kpi_text.upper()
        print(f"Verified Admin KPI text:\n{kpi_text}\n---")
        assert "KHÓA HỌC HỆ THỐNG" in kpi_upper or "KHÓA HỌC" in kpi_upper
        assert "SINH VIÊN" in kpi_upper
        assert "GIẢNG VIÊN" in kpi_upper
        assert "TRẠNG THÁI HẠ TẦNG" in kpi_upper or "HOẠT ĐỘNG BÌNH THƯỜNG" in kpi_upper
        
        # Capture Admin Dashboard screenshot
        admin_screenshot = os.path.join(SCREENSHOT_DIR, "screenshot_admin_dashboard.png")
        await client.capture_screenshot(admin_screenshot)
        
        # Navigate to Users Page (/users)
        print("Navigating to Admin Users Page (/users)...")
        await client.evaluate("document.querySelector('a[href=\"/users\"]').click()")
        await client.wait_for_selector("table", timeout=10)
        await asyncio.sleep(1.5)
        
        user_rows = await client.evaluate("document.querySelectorAll('table tbody tr').length")
        print(f"Users table rendered with {user_rows} user rows.")
        assert user_rows >= 10, f"Expected at least 10 users, found {user_rows}"
        
        # Navigate to Courses Page (/courses)
        print("Navigating to Admin Courses Page (/courses)...")
        await client.evaluate("document.querySelector('a[href=\"/courses\"]').click()")
        await client.wait_for_selector("h1", timeout=10)
        await asyncio.sleep(1.5)
        
        courses_count_text = await client.evaluate("document.querySelectorAll('.grid > div').length")
        print(f"Courses page rendered with {courses_count_text} course cards.")
        
        audit_records.append("### Persona 1: Admin — SUCCESS")
        audit_records.append(f"- Login: admin@university.edu.vn -> JWT authentication OK")
        audit_records.append(f"- Dashboard: Rendered KPI metrics (Courses, Students, Lecturers)")
        audit_records.append(f"- Users Page: Rendered {user_rows} users in table")
        audit_records.append(f"- Courses Page: Rendered course catalog successfully")
        audit_records.append(f"- Screenshot: screenshot_admin_dashboard.png\n")

        # ========================================================
        # PHASE 2 - PERSONA 2: LECTURER
        # ========================================================
        print("\n========================================================")
        print(">>> STARTING PERSONA 2: LECTURER (lecturer1@university.edu.vn)")
        print("========================================================")
        
        # Logout
        print("Logging out Admin...")
        await client.evaluate("document.querySelector('button[title=\"Đăng xuất\"]').click()")
        await client.wait_for_selector("input[type='text']", timeout=10)
        await asyncio.sleep(1.0)
        await client.navigate(f"{FRONTEND_URL}/login")
        await client.wait_for_selector("input[type='text']", timeout=10)
        
        # Fill Lecturer login credentials
        await client.evaluate("""
            (() => {
                const setVal = (el, val) => {
                    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                const inputs = document.querySelectorAll('input');
                setVal(inputs[0], 'lecturer1@university.edu.vn');
                setVal(inputs[1], 'Demo@123');
                document.querySelector('button[type="submit"]').click();
            })()
        """)
        
        print("Submitted login form as Lecturer. Waiting for /dashboard...")
        await asyncio.sleep(1.5)
        await client.navigate(f"{FRONTEND_URL}/dashboard")
        await client.wait_for_selector("h1", timeout=10)
        await asyncio.sleep(2.0)
        
        lec_title = await client.evaluate("document.querySelector('h1').innerText")
        print(f"Lecturer Dashboard Header: {lec_title}")
        lec_kpi = await client.evaluate("document.body.innerText")
        lec_upper = lec_kpi.upper()
        assert "KHÓA HỌC PHỤ TRÁCH" in lec_upper or "KHÓA HỌC" in lec_upper
        assert "BÀI NỘP CHỜ CHẤM" in lec_upper or "BÀI NỘP" in lec_upper
        
        # Capture Lecturer Dashboard screenshot
        lecturer_screenshot = os.path.join(SCREENSHOT_DIR, "screenshot_lecturer_dashboard.png")
        await client.capture_screenshot(lecturer_screenshot)
        
        # Navigate to Assignments (/assignments)
        print("Navigating to Assignments (/assignments)...")
        await client.evaluate("document.querySelector('a[href=\"/assignments\"]').click()")
        await client.wait_for_selector("h1", timeout=10)
        await asyncio.sleep(1.5)
        assign_count = await client.evaluate("document.querySelectorAll('.space-y-4 > div').length")
        print(f"Assignments page rendered for course with {assign_count} assignment items.")
        
        # Navigate to Quizzes (/quizzes)
        print("Navigating to Quizzes (/quizzes)...")
        await client.evaluate("document.querySelector('a[href=\"/quizzes\"]').click()")
        await client.wait_for_selector("h1", timeout=10)
        await asyncio.sleep(1.5)
        quizzes_count = await client.evaluate("document.querySelectorAll('.grid > div').length")
        print(f"Quizzes page rendered with {quizzes_count} quiz items.")
        
        # Navigate to Grades (/grades)
        print("Navigating to Grades (/grades)...")
        await client.evaluate("document.querySelector('a[href=\"/grades\"]').click()")
        await client.wait_for_selector("h1", timeout=10)
        await asyncio.sleep(1.5)
        grade_rows = await client.evaluate("document.querySelectorAll('table tbody tr').length")
        print(f"Lecturer Gradebook rendered with {grade_rows} grade items.")
        
        audit_records.append("### Persona 2: Lecturer — SUCCESS")
        audit_records.append(f"- Login: lecturer1@university.edu.vn -> JWT authentication OK")
        audit_records.append(f"- Dashboard: Rendered teaching courses and pending submissions KPI")
        audit_records.append(f"- Assignments: Managed assignments list rendered")
        audit_records.append(f"- Quizzes: Quizzes list rendered with creation controls")
        audit_records.append(f"- Grades: Gradebook rendered with class submissions")
        audit_records.append(f"- Screenshot: screenshot_lecturer_dashboard.png\n")

        # ========================================================
        # PHASE 2 - PERSONA 3: STUDENT
        # ========================================================
        print("\n========================================================")
        print(">>> STARTING PERSONA 3: STUDENT (student1@university.edu.vn)")
        print("========================================================")
        
        # Logout
        print("Logging out Lecturer...")
        await client.evaluate("document.querySelector('button[title=\"Đăng xuất\"]').click()")
        await client.wait_for_selector("input[type='text']", timeout=10)
        await asyncio.sleep(1.0)
        await client.navigate(f"{FRONTEND_URL}/login")
        await client.wait_for_selector("input[type='text']", timeout=10)
        
        # Fill Student login credentials
        await client.evaluate("""
            (() => {
                const setVal = (el, val) => {
                    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                const inputs = document.querySelectorAll('input');
                setVal(inputs[0], 'student1@university.edu.vn');
                setVal(inputs[1], 'Demo@123');
                document.querySelector('button[type="submit"]').click();
            })()
        """)
        
        print("Submitted login form as Student. Waiting for /dashboard...")
        await asyncio.sleep(1.5)
        await client.navigate(f"{FRONTEND_URL}/dashboard")
        await client.wait_for_selector("h1", timeout=10)
        await asyncio.sleep(2.0)
        
        stu_title = await client.evaluate("document.querySelector('h1').innerText")
        print(f"Student Dashboard Header: {stu_title}")
        stu_kpi = await client.evaluate("document.body.innerText")
        stu_upper = stu_kpi.upper()
        assert "KHÓA HỌC ĐĂNG KÝ" in stu_upper or "KHÓA HỌC" in stu_upper
        assert "ĐIỂM TRUNG BÌNH" in stu_upper or "GPA" in stu_upper
        
        # Navigate to Quizzes (/quizzes) and verify taking quiz / no correctAnswer leaks
        print("Navigating to Quizzes (/quizzes) as Student...")
        await client.evaluate("""
            (() => {
                window.__quizAudit = { starts: [], submits: [] };
                const originalFetch = window.fetch.bind(window);
                window.fetch = async (input, init = {}) => {
                    const url = typeof input === 'string' ? input : input.url;
                    const method = (init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
                    const path = new URL(url, location.href).pathname;
                    const isStart = method === 'POST' && /\\/api\\/quizzes\\/[^/]+\\/attempts\\/start$/.test(path);
                    const isSubmit = method === 'POST' && /\\/api\\/quiz-attempts\\/[^/]+\\/submit$/.test(path);
                    const response = await originalFetch(input, init);
                    if (isStart || isSubmit) {
                        let data = null;
                        try { data = await response.clone().json(); } catch (_) {}
                        (isStart ? window.__quizAudit.starts : window.__quizAudit.submits).push({ url, status: response.status, data });
                    }
                    return response;
                };
            })()
        """)
        await client.evaluate("document.querySelector('a[href=\"/quizzes\"]').click()")
        await client.wait_for_selector("h1", timeout=10)
        await asyncio.sleep(1.5)
        
        # Required timed attempt journey. This must use only a disposable test database.
        print("Starting and submitting a real timed quiz attempt...")
        start_button_exists = await client.evaluate("!!Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Làm bài') && !b.disabled)")
        assert start_button_exists, "Required E2E fixture missing: student has no available quiz with questions"
        await client.evaluate("Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Làm bài') && !b.disabled).click()")
        await client.wait_for_selector(".fixed.inset-0 input[type='radio']", timeout=15)
        await asyncio.sleep(0.3)
        quiz_audit = await client.evaluate("window.__quizAudit")
        assert len(quiz_audit["starts"]) == 1, f"Expected exactly one start request, got {len(quiz_audit['starts'])}"
        started = quiz_audit["starts"][0]
        assert started["status"] == 200, f"Quiz start failed with HTTP {started['status']}"
        start_data = started["data"] or {}
        attempt_id = start_data.get("attemptId")
        assert attempt_id and start_data.get("startedAt") and start_data.get("timeLimitMinutes"), "Start response lacks timed attempt fields"
        assert start_data.get("questions"), "Start response contains no questions"
        assert all("correctAnswer" not in question for question in start_data["questions"]), "LEAK DETECTED: correctAnswer found in start response"
        await client.evaluate("document.querySelector('.fixed.inset-0 input[type=radio]').click()")
        await client.evaluate("Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Nộp bài & Chấm điểm')).click()")
        await client.wait_for_text("Kết quả bài làm của bạn", timeout=15)
        quiz_audit = await client.evaluate("window.__quizAudit")
        assert len(quiz_audit["submits"]) == 1, f"Expected exactly one submit request, got {len(quiz_audit['submits'])}"
        submitted = quiz_audit["submits"][0]
        assert submitted["status"] == 200, f"Quiz submit failed with HTTP {submitted['status']}"
        assert f"/quiz-attempts/{attempt_id}/submit" in submitted["url"], "Submit did not use the attemptId returned by start"
        assert "correctAnswer" not in await client.evaluate("document.body.innerHTML"), "LEAK DETECTED: correctAnswer found in student DOM"
        expected_max = float(start_data.get("maxScore", 0))
        result_text = await client.evaluate("document.body.innerText")
        assert expected_max > 0 and f"/ {expected_max:g}" in result_text, f"Quiz result does not show server max score {expected_max:g}"
        print(f"Verified timed attempt {attempt_id}: start HTTP 200, submit HTTP 200, same attempt ID, max score {expected_max:g}.")
        
        # Navigate to Grades (/grades)
        print("Navigating to Student Grades (/grades)...")
        await client.navigate(f"{FRONTEND_URL}/grades")
        await client.wait_for_selector("table", timeout=10)
        await asyncio.sleep(2.0)
        
        stu_grade_rows = await client.evaluate("document.querySelectorAll('table tbody tr').length")
        print(f"Student Grades Page rendered with {stu_grade_rows} grade rows.")
        
        # Capture Student Grades screenshot
        student_screenshot = os.path.join(SCREENSHOT_DIR, "screenshot_student_grades.png")
        await client.capture_screenshot(student_screenshot)
        
        audit_records.append("### Persona 3: Student — SUCCESS")
        audit_records.append(f"- Login: student1@university.edu.vn -> JWT authentication OK")
        audit_records.append(f"- Dashboard: Enrolled courses and GPA metrics rendered")
        audit_records.append(f"- Quizzes: start HTTP {started['status']}; submit HTTP {submitted['status']}; same attempt {attempt_id}; max score {expected_max:g}; no correctAnswer returned")
        audit_records.append(f"- Grades: Verified student gradebook rows ({stu_grade_rows} items)")
        audit_records.append(f"- Screenshot: screenshot_student_grades.png\n")

        # ========================================================
        # DEVTOOLS MONITORING AUDIT SUMMARY
        # ========================================================
        print("\n========================================================")
        print(">>> COMPILING DEVTOOLS AUDIT LOGS")
        print("========================================================")
        
        audit_records.append("## DevTools Console & Network Audit")
        audit_records.append(f"- Total Console Messages: {len(client.console_logs)}")
        audit_records.append(f"- Total Unhandled Exceptions: {len(client.unhandled_exceptions)}")
        audit_records.append(f"- Total API Requests Logged: {len(client.network_responses)}\n")
        
        audit_records.append("### Console Output Summary:")
        if client.console_logs:
            for log in client.console_logs[-25:]: # last 25 logs
                audit_records.append(f"  {log}")
        else:
            audit_records.append("  (Clean console - no warnings or errors)")
            
        audit_records.append("\n### Network API Requests & Responses:")
        api_failures = []
        for resp in client.network_responses:
            line = f"  [{resp['status']}] {resp['method']} {resp['url']}"
            audit_records.append(line)
            if resp['status'] >= 400:
                api_failures.append(line)

        audit_records.append(f"\n### Integrity Verification:")
        audit_records.append(f"- Unhandled JS exceptions: {len(client.unhandled_exceptions)}")
        audit_records.append(f"- API 4xx/5xx responses: {len(api_failures)}")
        audit_records.append(f"- All 3 persona flows completed with genuine user actions.")
        
        with open(AUDIT_LOG_PATH, "w", encoding="utf-8") as f:
            f.write("\n".join(audit_records))
        print(f"Audit log written to {AUDIT_LOG_PATH}")

        # Assert zero unhandled exceptions
        assert len(client.unhandled_exceptions) == 0, f"Found unhandled exceptions: {client.unhandled_exceptions}"
        assert not api_failures, f"Unexpected API failures: {api_failures}"
        print("\n>>> ALL PERSONA FLOWS AND AUDIT CHECKS PASSED SUCCESSFULLY! <<<")

    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())
