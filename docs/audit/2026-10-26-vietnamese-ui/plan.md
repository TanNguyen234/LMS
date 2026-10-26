# Scope and acceptance — Vietnamese LMS UI

Authority: user request dated 2026-10-26; current LMS source and full HCMUNRE task profile. VietLex v20 is a comparison reference, never authority for LMS facts or approvals.

Scope: translate frontend labels, status/source displays, accessible names and incidental English in the nine existing pages and shared layout; keep raw API values and saved data unchanged. Preserve behavior, routes, user actions and design. Test presentation helpers before implementation; build/lint once after stable edits; review the diff; inspect actual role journeys and capture screenshots for the updated Word document.

Done when: Vietnamese labels cover the real screens; status/role enum values still round-trip unchanged; no test-data writes for screenshots; fresh captures replace old web images with source hashes; current Word report is audited against VietLex v20 and selected HCMUNRE; confirmed report defects are repaired within LMS scope; final Word/native/visual evidence binds to new output hash. Missing actual UAT or external rubric stays explicit.

Assumptions: existing disposable database UniversityLms_Test_Repeat_20261021_1027 may be used read-only; no deployment is requested. No credentials are recorded. CRG unavailable, source/rg review used.
