# Roadmap: PC Remote Control Studio

## Overview

This roadmap delivers a local-first remote control MVP by first establishing trusted LAN connectivity, then proving deterministic action execution with feedback, and finally delivering the desktop dashboard builder with live mobile preview so customization sits on top of a reliable control loop.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Trusted Connectivity Foundation** - Ship secure discovery, pairing, reconnection, session trust, and device revocation.
- [x] **Phase 2: Deterministic Action Runtime** - Deliver reliable action execution with explicit feedback and audit history.
- [ ] **Phase 3: Dashboard Builder and Live Preview** - Deliver full tile management workflows and real-time mobile layout preview.

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
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 1.1 -> 2 -> 2.1 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Trusted Connectivity Foundation | 4/4 | Complete | 2026-02-26 |
| 2. Deterministic Action Runtime | 5/5 | Complete | 2026-02-26 |
| 3. Dashboard Builder and Live Preview | 0/TBD | Not started | - |
