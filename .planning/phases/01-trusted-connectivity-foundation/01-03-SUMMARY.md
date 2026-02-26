---
phase: 01-trusted-connectivity-foundation
plan: "03"
subsystem: connectivity
tags: [reconnect, status-ux, trusted-device-revocation, jest, typescript]
requires:
  - phase: 01-trusted-connectivity-foundation
    provides: pairing trust store and action authorization guard from 01-02
provides:
  - Reconnect state machine with bounded retry window and switch-host support
  - Mobile and desktop status surfaces aligned to connected/reconnecting/disconnected vocabulary
  - Desktop trusted-device revocation flow that removes trust and invalidates active sessions
affects: [phase-2-runtime, action-feedback, trusted-session-lifecycle]
tech-stack:
  added: []
  patterns: [bounded-reconnect-window, shared-connection-status-model, revoke-invalidates-active-session]
key-files:
  created:
    - apps/desktop/src/connectivity/session/reconnect-state-machine.ts
    - apps/mobile/src/connectivity/session/useReconnectFlow.ts
    - apps/mobile/src/ui/controls/ActionTilesGate.tsx
    - apps/mobile/src/ui/connection-status/ConnectionStatusBanner.tsx
    - apps/desktop/src/connectivity/trust/revoke-trusted-device.ts
    - apps/desktop/src/ui/trusted-devices/TrustedDevicesPanel.tsx
    - tests/connectivity/reconnect-status-revoke.spec.ts
  modified:
    - tsconfig.json
    - tests/connectivity/reconnect-status-revoke.spec.ts
key-decisions:
  - "Reconnect retries are bounded by a 45-second window with explicit retry exhaustion state instead of indefinite looping."
  - "Action tiles remain disabled for reconnecting/disconnected states to prevent stale command dispatch."
  - "Device revocation immediately removes trust and invalidates matching active sessions before future action checks."
patterns-established:
  - "Status UI maps to a single connected/reconnecting/disconnected state snapshot model across surfaces."
  - "Trusted-device revoke controls route through a dedicated revoker service rather than UI-side trust mutations."
requirements-completed: [CNCT-03, CNCT-04, SAFE-02]
duration: 6 min
completed: 2026-02-26
---

# Phase 1 Plan 3: Reconnect UX and Revocation Summary

**Trusted devices now auto-reconnect with bounded backoff, both surfaces expose aligned live connection states, and desktop revocation immediately deauthorizes removed phones.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-26T19:53:22Z
- **Completed:** 2026-02-26T19:59:42Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added reconnect state machine logic that defaults to the last successful host, supports switch-host during retries, and stops after a bounded retry window.
- Added reconnect flow orchestration and action tile gating so controls stay disabled unless a trusted session is connected.
- Added mobile status banner and desktop trusted-device panel models to expose connected/reconnecting/disconnected state with actionable CTAs.
- Added trusted-device revoker service to remove trust records and terminate active sessions for revoked phones.
- Added end-to-end reconnect/status/revocation tests validating retry exhaustion, host switching, status rendering, and post-revoke authorization rejection.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement reconnect state machine and action-gating behavior** - `a8393b1` (feat)
2. **Task 2: Add dual-surface status UX and trusted-device revocation flow** - `f408e75` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `apps/desktop/src/connectivity/session/reconnect-state-machine.ts` - Defines reconnect retry policy, bounded window behavior, and host switching.
- `apps/mobile/src/connectivity/session/useReconnectFlow.ts` - Runs reconnect attempts against connection client and publishes state transitions.
- `apps/mobile/src/ui/controls/ActionTilesGate.tsx` - Converts connection state into action tile disabled/enabled gate messaging.
- `apps/mobile/src/ui/connection-status/ConnectionStatusBanner.tsx` - Produces connected/reconnecting/disconnected banner labels and CTA hints.
- `apps/desktop/src/connectivity/trust/revoke-trusted-device.ts` - Revokes trust records and invalidates active sessions for a device.
- `apps/desktop/src/ui/trusted-devices/TrustedDevicesPanel.tsx` - Builds trusted-device panel model and revoke action status responses.
- `tests/connectivity/reconnect-status-revoke.spec.ts` - Verifies reconnect behavior, status UI model outputs, and revoke authorization effects.
- `tsconfig.json` - Enables TSX parsing for new status and panel model files.

## Decisions Made
- Chose a deterministic retry-window cutoff (`retry_window_exhausted`) to keep reconnect UX explicit and testable.
- Kept status and gate components model-driven so mobile/desktop surfaces consume the same state vocabulary.
- Routed revocation through a dedicated service that revokes trust and session validity in a single flow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Enabled TSX compilation support for status/panel modules**
- **Found during:** Task 1 (Implement reconnect state machine and action-gating behavior)
- **Issue:** Jest TypeScript compile failed when importing `.tsx` gate/status modules because `tsconfig.json` lacked JSX support.
- **Fix:** Added `jsx: "preserve"` and `.tsx` app include pattern to `tsconfig.json`.
- **Files modified:** `tsconfig.json`
- **Verification:** `npm run test -- tests/connectivity/reconnect-status-revoke.spec.ts --runInBand`
- **Committed in:** `a8393b1` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The compiler configuration fix was required to execute planned TSX status/gate files and keep verification deterministic.

## Authentication Gates
None.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Phase 1 is complete and ready for transition to deterministic action runtime planning in Phase 2.

## Self-Check: PASSED
- Verified `.planning/phases/01-trusted-connectivity-foundation/01-03-SUMMARY.md` exists on disk.
- Verified task commits `a8393b1` and `f408e75` exist in git history.
