---
phase: 02-deterministic-action-runtime
plan: "02"
subsystem: runtime
tags: [actions, executors, spawn, url-validation]

requires:
  - phase: 02-deterministic-action-runtime
    provides: deterministic lifecycle orchestration and runtime history backbone from 02-01
provides:
  - allowlisted open-app executor with deterministic launch outcomes
  - strict HTTP/HTTPS open-website executor with normalized URL handling
  - focused tests covering success/failure paths and launch safety assertions
affects: [02-03 media-control executor integration, 02-04 runtime wiring]

tech-stack:
  added: []
  patterns:
    - curated app target allowlist per desktop platform
    - WHATWG URL.canParse and protocol gating before launch
    - spawn argument-array execution with shell disabled

key-files:
  created:
    - apps/desktop/src/runtime/actions/executors/open-app-executor.ts
    - apps/desktop/src/runtime/actions/executors/open-url-executor.ts
    - tests/actions/open-target-executors.spec.ts
  modified: []

key-decisions:
  - "Map open_app by curated appId keys to per-platform launch targets; reject unknown keys before process spawn."
  - "Use WHATWG URL validation plus explicit http/https protocol allowlist for open_website."
  - "Model executor outcomes as deterministic typed codes so runtime wiring can map stable feedback taxonomy."

patterns-established:
  - "Executor factories accept platform/spawn dependencies for deterministic unit testing."
  - "Launcher invocations use argument arrays and shell:false across app/url executors."

requirements-completed: [ACTN-01, ACTN-02]

duration: 4 min
completed: 2026-02-26
---

# Phase 2 Plan 2: Validated Open Target Executors Summary

**Curated open-app and validated open-website executors now return deterministic launch outcomes with strict allowlist/protocol checks and focused runtime test coverage.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-26T21:39:58.339Z
- **Completed:** 2026-02-26T21:44:49.016Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added a typed `open_app` executor that resolves only curated app keys and rejects unknown payloads before any process launch.
- Added a typed `open_website` executor that normalizes URLs with WHATWG parsing and blocks malformed/non-http(s) protocols with `invalid_url` outcomes.
- Added executor tests that assert deterministic outcome codes and non-shell launch invocation behavior for both app and website actions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build allowlisted open-application executor** - `c2d9640` (feat)
2. **Task 2: Build validated open-website executor** - `bae0450` (feat)
3. **Task 3: Add executor tests for app and website runtime outcomes** - `99aa6e2` (test)

## Files Created/Modified
- `apps/desktop/src/runtime/actions/executors/open-app-executor.ts` - Curated app allowlist resolver with deterministic platform launch outcomes.
- `apps/desktop/src/runtime/actions/executors/open-url-executor.ts` - HTTP/HTTPS URL validator and platform URL launcher with typed outcomes.
- `tests/actions/open-target-executors.spec.ts` - Jest coverage for success/failure outcome mapping and launch safety assertions.

## Decisions Made
- Used app-key allowlisting (`calculator`, `notepad`) with per-platform command maps so arbitrary executable paths are never accepted.
- Standardized URL validation to `URL.canParse` + `new URL` + protocol allowlist to keep behavior deterministic and parser-correct.
- Kept executor APIs dependency-injectable (`platform`, `spawnProcess`) to make outcome behavior directly testable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed spawn options typing mismatch for detached launcher calls**
- **Found during:** Task 1 verification
- **Issue:** `SpawnOptionsWithoutStdio` rejected `stdio: "ignore"`, causing TypeScript failure before tests could run.
- **Fix:** Switched executor spawn option typing to `SpawnOptions` in both executor modules.
- **Files modified:** apps/desktop/src/runtime/actions/executors/open-app-executor.ts, apps/desktop/src/runtime/actions/executors/open-url-executor.ts
- **Verification:** `npm run test -- tests/actions/open-target-executors.spec.ts --runInBand -t "open application"`
- **Committed in:** `c2d9640` and `bae0450`

**2. [Rule 3 - Blocking] Corrected Jest spawn mock typing for ChildProcess-compatible test doubles**
- **Found during:** Task 1 verification
- **Issue:** Test helper mock signatures were incompatible with executor spawn function types, preventing test compilation.
- **Fix:** Split app/url spawn mock factories by function type and cast event-emitter doubles to `ChildProcess` for strict typing.
- **Files modified:** tests/actions/open-target-executors.spec.ts
- **Verification:** `npm run test -- tests/actions/open-target-executors.spec.ts --runInBand`
- **Committed in:** `99aa6e2`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were implementation-level blockers required to reach deterministic tested outcomes; no scope creep.

## Issues Encountered
- `gsd-tools state advance-plan/update-progress/record-session` could not parse the current STATE.md schema, so state position/session fields were updated manually to reflect 02-02 completion.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 runtime now has concrete app/url executors ready for orchestrator wiring.
- Ready for `02-03-PLAN.md` media-control executor implementation.

---
*Phase: 02-deterministic-action-runtime*
*Completed: 2026-02-26*

## Self-Check: PASSED
