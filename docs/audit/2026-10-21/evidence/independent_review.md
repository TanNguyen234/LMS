# Independent source review — 2026-10-21

CRG graph tools were unavailable. A separate read-only reviewer inspected the source diff; this is source review evidence, not SQL Server or browser verification.

## Findings and fixes

1. The first review found that student quiz DTOs copied arbitrary `OptionsJson`, so option objects with correctness fields could expose answers. It also found that assignment detail did not normalize `DueAt` like list/create/update responses. The fixes now allowlist student display fields, reject answer metadata during question validation, reuse the sanitized question DTO for detail/start, and normalize assignment detail timestamps to UTC. Regression tests cover list-form legacy metadata and naive/offset timestamp parity.
2. The follow-up found that answer aliases such as `expectedAnswer` and `answerText` still passed through legacy map-form options. A red regression test reproduced that leak. The sanitizer/validator now classify normalized fields containing `answer`, `correct`, `solution`, or `explanation` as private metadata. The same test passes after the fix.
3. The final focused re-review found no remaining actionable issue in the sanitizer/validator or assignment timestamp changes.

## Verification boundary

The reviewer did not run tests or database actions. The 14 pure tests pass separately. SQL Server integration and browser E2E remain NOT RUN because no disposable test database was created.
# Historical initial review — superseded

This report records an earlier pre-test-database review. Its initial “NOT RUN” status is superseded by the final SQL Server and real Chrome evidence linked from `../03_TEST_MATRIX.md` and `../05_RELEASE_GATE.md`.
