# Roadmap: PC Remote Control Studio

## Overview

The roadmap keeps v1.0 runtime behavior intact while raising product quality for v1.1. After shipping trusted connectivity, deterministic actions, and dashboard editing foundations, the next phases focus on visual consistency, interaction clarity, preview fidelity, and accessibility/QA gates so desktop builder and mobile dashboard feel production-ready.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Trusted Connectivity Foundation** - Ship secure discovery, pairing, reconnection, session trust, and device revocation.
- [x] **Phase 2: Deterministic Action Runtime** - Deliver reliable action execution with explicit feedback and audit history.
- [x] **Phase 3: Dashboard Builder and Live Preview** - Deliver full tile management workflows and real-time mobile layout preview.
- [x] **Phase 4: Unified Visual System** - Establish shared visual language and state semantics across builder and dashboard.
- [x] **Phase 5: Builder Interaction Clarity** - Remove ambiguous UI states and make editing feedback concise and trustworthy. (completed 2026-02-27)
- [x] **Phase 6: Preview Fidelity and Persistence** - Ensure desktop edits and saved order are faithfully reflected in mobile preview. (completed 2026-02-27)
- [ ] **Phase 7: Accessibility and Regression Gates** - Lock keyboard/touch accessibility baseline and pre-release UI regression checks.

## Phase Details

### Phase 1: Trusted Connectivity Foundation
**Goal**: Users can securely connect their phone to their PC over local Wi-Fi and control trust lifecycle without re-setup friction.
**Depends on**: Nothing (first phase)
**Requirements**: CNCT-01, CNCT-02, CNCT-03, CNCT-04, SAFE-02, SAFE-03
**Success Criteria** (what must be TRUE):
  1. User can discover the PC on local Wi-Fi or connect using manual IP fallback.
  2. User can complete one-time trust pairing (code or QR), and unpaired devices are denied action requests.
  3. User can reconnect from a previously paired phone without repeating initial pairing.
  4. User can see live connection status (connected, reconnecting, disconnected) in both phone and PC interfaces.
  5. User can remove a trusted phone from the PC panel, and that phone loses authorization until paired again.
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md - Build LAN discovery and manual IP fallback connectivity foundation.
- [x] 01-02-PLAN.md - Implement explicit trust pairing and authenticated action gating.
- [x] 01-03-PLAN.md - Deliver reconnect lifecycle, live status UX, and trusted-device revocation.
- [x] 01-04-PLAN.md - Close verifier runtime wiring gaps with concrete adapters, guarded action runtime, and integration coverage.

### Phase 2: Deterministic Action Runtime
**Goal**: Users can trigger curated actions from phone tiles and consistently receive clear execution outcomes.
**Depends on**: Phase 1
**Requirements**: ACTN-01, ACTN-02, ACTN-03, ACTN-04, SAFE-01
**Success Criteria** (what must be TRUE):
  1. User can trigger an app-launch tile and the mapped desktop application opens on the PC.
  2. User can trigger a website tile and the mapped URL opens on the PC.
  3. User can trigger media controls (play/pause, next, previous, volume) and the PC responds correctly.
  4. User sees per-action execution feedback that progresses through received/running/success-failure states.
  5. User can view recent action history on the PC panel with timestamps and final outcomes.
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md - Build deterministic action orchestrator backbone with lifecycle feedback contracts and bounded runtime history.
- [x] 02-02-PLAN.md - Implement validated open-application and open-website executors with deterministic outcomes.
- [x] 02-03-PLAN.md - Implement typed media-control executor with explicit platform-aware result codes.
- [x] 02-04-PLAN.md - Wire guarded runtime execution, feedback stream delivery, and desktop action history integration tests.
- [x] 02-05-PLAN.md - Close verifier gaps with concrete win32 media adapter wiring and production desktop history panel integration.

### Phase 3: Dashboard Builder and Live Preview
**Goal**: Users can fully configure their mobile control dashboard from the PC panel and trust the resulting phone layout.
**Depends on**: Phase 2
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):
  1. User can create new dashboard tiles with a label and icon from the PC control panel.
  2. User can edit tile label, icon, and mapped action for existing tiles.
  3. User can reorder tiles, save the layout, and see the new order persist.
  4. User can delete tiles and the layout updates accordingly.
  5. User sees mobile dashboard preview updates in real time while editing on the PC panel.
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md - Build shared dashboard tile contracts and runtime layout CRUD/reorder/delete foundation.
- [x] 03-02-PLAN.md - Implement desktop control-panel dashboard builder models for tile create/edit/delete flows.
- [x] 03-03-PLAN.md - Add desktop/mobile live-preview subscription models backed by shared runtime snapshots.
- [x] 03-04-PLAN.md - Complete reorder/save + real-time builder-preview integration with end-to-end tests.

