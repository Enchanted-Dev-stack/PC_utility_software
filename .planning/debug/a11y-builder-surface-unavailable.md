# Debug Session: a11y-builder-surface-unavailable

## Symptom
- UAT Test 1 expected keyboard navigation across builder controls.
- User reported only minimal UI at `http://127.0.0.1:8787/panel` and no accessible builder surface.

## Investigation
- Reviewed phase 07 summaries and verification artifacts.
- Confirmed phase outputs focus on contract-backed runtime model metadata and automated regression suites.
- No manual verification prerequisite or explicit builder route/setup was provided in UAT before presenting keyboard/focus checks.

## Root Cause
UAT attempted a keyboard/focus interaction test on a runtime panel route that did not expose the builder controls under test. The phase implementation validated accessibility invariants in models/tests, but UAT lacked a builder-enabled environment gate.

## Evidence
- `.planning/phases/07-accessibility-and-regression-gates/07-01-SUMMARY.md` states deliverables are runtime metadata + deterministic tests.
- User report in `.planning/phases/07-accessibility-and-regression-gates/07-UAT.md` indicates builder UI not present on `/panel`.

## Fix Direction
- Add a documented prerequisite step for launching/opening the builder-capable surface before Test 1.
- Add a smoke gate that verifies builder controls are present before running keyboard/focus UAT tests.
