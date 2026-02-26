---
phase: 02-deterministic-action-runtime
plan: "01"
subsystem: runtime
tags: [actions, orchestrator, feedback, history, jest, typescript]
requires:
  - phase: 01-trusted-connectivity-foundation
    provides: trusted-session authorization gate and runtime wiring patterns
provides:
  - Typed v1 action command and lifecycle feedback contracts shared across runtime surfaces
  - Deterministic action orchestrator with guard-first authorization, ordered lifecycle emissions, and actionId dedupe
  - Runtime-owned bounded append-only history store sourced from terminal lifecycle events
  - Integration-style tests proving lifecycle ordering, dedupe behavior, unauthorized short-circuiting, and history retention
affects: [phase-2-runtime-executors, desktop-action-history-ui, feedback-stream-delivery]
tech-stack:
  added: []
  patterns: [guard-first-orchestration, per-device-serial-queue, terminal-derived-history]
key-files:
  created:
    - shared/src/contracts/actions/action-command.ts
    - shared/src/contracts/actions/action-feedback.ts
    - apps/desktop/src/runtime/actions/action-feedback-events.ts
    - apps/desktop/src/runtime/actions/action-history-store.ts
    - apps/desktop/src/runtime/actions/action-orchestrator.ts
    - tests/actions/action-orchestrator.spec.ts
  modified:
    - apps/desktop/src/runtime/actions/action-orchestrator.ts
    - tests/actions/action-orchestrator.spec.ts
key-decisions:
  - "Use per-device scoped serial queueing so each device gets deterministic ordering without globally blocking all devices."
  - "Treat actionId as runtime idempotency key and return cached terminal feedback for duplicates instead of re-executing."
  - "Write history rows only from emitted terminal lifecycle events so audit outcome always matches feedback outcome."
patterns-established:
  - "ActionRuntimeOrchestrator owns received-running-terminal lifecycle sequencing end-to-end."
  - "ActionHistoryStore trims from oldest entries to keep bounded append-only ordering deterministic."
requirements-completed: [ACTN-04, SAFE-01]
duration: 4 min
completed: 2026-02-26
---

# Phase 2 Plan 1: Deterministic Runtime Backbone Summary

**Deterministic action runtime now emits ordered lifecycle feedback and terminal-backed audit history with actionId dedupe guarantees before executors are introduced.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-26T21:31:17Z
- **Completed:** 2026-02-26T21:35:46Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added shared typed contracts for curated v1 action commands (`open_app`, `open_website`, `media_control`) with scoped identifiers and requested timestamps.
- Added typed lifecycle feedback model (`received`, `running`, `success|failure`) with terminal metadata for completion time, outcome code, and optional error taxonomy.
- Implemented `ActionRuntimeOrchestrator` with SessionAuthGuard short-circuiting, per-device deterministic queueing, and exactly one terminal event per accepted non-duplicate action.
- Added runtime feedback event bus and bounded append-only history store that derives rows only from terminal lifecycle events.
- Added deterministic orchestrator tests for success, failure, unauthorized path, duplicate action IDs, and retention trimming.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define shared action command and feedback contracts** - `2a50c67` (feat)
2. **Task 2: Implement deterministic orchestrator, feedback bus, and bounded history store** - `81fee42` (feat)
3. **Task 3: Add deterministic orchestrator tests for lifecycle, dedupe, and history integrity** - `e9ade5e` (test)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `shared/src/contracts/actions/action-command.ts` - Discriminated union for curated v1 command types and payloads.
- `shared/src/contracts/actions/action-feedback.ts` - Lifecycle feedback event contracts and terminal metadata taxonomy.
- `apps/desktop/src/runtime/actions/action-feedback-events.ts` - Runtime feedback publish/subscribe bus.
- `apps/desktop/src/runtime/actions/action-history-store.ts` - Bounded append-only history persistence abstraction.
- `apps/desktop/src/runtime/actions/action-orchestrator.ts` - Guarded deterministic orchestration with dedupe and terminal history append.
- `tests/actions/action-orchestrator.spec.ts` - Contract and runtime lifecycle determinism tests.

## Decisions Made
- Scoped queueing by `hostId::deviceId` to preserve determinism for each device without introducing global runtime contention.
- Cached terminal feedback per `actionId` and reused it for duplicate requests to prevent duplicate execution while returning deterministic outcome data.
- Persisted audit history exclusively from terminal lifecycle events to guarantee parity with emitted success/failure feedback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 verification command required `tests/actions/action-orchestrator.spec.ts` before Task 3**
- **Found during:** Task 1
- **Issue:** Plan verification invoked the orchestrator spec path before tests were scheduled in Task 3.
- **Fix:** Added initial contract-focused test coverage in Task 1 so the required verification command could execute immediately.
- **Files modified:** `tests/actions/action-orchestrator.spec.ts`
- **Verification:** `npm run test -- tests/actions/action-orchestrator.spec.ts --runInBand -t "contract"`
- **Committed in:** `2a50c67`

**2. [Rule 1 - Bug] Type narrowing errors surfaced once full orchestrator tests were added**
- **Found during:** Task 3
- **Issue:** Strict TypeScript compile failed on queue release callback and terminal error-field access.
- **Fix:** Tightened queue release callback typing and narrowed terminal feedback access before reading failure-only metadata.
- **Files modified:** `apps/desktop/src/runtime/actions/action-orchestrator.ts`
- **Verification:** `npm run test -- tests/actions/action-orchestrator.spec.ts --runInBand`
- **Committed in:** `e9ade5e`

**3. [Rule 3 - Blocking] STATE automation helpers could not parse current STATE.md shape**
- **Found during:** State update step after task execution
- **Issue:** `state advance-plan`, `state update-progress`, and `state record-session` returned parse/no-field errors against existing STATE formatting.
- **Fix:** Applied successful helpers (`state record-metric`, `state add-decision`, roadmap/requirements updates), then manually updated STATE position, progress, and session continuity fields.
- **Files modified:** `.planning/STATE.md`, `.planning/ROADMAP.md`
- **Verification:** Re-read both files and confirmed plan progress/status/position values reflect completed 02-01 execution.
- **Committed in:** `60b2c54`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** Fixes were required to complete deterministic verification and metadata updates under existing tooling constraints; no scope creep.

## Authentication Gates
None.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Runtime lifecycle/event/history backbone is now in place and verified, so Phase 2 executor plans can build on deterministic orchestration semantics without reworking contract or audit foundations.

## Self-Check: PASSED
- Verified `.planning/phases/02-deterministic-action-runtime/02-01-SUMMARY.md` exists on disk.
- Verified task commits `2a50c67`, `81fee42`, and `e9ade5e` exist in git history.
