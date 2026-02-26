# Requirements: PC Remote Control Studio

**Defined:** 2026-02-27
**Core Value:** A user can tap custom tiles on their phone and instantly trigger the right action on their PC through a polished, easy-to-configure interface.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Connectivity & Trust

- [x] **CNCT-01**: User can discover their PC host on the same Wi-Fi network or connect via manual IP fallback.
- [x] **CNCT-02**: User can complete one-time pairing between phone and PC using an explicit trust flow (code or QR).
- [x] **CNCT-03**: User can reconnect to a previously trusted PC without repeating initial pairing.
- [x] **CNCT-04**: User can see live connection status (connected, reconnecting, disconnected) in both phone and PC interfaces.

### Dashboard Builder

- [x] **DASH-01**: User can create a new tile in the PC control panel with label and icon.
- [x] **DASH-02**: User can edit an existing tile's label, icon, and mapped action.
- [x] **DASH-03**: User can reorder tiles and save layout changes.
- [x] **DASH-04**: User can delete tiles from the layout.
- [x] **DASH-05**: User can preview the mobile dashboard layout in real time from the PC control panel.

### Action Execution

- [x] **ACTN-01**: User can trigger an "open application" action from a phone tile and the linked app opens on PC.
- [x] **ACTN-02**: User can trigger an "open website" action from a phone tile and the linked URL opens on PC.
- [x] **ACTN-03**: User can trigger media control actions (play/pause, next, previous, volume) from phone and PC responds.
- [x] **ACTN-04**: User receives execution feedback for each action (received, running, success/failure).

### Safety & Observability

- [x] **SAFE-01**: User can view recent action history with timestamps and outcome on the PC control panel.
- [x] **SAFE-02**: User can remove a trusted phone device from the PC control panel.
- [x] **SAFE-03**: System only accepts action requests from paired and authenticated devices.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Customization

- **CSTM-01**: User can apply themes and visual style presets to dashboard pages.
- **CSTM-02**: User can create profile-based dashboard pages (work, media, gaming) and switch quickly.
- **CSTM-03**: User can create safe multi-step macros from curated action types.

### Transport & Reach

- **TRNS-01**: User can use Bluetooth-assisted discovery/pairing when Wi-Fi discovery fails.
- **TRNS-02**: User can control PC remotely over internet relay with hardened security controls.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Arbitrary script execution in v1 | High security risk and support burden before permission model exists |
| Plugin marketplace in v1 | Requires signing/review ecosystem not needed for MVP validation |
| Full remote desktop streaming | Different product category and major complexity expansion |
| Multi-user role management | Not required for first-user MVP validation |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CNCT-01 | Phase 1 | Complete |
| CNCT-02 | Phase 1 | Complete |
| CNCT-03 | Phase 1 | Complete |
| CNCT-04 | Phase 1 | Complete |
| DASH-01 | Phase 3 | Complete |
| DASH-02 | Phase 3 | Complete |
| DASH-03 | Phase 3 | Complete |
| DASH-04 | Phase 3 | Complete |
| DASH-05 | Phase 3 | Complete |
| ACTN-01 | Phase 2 | Complete |
| ACTN-02 | Phase 2 | Complete |
| ACTN-03 | Phase 2 | Complete |
| ACTN-04 | Phase 2 | Complete |
| SAFE-01 | Phase 2 | Complete |
| SAFE-02 | Phase 1 | Complete |
| SAFE-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after roadmap mapping*