### Phase 4: Unified Visual System
**Goal**: Users experience one coherent visual language across desktop builder and mobile dashboard.
**Depends on**: Phase 3
**Requirements**: VIS-01, VIS-02, VIS-03
**Success Criteria** (what must be TRUE):
  1. User sees consistent typography scale and spacing rhythm in desktop builder, mobile dashboard, and live preview.
  2. User sees the same color/elevation meaning for neutral, success, warning, and error states on both surfaces.
  3. User sees shared component states (default, hover, focus, active, disabled, error) rendered consistently in core flows.
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md - Establish shared visual tokens, semantic state contracts, and desktop/mobile theme adapters.
- [x] 04-02-PLAN.md - Apply unified visual semantics to desktop builder/control/preview models with regression coverage.
- [x] 04-03-PLAN.md - Apply unified visual semantics to mobile surfaces and add cross-surface parity tests.

### Phase 5: Builder Interaction Clarity
**Goal**: Users can complete builder workflows confidently with unambiguous affordances and concise feedback.
**Depends on**: Phase 4
**Requirements**: UX-01, UX-02, UX-03
**Success Criteria** (what must be TRUE):
  1. User gets immediate, clear feedback for tile create, edit, reorder, delete, and save actions.
  2. User can complete common builder tasks without entering unclear, conflicting, or visually ambiguous states.
  3. User sees concise success/failure messages without duplicate toasts, duplicate banners, or noisy repetition.
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md - Add deterministic builder feedback contracts and outcome messaging for all tile mutations.
- [x] 05-02-PLAN.md - Enforce unambiguous builder interaction states and affordances through runtime model guards.
- [x] 05-03-PLAN.md - Integrate feedback deduplication and regression coverage across builder and control-panel surfaces.

### Phase 6: Preview Fidelity and Persistence
**Goal**: Users can trust that desktop edits and saved layout persist and appear identically in mobile preview.
**Depends on**: Phase 5
**Requirements**: PRV-01, PRV-02, PRV-03
**Success Criteria** (what must be TRUE):
  1. User edits tile label, icon, order, or spacing in desktop builder and sees matching updates in mobile preview.
  2. User reorders tiles and saves on desktop, refreshes or reopens, and sees the same order preserved in mobile preview.
  3. User does not observe visible style/state drift between desktop preview and mobile rendering for supported tile states.
**Plans**: 3 plans

Plans:
- [x] 06-01-PLAN.md - Unify preview projection logic across desktop and mobile to eliminate fidelity drift.
- [x] 06-02-PLAN.md - Add durable dashboard layout persistence for reorder/save parity after refresh and reopen.
- [x] 06-03-PLAN.md - Lock end-to-end preview fidelity and visual/state parity with restart-aware regression gates.

### Phase 7: Accessibility and Regression Gates
**Goal**: Users can operate critical controls accessibly while releases are protected by automated UI quality gates.
**Depends on**: Phase 6
**Requirements**: A11Y-01, A11Y-02, QA-01
**Success Criteria** (what must be TRUE):
  1. User can navigate primary desktop builder controls by keyboard and always see a visible focus indicator with readable contrast.
  2. User can read and use critical text and controls on desktop and mobile with accessible text sizing and touch/click targets.
  3. Maintainer can run automated visual and accessibility checks that fail on UI regressions before release.
**Plans**: 3 plans

Plans:
- [x] 07-01-PLAN.md - Establish desktop keyboard/focus accessibility baseline contracts and model regression checks.
- [ ] 07-02-PLAN.md - Add readable typography and target-size accessibility minima across tokens/themes.
- [ ] 07-03-PLAN.md - Deliver deterministic accessibility and visual regression release gate command.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Trusted Connectivity Foundation | 4/4 | Complete | 2026-02-26 |
| 2. Deterministic Action Runtime | 5/5 | Complete | 2026-02-26 |
| 3. Dashboard Builder and Live Preview | 4/4 | Complete | 2026-02-26 |
| 4. Unified Visual System | 3/3 | Complete | 2026-02-27 |
| 5. Builder Interaction Clarity | 3/3 | Complete | 2026-02-27 |
| 6. Preview Fidelity and Persistence | 3/3 | Complete | 2026-02-27 |
| 7. Accessibility and Regression Gates | 1/3 | In Progress | - |
