# Project Research Summary

**Project:** PC Remote Control Studio
**Domain:** Local Wi-Fi phone-to-PC remote control (desktop editor + mobile controller)
**Researched:** 2026-02-27
**Confidence:** MEDIUM

## Executive Summary

This product is a local-first control system where the PC host is authoritative and both the mobile app and desktop panel act as clients. Strong implementations in this category do not start from UI customization; they start from a deterministic control loop: trusted pairing, authenticated command transport, explicit acknowledgement stages, and typed action execution on the PC. Research converges on a LAN-first architecture with mDNS discovery plus manual fallback, because that delivers fast setup without expanding to internet-grade threat models too early.

The recommended approach is a Rust-first runtime (Tauri + Rust services + SQLite) with thin React/Expo clients sharing typed protocol contracts. The MVP should prioritize a safe, reliable action plane (open app, open URL, media/system controls), then layer the desktop tile builder and live mobile preview as the core differentiator. This keeps the value loop intact: user taps tile -> host executes deterministically -> user sees stage/result feedback.

Key risk is false confidence from "works on my network" behavior: weak pairing, broken mobile discovery permissions, dead sockets after idle, and OS-level execution failures can all masquerade as random bugs. Mitigation is explicit: pair-first security model, command IDs + ACK semantics + idempotency windows, connection liveness/reconnect policy, host diagnostics (firewall/UIPI), and end-to-end observability for discover -> pair -> execute lifecycle.

## Key Findings

### Recommended Stack

Stack research supports a modern polyglot baseline optimized for low-latency local execution and MVP velocity: Rust runtime + Tauri shell on desktop, React/Vite panel, Expo mobile client, WebSocket transport, and SQLite persistence. Version pinning matters for stability (Expo 55/RN 0.83/React 19.2 lockstep, Tauri CLI/API parity, Rust toolchain pin).

**Core technologies:**
- **Rust 1.93 (stable):** PC runtime, networking, execution, crypto - best safety/performance fit for OS-level control code.
- **Tauri 2.10:** Desktop shell/native bridge - smaller footprint and stronger desktop security posture than Electron-first v1.
- **React 19 + Vite 7:** Desktop panel UI - fast iteration for tile editor and live preview tooling.
- **Expo SDK 55 (RN 0.83):** Mobile controller - fastest path to polished cross-platform mobile UX.
- **WebSocket + Tokio stack:** Realtime command/event/ACK path - low complexity and sufficient LAN performance for MVP.
- **SQLite (WAL):** Local source of truth for tiles, trusted devices, and audit logs.

### Expected Features

The product category has clear table stakes: reliable same-network setup, trusted pairing, low-latency control actions, and a host service that survives reconnects. Differentiation should come from the desktop dashboard builder with accurate live mobile preview and eventually richer visual customization.

**Must have (table stakes):**
- Wi-Fi discovery + trusted pairing + authenticated sessions.
- Host service + resilient connection loop + reconnect handling.
- Tile CRUD and curated action execution (app, URL, media/system basics).
- Basic action/event logging and success/failure feedback.

**Should have (competitive):**
- Desktop builder with live mobile preview (primary differentiator).
- Reliability upgrades: delivery states, retries, deterministic logs.
- Profile/page templates and quick context switching.

**Defer (v2+):**
- WAN/internet remote control.
- Arbitrary scripts/plugins (until permissioned/signed model exists).
- Multi-device concurrent sessions with role controls.

### Architecture Approach

Architecture research strongly favors a PC-hosted monolith with thin clients for MVP: discovery, pairing/auth, realtime gateway, command router, action registry/executor, and audit/persistence services in one local runtime boundary. The key pattern is protocol discipline: every command carries correlation identity and progresses through explicit ACK stages, while only allowlisted typed actions reach execution.

**Major components:**
1. **Discovery + Pairing/Auth services** - establish trust, credential issuance, and secure session gates.
2. **Realtime Gateway + Command Router** - low-latency bidirectional protocol with idempotency and ACK semantics.
3. **Action Registry/Executor + Audit Logger** - validate typed actions, execute safely, persist deterministic outcomes.

### Critical Pitfalls

1. **Skipping real pairing on LAN** - require one-time code/QR pairing, per-device credentials, and authenticated command sessions only.
2. **Missing command semantics** - enforce `command_id`, TTL, dedupe window, staged ACKs, and terminal result states.
3. **Discovery permission failures on mobile** - implement OS-specific permission state machine plus manual IP fallback.
4. **OS boundary failures on PC** - add firewall/UIPI diagnostics and structured execution reason codes.
5. **No end-to-end observability** - instrument discover -> pair -> connect -> ack -> execute with latency/failure taxonomy.

## Implications for Roadmap

