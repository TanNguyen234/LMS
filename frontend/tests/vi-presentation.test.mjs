import assert from 'node:assert/strict';
import test from 'node:test';
import { statusLabel, formatScore, apiErrorMessageVi, roleLabel, dashboardActions } from '../src/utils/vi.ts';

test('renders workflow states in Vietnamese without changing their API values', () => {
  const assignment = { status: 'PUBLISHED' };
  assert.equal(statusLabel(assignment.status), 'Đã giao');
  assert.deepEqual(assignment, { status: 'PUBLISHED' });
  assert.equal(statusLabel('DRAFT'), 'Bản nháp');
  assert.equal(statusLabel('CLOSED'), 'Đã đóng');
  assert.equal(statusLabel('IN_PROGRESS'), 'Đang làm');
  assert.equal(statusLabel('SUBMITTED'), 'Đã nộp');
  assert.equal(statusLabel('LATE'), 'Nộp muộn');
  assert.equal(statusLabel('GRADED'), 'Đã chấm');
  assert.equal(statusLabel('NEW_UNKNOWN_VALUE'), 'Chưa xác định');
  assert.equal(statusLabel(undefined), 'Chưa xác định');
});

test('uses Vietnamese decimals and does not turn missing scores into zero', () => {
  assert.equal(formatScore(8.5, 2), '8,50');
  assert.equal(formatScore(0, 2), '0,00');
  assert.equal(formatScore(null), '—');
  assert.equal(formatScore(undefined), '—');
  assert.equal(formatScore(Number.NaN), '—');
});

test('explains authentication, permission and server failures without exposing raw internals', () => {
  assert.match(apiErrorMessageVi(401, 'Incorrect email or password'), /thư điện tử hoặc mật khẩu/);
  assert.match(apiErrorMessageVi(401, 'Invalid or expired token'), /đăng nhập lại/);
  assert.match(apiErrorMessageVi(403, 'Access denied: Requires role in [ADMIN]'), /quyền/);
  assert.match(apiErrorMessageVi(400, 'Text submission content is required'), /nội dung bài nộp/);
  assert.match(apiErrorMessageVi(422, 'Field required'), /thông tin/i);
  assert.match(apiErrorMessageVi(500, 'ODBC Driver connection string secret'), /máy chủ/i);
  assert.equal(apiErrorMessageVi(400, 'Nội dung chưa hợp lệ.'), 'Nội dung chưa hợp lệ.');
  assert.match(apiErrorMessageVi(0), /kết nối/);
});

test('dashboard shortcuts respect the existing route roles', () => {
  assert.equal(roleLabel('ADMIN'), 'Quản trị viên');
  assert.equal(roleLabel('LECTURER'), 'Giảng viên');
  assert.equal(roleLabel('STUDENT'), 'Sinh viên');
  assert.deepEqual(dashboardActions('ADMIN').map(x => x.path), ['/users', '/courses', '/notifications']);
  assert.deepEqual(dashboardActions('STUDENT').map(x => x.path), ['/assignments', '/quizzes', '/grades']);
  assert.equal(dashboardActions('LECTURER')[2].label, 'Sổ điểm lớp học phần');
  assert.deepEqual(dashboardActions(undefined), []);
});
