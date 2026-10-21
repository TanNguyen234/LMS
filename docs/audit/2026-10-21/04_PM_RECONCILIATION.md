# PM reconciliation — 2026-10-21

## Source inventory

The source of truth is the actual 13-file set under docs/project-management, linked here:

1. [01_PROJECT_CHARTER.md](../../project-management/01_PROJECT_CHARTER.md)
2. [02_STAKEHOLDER_REGISTER.md](../../project-management/02_STAKEHOLDER_REGISTER.md)
3. [03_RACI_MATRIX.md](../../project-management/03_RACI_MATRIX.md)
4. [04_SCOPE_BASELINE_WBS.md](../../project-management/04_SCOPE_BASELINE_WBS.md)
5. [05_WBS_DICTIONARY.md](../../project-management/05_WBS_DICTIONARY.md)
6. [06_SCHEDULE_CPM_GANTT.md](../../project-management/06_SCHEDULE_CPM_GANTT.md)
7. [07_RESOURCE_AND_BUDGET_BASELINE.md](../../project-management/07_RESOURCE_AND_BUDGET_BASELINE.md)
8. [08_RISK_REGISTER.md](../../project-management/08_RISK_REGISTER.md)
9. [09_QUALITY_PLAN_AND_GATES.md](../../project-management/09_QUALITY_PLAN_AND_GATES.md)
10. [10_COMMUNICATION_PLAN.md](../../project-management/10_COMMUNICATION_PLAN.md)
11. [11_CHANGE_MANAGEMENT_PLAN.md](../../project-management/11_CHANGE_MANAGEMENT_PLAN.md)
12. [12_UAT_AND_ACCEPTANCE_EVIDENCE.md](../../project-management/12_UAT_AND_ACCEPTANCE_EVIDENCE.md)
13. [13_PROJECT_CLOSURE_AND_LESSONS_LEARNED.md](../../project-management/13_PROJECT_CLOSURE_AND_LESSONS_LEARNED.md)

The previous docs/audit/06_PM_DOCUMENT_RECONCILIATION.md cited nonexistent filenames, false budget allocations, and an incorrect ACT-14 description; it has been replaced. Historical reports 00–05 and 07–08 carry a superseded notice. Existing root screenshots remain historical artifacts and are not evidence from this branch.

## Baseline consistency

- Charter: 20 weeks and 1.200.000.000 VNĐ planned budget.
- Labor allocations: 840M VNĐ and 8.5 FTE across 9 cost-allocation lines. The charter had stated 8 people, but this is not supported by the allocation rows. Updated documents state that headcount is unspecified.
- WBS scope retains Admin, Lecturer and Student; student self-enrollment is out of scope. No framework or architecture migration was introduced.
- Assignment attachments are not an implemented MVP capability. The application accepts text submissions; risk and UI documentation now state this.
- Actual current stack: FastAPI/Python, SQLAlchemy, pyodbc, SQL Server, React 19, TypeScript, Vite, fetch and React Router 7. README and PROJECT.md were corrected.
- Quality gates, stakeholder roles, RACI, communication cadence and change control are planning artifacts. Their simulated notices now state they do not prove meetings, execution or approval.

## CPM recomputation

Using FS relationships, time-zero ES/EF, finish milestone 20, EF=ES+duration, LS=LF-duration and TF=LS-ES, the 19-activity network finishes in 20 weeks.

The previously orphaned ACT-03 now gates ACT-06 alongside ACT-05. ACT-14 triage and ACT-15 UAT both gate ACT-17 release. Calculated float: ACT-04=1 week, ACT-16=2 weeks, all remaining activities=0. Critical activities: ACT-01, ACT-02, ACT-03, ACT-05, ACT-06, ACT-07, ACT-08, ACT-09, ACT-10, ACT-11, ACT-12, ACT-13, ACT-14, ACT-15, ACT-17, ACT-18 and ACT-19. Full ES/EF/LS/LF/TF table is in 06_SCHEDULE_CPM_GANTT.md.

These are baseline calculations, not observed project dates or actual elapsed time.

## Budget and EVM

Budget subtotal:
840M labor + 120M infrastructure + 48M software + 40M training + 32M administration + 120M contingency = **1.200M VNĐ**.

Cash flow phases:
180M + 150M + 450M + 240M + 180M = **1.200M VNĐ**. Cumulative planned percentages are 15%, 27.5%, 65%, 85%, 100%.

The closure document's scenario assumes PV=1.2B, EV=1.2B and AC=1.175B; arithmetic gives SV=0, SPI=1.0, CV=+25M and CPI≈1.0213. No actual cost record or time sheet was found. The UAT scenario table defines ten cases but 0 UAT cases were executed in this branch. Names and approval marks in the Charter, UAT and closure artifacts are now simulated/no-real-approval labels.

## SQL and setup path

The canonical fresh schema path is database/01_schema.sql → database/02_seed.sql → database/04_seed_validation.sql, selected against a newly created disposable SQL Server database. The validation script checks at least 10 rows per table and referential conditions; it was NOT RUN here.

The existing initial Alembic revision efd8af3f19c3 alters existing schema objects and is not an empty-database bootstrap. Fresh SQL bootstrap should be stamped at current Alembic head after validation. An existing disposable DB already at efd8af3f19c3 can use the new incremental revision; preflight checks stop if duplicate source grades or unsupported question types exist. No stamp, upgrade or database write was executed.

The detailed prior report is [06_PM_DOCUMENT_RECONCILIATION.md](../06_PM_DOCUMENT_RECONCILIATION.md); current evidence and release decision are separate in [the test matrix](03_TEST_MATRIX.md) and [release gate](05_RELEASE_GATE.md).
