# PC Remote Control Studio

## What This Is

PC Remote Control Studio is a local-first system that lets a user control their PC from a phone on the same Wi-Fi network. The user designs a custom mobile dashboard in a desktop control panel (with live preview), creates app/widget icons, and maps each icon to actions like opening apps, websites, and media controls on the PC. The first release focuses on a beautiful, reliable MVP with low latency and simple setup.

## Core Value

A user can tap custom tiles on their phone and instantly trigger the right action on their PC through a polished, easy-to-configure interface.

## Current Milestone: v1.1 UI Polish and UX Refinement

**Goal:** Upgrade desktop builder and mobile dashboard from functional MVP UI to production-quality UX while preserving existing behavior.

**Target features:**
- Unified visual design system (type scale, spacing, color usage, component states) across desktop and mobile.
- Builder and dashboard interaction polish (hover/focus/active states, transitions, feedback clarity, perceived responsiveness).
- Live preview visual fidelity improvements and consistency checks between desktop editor and phone presentation.

## Requirements

### Validated

- ✓ Desktop builder now provides deterministic mutation feedback, explicit affordance state, and deduplicated messaging clarity — Phase 5

### Active

- [ ] User can view a mobile dashboard with refined layout, typography, and motion consistent with desktop preview.
- [ ] User can trust that UI polish does not regress existing pairing, runtime actions, and preview synchronization behavior.
- [ ] User can trust that saved layout order and desktop edits persist and appear identically in mobile preview sessions.

### Out of Scope

- Bluetooth control channel in v1 - deferred to reduce transport complexity; Wi-Fi is primary.
- Internet/WAN remote control in v1 - deferred until local-first reliability and security are proven.
- Arbitrary script/plugin ecosystem in v1 - deferred for security hardening after core workflows are stable.

## Context

- Product direction is progressive delivery: start with a strong working system and add advanced capabilities later.
- Initial transport decision is Wi-Fi LAN first; optional Bluetooth discovery handshake may be explored in future phases.
- UX priority is high: both desktop control panel and phone app should feel intentional and visually polished, not prototype-like.
- Primary initial user is the project owner, with architecture designed to later support broader users.

## Constraints

- **Scope**: MVP-first feature set - must avoid overengineering and ship a working local control loop quickly.
- **Connectivity**: Local network only in v1 - ensures low latency and simpler security boundaries.
- **Security**: Trusted-device pairing required - prevents anonymous LAN execution.
- **Reliability**: Actions must be deterministic and logged - users need confidence that taps map to expected PC behavior.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Wi-Fi LAN is primary transport for v1 | Better throughput, stability, and real-time sync than Bluetooth for widget-driven control | - Pending |
| Build a desktop control panel with live mobile preview | Keeps customization intuitive and makes the phone UI predictable before publishing | - Pending |
| Start with simple action set (open app, open URL, media controls) | Maximizes early utility while keeping implementation and security manageable | - Pending |
| Progressively add advanced features after MVP | Matches user request to keep complexity low first, then expand safely | - Pending |
| Start milestone v1.1 focused on UI polish and UX refinement | Core functionality is validated; next leverage is product quality and presentation consistency | - Pending |
| Use deterministic feedback identities for builder outcomes across desktop surfaces | Prevent noisy duplicate messaging while preserving immediate clarity for distinct events | Phase 5 complete |

---
*Last updated: 2026-02-27 after Phase 5*
