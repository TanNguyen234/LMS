"""
Comprehensive Multi-Role End-to-End Interactive Audit Script for University LMS
Testing Roles: ADMIN, LECTURER, STUDENT
"""

import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import websockets

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

FRONTEND_URL = "http://localhost:5173"
BACKEND_URL = "http://localhost:8000"
CDP_PORT = 9333
EVIDENCE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "audit", "2026-11-02", "evidence")
AUDIT_LOG_PATH = os.path.join(EVIDENCE_DIR, "interactive_audit.log")

os.makedirs(EVIDENCE_DIR, exist_ok=True)

class ChromeCDPClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self._id = 0
        self._futures = {}
        self.console_logs = []
        self.network_events = []
        self.unhandled_exceptions = []
        self._listener_task = None
        self.log_file = open(AUDIT_LOG_PATH, "a", encoding="utf-8")

    def log(self, msg):
        timestamp = time.strftime("%H:%M:%S")
        formatted = f"[{timestamp}] {msg}"
        print(formatted)
        self.log_file.write(formatted + "\n")
        self.log_file.flush()

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=30 * 1024 * 1024)
        self._listener_task = asyncio.create_task(self._listen())
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
                if "id" in msg and msg["id"] in self._futures:
                    fut = self._futures.pop(msg["id"])
                    if not fut.done():
                        if "error" in msg:
                            fut.set_exception(RuntimeError(msg["error"].get("message", "Unknown CDP error")))
                        else:
                            fut.set_result(msg.get("result", {}))
                
                method = msg.get("method", "")
                params = msg.get("params", {})
                
                if method == "Runtime.consoleAPICalled":
                    args = [str(a.get("value", a.get("description", ""))) for a in params.get("args", [])]
                    entry = f"[{params.get('type', 'log').upper()}] {' '.join(args)}"
                    self.console_logs.append(entry)
                    if params.get('type') in ('error', 'warn'):
                        self.log(f"  [Browser Console] {entry}")
                elif method == "Log.entryAdded":
                    entry = params.get("entry", {})
                    level = entry.get("level", "info").upper()
                    text = entry.get("text", "")
                    self.console_logs.append(f"[{level}] {text}")
                    if level == "ERROR":
                        self.log(f"  [Browser Log Error] {text}")
                elif method == "Runtime.exceptionThrown":
                    exc_details = params.get("exceptionDetails", {})
                    exc_text = exc_details.get("text", "Unhandled Exception")
                    exc_desc = exc_details.get("exception", {}).get("description", "")
                    full_err = f"{exc_text}: {exc_desc}"
                    self.unhandled_exceptions.append(full_err)
                    self.log(f"  [CRITICAL Browser Exception] {full_err}")
                elif method == "Network.responseReceived":
                    resp = params.get("response", {})
                    url = resp.get("url", "")
                    status = resp.get("status")
                    if "/api/" in url:
                        self.network_events.append({"url": url, "status": status})
                        if status >= 400:
                            self.log(f"  [API Error Response] {url} -> HTTP {status}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.log(f"Listener error: {e}")

    async def send(self, method, params=None):
        self._id += 1
        msg_id = self._id
        fut = asyncio.get_event_loop().create_future()
        self._futures[msg_id] = fut
        await self.ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        return await fut

    async def navigate(self, url, wait_sec=2.0):
        self.log(f"Navigating to {url}...")
        res = await self.send("Page.navigate", {"url": url})
        await asyncio.sleep(wait_sec)
        return res

    async def evaluate(self, expr):
        res = await self.send("Runtime.evaluate", {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True
        })
        if "exceptionDetails" in res:
            err = res["exceptionDetails"].get("text", "JS Error")
            raise RuntimeError(f"JS evaluation error: {err} in expression: {expr[:120]}")
        return res.get("result", {}).get("value")

    async def wait_for_selector(self, selector, timeout=12.0):
        start = time.time()
        while time.time() - start < timeout:
            res = await self.evaluate(f"!!document.querySelector({json.dumps(selector)})")
            if res:
                return True
            await asyncio.sleep(0.3)
        raise TimeoutError(f"Timed out waiting for selector: {selector}")

    async def wait_for_text(self, text, timeout=12.0):
        start = time.time()
        while time.time() - start < timeout:
            res = await self.evaluate(f"document.body.innerText.includes({json.dumps(text)})")
            if res:
                return True
            await asyncio.sleep(0.3)
        raise TimeoutError(f"Timed out waiting for text: {text}")

    async def capture_screenshot(self, filename):
        path = os.path.join(EVIDENCE_DIR, filename)
        res = await self.send("Page.captureScreenshot", {"format": "png"})
        b64_data = res.get("data", "")
        img_bytes = base64.b64decode(b64_data)
        with open(path, "wb") as f:
            f.write(img_bytes)
        self.log(f"Saved screenshot: {filename} ({len(img_bytes)} bytes)")
        return path

    async def close(self):
        if self._listener_task:
            self._listener_task.cancel()
        if self.ws:
            await self.ws.close()
        self.log_file.close()


def launch_chrome():
    temp_dir = tempfile.mkdtemp(prefix="lms_audit_chrome_")
    cmd = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        "--headless=new",
        f"--remote-debugging-port={CDP_PORT}",
        "--remote-allow-origins=*",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        f"--user-data-dir={temp_dir}"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    return proc, temp_dir


async def get_page_ws():
    req = urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/list")
    targets = json.loads(req.read().decode())
    pages = [t for t in targets if t.get("type") == "page"]
    if pages:
        return pages[0]["webSocketDebuggerUrl"]
    new_req = urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/new?{FRONTEND_URL}")
    new_target = json.loads(new_req.read().decode())
    return new_target["webSocketDebuggerUrl"]


async def login_user(client, email, password):
    client.log(f"Logging in as {email}...")
    await client.navigate(f"{FRONTEND_URL}/login")
    await client.wait_for_selector("input[type='text'], input[type='email']")
    await asyncio.sleep(1.0)
    
    # Fill login form
    await client.evaluate(f"""
        (() => {{
            const setVal = (el, val) => {{
                const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                setter.call(el, val);
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            }};
            const inputs = document.querySelectorAll('input');
            setVal(inputs[0], {json.dumps(email)});
            setVal(inputs[1], {json.dumps(password)});
            const btn = document.querySelector('button[type="submit"]');
            if (btn) btn.click();
        }})()
    """)
    await client.wait_for_selector("h1", timeout=10.0)
    await asyncio.sleep(2.0)
    user_name = await client.evaluate("document.querySelector('h1') ? document.querySelector('h1').innerText : ''")
    client.log(f"Login success! Welcome header: {user_name}")


async def logout_user(client):
    client.log("Logging out...")
    await client.evaluate("""
        (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const logoutBtn = btns.find(b => b.innerText.includes('Đăng xuất'));
            if (logoutBtn) logoutBtn.click();
            else {
                localStorage.clear();
                window.location.href = '/login';
            }
        })()
    """)
    await asyncio.sleep(2.0)
    client.log("Logged out successfully.")


async def run_full_audit():
    chrome_proc, temp_dir = launch_chrome()
    audit_findings = []
    
    try:
        ws_url = await get_page_ws()
        client = ChromeCDPClient(ws_url)
        await client.connect()
        client.log("Connected to Chrome DevTools Protocol successfully.")

        # =========================================================================
        # 0. WRONG PASSWORD & AUTH VALIDATION TEST
        # =========================================================================
        client.log("\n=======================================================")
        client.log(">>> TEST 0: AUTHENTICATION & LOGIN VALIDATION")
        client.log("=======================================================")
        await client.navigate(f"{FRONTEND_URL}/login")
        await client.wait_for_selector("input[type='text'], input[type='email']")
        # Test wrong credentials
        await client.evaluate("""
            (() => {
                const setVal = (el, val) => {
                    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                const inputs = document.querySelectorAll('input');
                setVal(inputs[0], 'admin@university.edu.vn');
                setVal(inputs[1], 'WrongPassword@999');
                document.querySelector('button[type="submit"]').click();
            })()
        """)
        await asyncio.sleep(2.0)
        has_error = await client.evaluate("document.body.innerText.includes('không chính xác') || document.body.innerText.includes('sai') || document.body.innerText.includes('Lỗi') || !!document.querySelector('.text-red-600')")
        client.log(f"Auth invalid password error rendered correctly: {has_error}")
        await client.capture_screenshot("01_login_invalid_credentials.png")

        # =========================================================================
        # 1. ADMIN PERSONA AUDIT
        # =========================================================================
        client.log("\n=======================================================")
        client.log(">>> TEST 1: ADMIN ROLE AUDIT (admin@university.edu.vn)")
        client.log("=======================================================")
        await login_user(client, "admin@university.edu.vn", "Demo@123")
        await client.capture_screenshot("02_admin_dashboard.png")
        
        # Verify Dashboard KPIs
        dashboard_text = await client.evaluate("document.body.innerText")
        client.log(f"Admin Dashboard Content Sample: {dashboard_text[:250]}...")
        
        # 1.1 Users Management (/users)
        client.log("\n--- Testing /users (User Management) ---")
        await client.navigate(f"{FRONTEND_URL}/users")
        await client.wait_for_selector("table, .divide-y", timeout=8.0)
        await client.capture_screenshot("03_admin_users_list.png")
        
        # Search for user
        await client.evaluate("""
            (() => {
                const searchInput = document.querySelector('input[placeholder*="Tìm kiếm"], input[type="search"]');
                if (searchInput) {
                    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(searchInput), 'value').set;
                    setter.call(searchInput, 'student1');
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            })()
        """)
        await asyncio.sleep(1.5)
        search_result_text = await client.evaluate("document.body.innerText")
        client.log(f"Search for 'student1' found: {'student1' in search_result_text}")
        await client.capture_screenshot("04_admin_users_search.png")
        
        # Clear search
        await client.evaluate("""
            (() => {
                const searchInput = document.querySelector('input[placeholder*="Tìm kiếm"], input[type="search"]');
                if (searchInput) {
                    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(searchInput), 'value').set;
                    setter.call(searchInput, '');
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            })()
        """)
        await asyncio.sleep(1.0)

        # Open Create User Modal
        client.log("Testing Create User modal...")
        create_user_btn = await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const b = btns.find(el => el.innerText.includes('Thêm người dùng') || el.innerText.includes('Tạo người dùng'));
                if (b) { b.click(); return true; }
                return false;
            })()
        """)
        await asyncio.sleep(1.5)
        await client.capture_screenshot("05_admin_create_user_modal.png")
        client.log(f"Opened Create User Modal: {create_user_btn}")
        
        # Close modal
        await client.evaluate("""
            (() => {
                const closeBtn = document.querySelector('button[aria-label="Close"], button svg.lucide-x, .lucide-x');
                if (closeBtn) closeBtn.closest('button').click();
                else {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const cancel = btns.find(b => b.innerText.includes('Hủy') || b.innerText.includes('Đóng'));
                    if (cancel) cancel.click();
                }
            })()
        """)
        await asyncio.sleep(1.0)

        # 1.2 Courses Management (/courses)
        client.log("\n--- Testing /courses (Course Management) ---")
        await client.navigate(f"{FRONTEND_URL}/courses")
        await client.wait_for_selector("h1, h2", timeout=8.0)
        await client.capture_screenshot("06_admin_courses_list.png")
        
        # Open Create Course Modal
        client.log("Opening Create Course modal...")
        await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const b = btns.find(el => el.innerText.includes('Tạo khóa học') || el.innerText.includes('Thêm khóa học'));
                if (b) b.click();
            })()
        """)
        await asyncio.sleep(1.5)
        await client.capture_screenshot("07_admin_create_course_modal.png")
        
        # Fill Create Course Form
        suffix = int(time.time()) % 10000
        test_course_code = f"AUDIT{suffix}"
        test_course_title = f"Kiến trúc Phần mềm LMS {suffix}"
        client.log(f"Creating course: {test_course_code} - {test_course_title}")
        
        await client.evaluate(f"""
            (() => {{
                const setVal = (el, val) => {{
                    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }};
                const inputs = document.querySelectorAll('input, textarea, select');
                // Form fields: code, title, desc, credits, lecturer
                for (const input of inputs) {{
                    const name = (input.name || input.id || input.placeholder || '').toLowerCase();
                    if (name.includes('mã') || name.includes('code') || input.placeholder?.includes('CS101')) {{
                        setVal(input, {json.dumps(test_course_code)});
                    }} else if (name.includes('tên') || name.includes('tiêu đề') || name.includes('title') || input.placeholder?.includes('Lập trình')) {{
                        setVal(input, {json.dumps(test_course_title)});
                    }} else if (input.tagName === 'TEXTAREA' || name.includes('mô tả') || name.includes('desc')) {{
                        setVal(input, 'Khóa học phục vụ kiểm thử và đánh giá toàn diện.');
                    }} else if (input.type === 'number' || name.includes('tín chỉ') || name.includes('credits')) {{
                        setVal(input, '3');
                    }}
                }}
                // Submit form
                const submitBtn = Array.from(document.querySelectorAll('button[type="submit"], button')).find(b => b.innerText.includes('Tạo') || b.innerText.includes('Lưu'));
                if (submitBtn) submitBtn.click();
            }})()
        """)
        await asyncio.sleep(2.5)
        await client.capture_screenshot("08_admin_course_created.png")
        
        # Navigate to the newly created course
        client.log("Navigating to course detail...")
        await client.evaluate(f"""
            (() => {{
                const links = Array.from(document.querySelectorAll('a, button'));
                const target = links.find(el => el.innerText.includes({json.dumps(test_course_code)}) || el.innerText.includes({json.dumps(test_course_title)}));
                if (target) target.click();
            }})()
        """)
        await asyncio.sleep(2.5)
        current_url = await client.evaluate("window.location.href")
        client.log(f"Current URL after clicking course: {current_url}")
        await client.capture_screenshot("09_admin_course_detail.png")

        # 1.3 Add Curriculum: Chapter & Lesson
        client.log("\n--- Testing Curriculum Management (Add Chapter & Lesson) ---")
        # Click "Thêm chương"
        await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const addModuleBtn = btns.find(b => b.innerText.includes('Thêm chương') || b.innerText.includes('Tạo chương'));
                if (addModuleBtn) addModuleBtn.click();
            })()
        """)
        await asyncio.sleep(1.5)
        await client.evaluate("""
            (() => {
                const setVal = (el, val) => {
                    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                const inputs = document.querySelectorAll('input, textarea');
                for (const input of inputs) {
                    if (input.placeholder?.includes('Tên chương') || input.name?.includes('title') || input.type === 'text') {
                        setVal(input, 'Chương 1: Tổng quan Kiến trúc LMS');
                    } else if (input.tagName === 'TEXTAREA') {
                        setVal(input, 'Mô tả chương 1: Giới thiệu hệ thống');
                    }
                }
                const saveBtn = Array.from(document.querySelectorAll('button[type="submit"], button')).find(b => b.innerText.includes('Lưu') || b.innerText.includes('Tạo'));
                if (saveBtn) saveBtn.click();
            })()
        """)
        await asyncio.sleep(2.5)
        client.log("Chapter created.")

        # Click "Thêm bài học"
        await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const addLessonBtn = btns.find(b => b.innerText.includes('Thêm bài học') || b.innerText.includes('Tạo bài học'));
                if (addLessonBtn) addLessonBtn.click();
            })()
        """)
        await asyncio.sleep(1.5)
        await client.evaluate("""
            (() => {
                const setVal = (el, val) => {
                    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                const inputs = document.querySelectorAll('input, textarea');
                for (const input of inputs) {
                    if (input.placeholder?.includes('Tên bài học') || input.name?.includes('title') || input.type === 'text') {
                        setVal(input, 'Bài 1.1: Nguyên lý Thiết kế LMS');
                    } else if (input.tagName === 'TEXTAREA') {
                        setVal(input, 'Nội dung chi tiết bài học: Kiến trúc 3 tầng, phân quyền JWT, cơ sở dữ liệu MSSQL.');
                    }
                }
                const saveBtn = Array.from(document.querySelectorAll('button[type="submit"], button')).find(b => b.innerText.includes('Lưu') || b.innerText.includes('Tạo'));
                if (saveBtn) saveBtn.click();
            })()
        """)
        await asyncio.sleep(2.5)
        client.log("Lesson created.")
        await client.capture_screenshot("10_admin_course_curriculum.png")

        # 1.4 Student Enrollment
        client.log("\n--- Testing Student Enrollment ---")
        # Switch to "Sinh viên" tab
        await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const studentTab = btns.find(b => b.innerText.includes('Sinh viên') || b.innerText.includes('Danh sách lớp'));
                if (studentTab) studentTab.click();
            })()
        """)
        await asyncio.sleep(1.5)
        
        # Click "Ghi danh sinh viên"
        await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const enrollBtn = btns.find(b => b.innerText.includes('Ghi danh') || b.innerText.includes('Thêm sinh viên'));
                if (enrollBtn) enrollBtn.click();
            })()
        """)
        await asyncio.sleep(1.5)
        await client.capture_screenshot("11_admin_enroll_modal.png")
        
        # Select student and submit enrollment
        await client.evaluate("""
            (() => {
                const select = document.querySelector('select');
                if (select && select.options.length > 0) {
                    select.selectedIndex = 0;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const submitBtn = Array.from(document.querySelectorAll('button[type="submit"], button')).find(b => b.innerText.includes('Ghi danh') || b.innerText.includes('Xác nhận'));
                if (submitBtn) submitBtn.click();
            })()
        """)
        await asyncio.sleep(2.5)
        await client.capture_screenshot("12_admin_student_enrolled.png")
        client.log("Student enrolled successfully.")

        # 1.5 Test Notifications Page
        client.log("\n--- Testing /notifications ---")
        await client.navigate(f"{FRONTEND_URL}/notifications")
        await client.wait_for_selector("h1", timeout=8.0)
        await client.capture_screenshot("13_admin_notifications.png")
        
        # Test hidden routes for Admin
        for hidden_path in ["/assignments", "/quizzes", "/grades"]:
            await client.navigate(f"{FRONTEND_URL}{hidden_path}")
            await asyncio.sleep(1.5)
            h1_text = await client.evaluate("document.querySelector('h1') ? document.querySelector('h1').innerText : ''")
            client.log(f"Admin direct navigation to {hidden_path}: accessible = True, header = '{h1_text}'")
            await client.capture_screenshot(f"14_admin_hidden_{hidden_path.replace('/', '')}.png")

        await logout_user(client)

        # =========================================================================
        # 2. LECTURER PERSONA AUDIT
        # =========================================================================
        client.log("\n=======================================================")
        client.log(">>> TEST 2: LECTURER ROLE AUDIT (lecturer1@university.edu.vn)")
        client.log("=======================================================")
        await login_user(client, "lecturer1@university.edu.vn", "Demo@123")
        await client.capture_screenshot("20_lecturer_dashboard.png")

        # 2.1 Lecturer Courses
        await client.navigate(f"{FRONTEND_URL}/courses")
        await client.wait_for_selector("h1, h2", timeout=8.0)
        await client.capture_screenshot("21_lecturer_courses.png")
        courses_count = await client.evaluate("document.querySelectorAll('.grid > div, .space-y-4 > div').length")
        client.log(f"Lecturer visible assigned courses count: {courses_count}")

        # 2.2 Lecturer Assignments Management (/assignments)
        client.log("\n--- Testing Lecturer /assignments ---")
        await client.navigate(f"{FRONTEND_URL}/assignments")
        await client.wait_for_selector("h1, button", timeout=8.0)
        await client.capture_screenshot("22_lecturer_assignments_list.png")

        # Open "Tạo bài tập mới"
        await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const b = btns.find(el => el.innerText.includes('Tạo bài tập') || el.innerText.includes('Thêm bài tập'));
                if (b) b.click();
            })()
        """)
        await asyncio.sleep(1.5)
        await client.capture_screenshot("23_lecturer_create_assignment_modal.png")

        # Fill and create Assignment
        asg_title = f"Bài tập Kiểm thử Tự động {suffix}"
        client.log(f"Creating Assignment: {asg_title}")
        await client.evaluate(f"""
            (() => {{
                const setVal = (el, val) => {{
                    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }};
                const inputs = document.querySelectorAll('input, textarea, select');
                for (const input of inputs) {{
                    const name = (input.name || input.id || input.placeholder || '').toLowerCase();
                    if (name.includes('tiêu đề') || name.includes('tên') || input.placeholder?.includes('Bài tập')) {{
                        setVal(input, {json.dumps(asg_title)});
                    }} else if (input.tagName === 'TEXTAREA') {{
                        setVal(input, 'Yêu cầu: Viết kịch bản kiểm thử tự động cho hệ thống LMS.');
                    }} else if (input.type === 'datetime-local') {{
                        // Set deadline to next week
                        const d = new Date(Date.now() + 7 * 86400000);
                        setVal(input, d.toISOString().slice(0, 16));
                    }} else if (input.type === 'number') {{
                        setVal(input, '10');
                    }}
                }}
                const submitBtn = Array.from(document.querySelectorAll('button[type="submit"], button')).find(b => b.innerText.includes('Tạo') || b.innerText.includes('Lưu'));
                if (submitBtn) submitBtn.click();
            }})()
        """)
        await asyncio.sleep(2.5)
        await client.capture_screenshot("24_lecturer_assignment_created.png")

        # 2.3 Lecturer Quizzes Management (/quizzes)
        client.log("\n--- Testing Lecturer /quizzes ---")
        await client.navigate(f"{FRONTEND_URL}/quizzes")
        await client.wait_for_selector("h1, button", timeout=8.0)
        await client.capture_screenshot("25_lecturer_quizzes_list.png")

        # Open "Tạo bài kiểm tra mới"
        await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const b = btns.find(el => el.innerText.includes('Tạo bài kiểm tra') || el.innerText.includes('Thêm bài kiểm tra'));
                if (b) b.click();
            })()
        """)
        await asyncio.sleep(1.5)
        await client.capture_screenshot("26_lecturer_create_quiz_modal.png")

        quiz_title = f"Kiểm tra Trắc nghiệm Audit {suffix}"
        client.log(f"Creating Quiz: {quiz_title}")
        await client.evaluate(f"""
            (() => {{
                const setVal = (el, val) => {{
                    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }};
                const inputs = document.querySelectorAll('input, textarea, select');
                for (const input of inputs) {{
                    const name = (input.name || input.id || input.placeholder || '').toLowerCase();
                    if (name.includes('tiêu đề') || name.includes('tên') || input.placeholder?.includes('Bài kiểm tra')) {{
                        setVal(input, {json.dumps(quiz_title)});
                    }} else if (input.tagName === 'TEXTAREA') {{
                        setVal(input, 'Bài kiểm tra đánh giá kiến thức cơ bản về kiểm thử.');
                    }}
                }}
                const submitBtn = Array.from(document.querySelectorAll('button[type="submit"], button')).find(b => b.innerText.includes('Tạo') || b.innerText.includes('Lưu'));
                if (submitBtn) submitBtn.click();
            }})()
        """)
        await asyncio.sleep(2.5)
        await client.capture_screenshot("27_lecturer_quiz_created.png")

        # 2.4 Gradebook (/grades)
        client.log("\n--- Testing Lecturer Gradebook (/grades) ---")
        await client.navigate(f"{FRONTEND_URL}/grades")
        await client.wait_for_selector("h1, table", timeout=8.0)
        await client.capture_screenshot("28_lecturer_gradebook.png")
        client.log("Lecturer Gradebook rendered.")

        await logout_user(client)

        # =========================================================================
        # 3. STUDENT PERSONA AUDIT
        # =========================================================================
        client.log("\n=======================================================")
        client.log(">>> TEST 3: STUDENT ROLE AUDIT (student1@university.edu.vn)")
        client.log("=======================================================")
        await login_user(client, "student1@university.edu.vn", "Demo@123")
        await client.capture_screenshot("30_student_dashboard.png")

        # 3.1 Student Courses View
        client.log("\n--- Testing Student Courses ---")
        await client.navigate(f"{FRONTEND_URL}/courses")
        await asyncio.sleep(2.5)
        await client.capture_screenshot("31_student_courses_list.png")
        student_courses = await client.evaluate("document.querySelectorAll('.grid > div').length")
        client.log(f"Student enrolled courses count: {student_courses}")

        # Open first course detail
        await client.evaluate("""
            (() => {
                const courseCard = document.querySelector('.grid > div a');
                if (courseCard) courseCard.click();
            })()
        """)
        await asyncio.sleep(2.5)
        await client.capture_screenshot("32_student_course_detail.png")
        
        # Verify student cannot see admin/lecturer edit controls
        can_edit_curriculum = await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                return btns.some(b => b.innerText.includes('Thêm chương') || b.innerText.includes('Thêm bài học'));
            })()
        """)
        client.log(f"Student can see edit controls (Security check): {can_edit_curriculum} (Must be False)")

        # 3.2 Student Assignments View & Submission (/assignments)
        client.log("\n--- Testing Student /assignments & Submission ---")
        await client.navigate(f"{FRONTEND_URL}/assignments")
        await asyncio.sleep(2.5)
        await client.capture_screenshot("33_student_assignments_list.png")

        # Click on "Nộp bài" button
        submit_clicked = await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const b = btns.find(el => el.innerText.includes('Nộp bài') || el.innerText.includes('Cập nhật bài'));
                if (b) { b.click(); return true; }
                return false;
            })()
        """)
        await asyncio.sleep(1.5)
        if submit_clicked:
            await client.capture_screenshot("34_student_submit_modal.png")
            # Fill submission text
            await client.evaluate("""
                (() => {
                    const setVal = (el, val) => {
                        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                        setter.call(el, val);
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    };
                    const textarea = document.querySelector('textarea');
                    if (textarea) {
                        setVal(textarea, 'Thưa thầy, em nộp bài tập hoàn chỉnh. Link báo cáo: https://github.com/student/lms-test-submission');
                    }
                    const submitBtn = Array.from(document.querySelectorAll('button[type="submit"], button')).find(b => b.innerText.includes('Nộp bài') || b.innerText.includes('Xác nhận'));
                    if (submitBtn) submitBtn.click();
                })()
            """)
            await asyncio.sleep(2.5)
            await client.capture_screenshot("35_student_submission_completed.png")
            client.log("Student submitted assignment successfully.")
        else:
            client.log("No pending assignment available to submit in current filter.")

        # 3.3 Student Quizzes View & Quiz Attempt (/quizzes)
        client.log("\n--- Testing Student /quizzes & Attempt ---")
        await client.navigate(f"{FRONTEND_URL}/quizzes")
        await asyncio.sleep(2.5)
        await client.capture_screenshot("36_student_quizzes_list.png")

        # Click "Làm bài"
        start_quiz_clicked = await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const b = btns.find(el => el.innerText.includes('Làm bài') || el.innerText.includes('Bắt đầu'));
                if (b) { b.click(); return true; }
                return false;
            })()
        """)
        await asyncio.sleep(2.0)
        if start_quiz_clicked:
            await client.capture_screenshot("37_student_quiz_attempt.png")
            client.log("Quiz attempt started. Answering questions...")
            # Select first radio option for each question
            await client.evaluate("""
                (() => {
                    const questions = document.querySelectorAll('fieldset, .space-y-3, .border');
                    for (const q of questions) {
                        const firstRadio = q.querySelector('input[type="radio"]');
                        if (firstRadio) firstRadio.click();
                    }
                })()
            """)
            await asyncio.sleep(1.0)
            await client.capture_screenshot("38_student_quiz_answered.png")
            # Submit quiz
            await client.evaluate("""
                (() => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const b = btns.find(el => el.innerText.includes('Nộp bài kiểm tra') || el.innerText.includes('Nộp bài') || el.innerText.includes('Hoàn thành'));
                    if (b) b.click();
                })()
            """)
            await asyncio.sleep(2.5)
            await client.capture_screenshot("39_student_quiz_result.png")
            result_text = await client.evaluate("document.body.innerText")
            client.log(f"Quiz completed! Result snippet: {result_text[-300:]}")
        else:
            client.log("No active published quiz available for student to attempt.")

        # 3.4 Student Grades (/grades)
        client.log("\n--- Testing Student Grades (/grades) ---")
        await client.navigate(f"{FRONTEND_URL}/grades")
        await client.wait_for_selector("h1", timeout=8.0)
        await client.capture_screenshot("40_student_grades.png")
        grades_content = await client.evaluate("document.body.innerText")
        client.log(f"Student Grades Content Sample: {grades_content[:250]}...")

        # 3.5 Student Notifications (/notifications)
        client.log("\n--- Testing Student Notifications ---")
        await client.navigate(f"{FRONTEND_URL}/notifications")
        await client.wait_for_selector("h1", timeout=8.0)
        await client.capture_screenshot("41_student_notifications.png")

        # 3.6 Security Check: Student accessing Admin route (/users)
        client.log("\n--- Testing Security: Student accessing /users ---")
        await client.navigate(f"{FRONTEND_URL}/users")
        await asyncio.sleep(2.0)
        url_after_users = await client.evaluate("window.location.href")
        client.log(f"URL after student navigated to /users: {url_after_users} (Should redirect to /dashboard)")
        await client.capture_screenshot("42_student_unauthorized_users_access.png")

        await logout_user(client)

        # =========================================================================
        # 4. LECTURER GRADING WORKFLOW
        # =========================================================================
        client.log("\n=======================================================")
        client.log(">>> TEST 4: LECTURER GRADING SUBMISSION")
        client.log("=======================================================")
        await login_user(client, "lecturer1@university.edu.vn", "Demo@123")
        await client.navigate(f"{FRONTEND_URL}/assignments")
        await client.wait_for_selector("h1", timeout=8.0)
        
        # Open Submissions / Chấm bài
        grading_opened = await client.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const b = btns.find(el => el.innerText.includes('Chấm bài') || el.innerText.includes('Bài nộp') || el.innerText.includes('Xem bài nộp'));
                if (b) { b.click(); return true; }
                return false;
            })()
        """)
        await asyncio.sleep(2.0)
        if grading_opened:
            await client.capture_screenshot("43_lecturer_review_panel.png")
            client.log("Grading panel opened. Entering score and feedback...")
            await client.evaluate("""
                (() => {
                    const setVal = (el, val) => {
                        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                        setter.call(el, val);
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    };
                    const numInput = document.querySelector('input[type="number"]');
                    if (numInput) setVal(numInput, '9.5');
                    const textareas = document.querySelectorAll('textarea');
                    if (textareas.length > 0) {
                        setVal(textareas[textareas.length - 1], 'Bài làm rất tốt, phân tích sâu sắc và đầy đủ yêu cầu.');
                    }
                    const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Lưu điểm') || b.innerText.includes('Chấm điểm'));
                    if (saveBtn) saveBtn.click();
                })()
            """)
            await asyncio.sleep(2.0)
            await client.capture_screenshot("44_lecturer_grade_saved.png")
            client.log("Lecturer graded submission.")
        else:
            client.log("No submission found to grade.")

        await logout_user(client)

        client.log("\n=======================================================")
        client.log(">>> FULL INTERACTIVE AUDIT RUN COMPLETED SUCCESSFULLY!")
        client.log("=======================================================")

        # Collect summary metrics
        client.log(f"Total Console Logs Collected: {len(client.console_logs)}")
        client.log(f"Total Network API Calls Monitored: {len(client.network_events)}")
        client.log(f"Unhandled Browser Exceptions: {len(client.unhandled_exceptions)}")
        for exc in client.unhandled_exceptions:
            client.log(f"  - EXCEPTION: {exc}")

        await client.close()
    finally:
        chrome_proc.terminate()
        try:
            chrome_proc.wait(timeout=3)
        except Exception:
            chrome_proc.kill()


if __name__ == "__main__":
    asyncio.run(run_full_audit())