Based on dependencies, risk, and architecture boundaries, use a 4-phase roadmap.

### Phase 1: Secure Command Core
**Rationale:** Everything else depends on trusted, deterministic command execution.
**Delivers:** Pairing/auth model, device identity persistence, WebSocket command protocol with ACK/idempotency, typed allowlisted actions, baseline audit events.
**Addresses:** P1 features for pairing, action execution, and basic reliability feedback.
**Avoids:** LAN-trust auth failures, ghost taps/duplicate execution, over-permissive action surface.

### Phase 2: Host Hardening + Setup Reliability
**Rationale:** After core loop works, remove real-world setup/execution blockers.
**Delivers:** mDNS discovery + manual fallback, mobile permission flows, Windows firewall/UIPI diagnostics, reconnect-safe host lifecycle.
**Uses:** mdns-sd/react-native-zeroconf, SQLite state, runtime discovery/pairing modules.
**Implements:** DiscoverySvc, Pairing/AuthSvc hardening, execution environment validation.

### Phase 3: Product Workflow (Editor + Mobile Runtime)
**Rationale:** Build the user-facing value layer on top of proven transport/security.
**Delivers:** Desktop tile CRUD + publish versioning, mobile layout consumption, live preview sync, actionable status UI, richer telemetry dashboards.
**Addresses:** Core value proposition and primary differentiator.
**Avoids:** UI-first anti-pattern where polished screens hide fragile control behavior.

### Phase 4: Differentiation Expansion (v1.x)
**Rationale:** Extend only after reliability metrics are green.
**Delivers:** Visual theming/icon studio, profile templates/switching, safe macro chains (no arbitrary scripting).
**Addresses:** P2 competitive features.
**Avoids:** Premature complexity from plugins/WAN before trust and observability maturity.

### Phase Ordering Rationale

- Pairing/auth and command semantics are hard prerequisites for every user-visible feature.
- Discovery/platform hardening must precede broad user testing to avoid false negative product feedback.
- Editor/live preview should ship after deterministic execution so customization is trustworthy, not cosmetic.
- Deferred capabilities (WAN/plugins/multi-device) require a stronger security and operations posture than MVP.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Mobile LAN permission nuances (iOS/Android) and Windows firewall/UIPI behavior can vary by OS/version.
- **Phase 4:** Safe macro policy model and extensibility guardrails need dedicated threat-model validation.

Phases with standard patterns (can likely skip extra research-phase):
- **Phase 1:** Pairing + ACK/idempotency protocol patterns are well documented and consistent across sources.
- **Phase 3:** CRUD/state-sync/editor workflows follow established app architecture patterns once core protocol is fixed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Strong official docs for Tauri/Expo/Node/Rust; some crate/package version points rely on registry metadata. |
| Features | MEDIUM | Competitor analysis is directionally strong, but mostly from product pages/store listings vs hard usage telemetry. |
| Architecture | MEDIUM-HIGH | Core patterns grounded in RFCs and proven command/ack design; implementation details still need project-level validation. |
| Pitfalls | HIGH | Risks map directly to platform/vendor docs (Apple/Android/Microsoft/RFC) with clear mitigation patterns. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Cross-platform execution parity:** Validate action executor behavior on each target OS beyond Windows assumptions; add matrix tests in planning.
- **Mobile background behavior:** Confirm reconnect/heartbeat strategy under Doze/iOS background limits with device-level soak tests.
- **Crypto/session design depth:** If app-level E2E channel encryption is adopted in MVP, run a focused protocol review before implementation lock.
- **Performance thresholds:** Define acceptance SLOs (P50/P95 tap-to-effect, duplicate rate, discovery success by OS) before Phase 3.

## Sources

### Primary (HIGH confidence)
- Tauri 2 docs and prerequisites - architecture and tooling guidance.
- Expo SDK docs + React Native version docs - compatibility matrix and platform runtime constraints.
- RFC 6455 (WebSocket), RFC 6762/6763 (mDNS/DNS-SD) - transport and discovery standards.
- SQLite WAL docs - local persistence concurrency model.
- Apple/Android/Microsoft official docs - LAN permissions, NSD caveats, firewall rules, UIPI limits.

### Secondary (MEDIUM confidence)
- crates.io and npm registry metadata - concrete package/version baselines.
- Socket.IO reliability docs - delivery guarantees and state recovery reference patterns.
- Electron security checklist - desktop shell hardening parallels.
- Competitor listings/sites (Unified Remote, KDE Connect, Remote Mouse, Macro Deck, Touch Portal) - market expectation signals.

### Tertiary (LOW confidence)
- OWASP IoT project framing - useful threat-model context but broad and less specific to this exact app class.

---
*Research completed: 2026-02-27*
*Ready for roadmap: yes*
