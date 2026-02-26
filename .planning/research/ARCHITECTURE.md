# Architecture Research

**Domain:** local Wi-Fi phone-to-PC remote control app
**Researched:** 2026-02-27
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                         Client Interaction Layer                           │
├────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐      ┌──────────────────────────────────────┐  │
│  │ Mobile Controller UI │      │ Desktop Control Panel + Live Preview │  │
│  └──────────┬───────────┘      └──────────────┬───────────────────────┘  │
│             │                                   │                          │
├─────────────┴───────────────────────────────────┴──────────────────────────┤
│                          Local Control Runtime (PC)                        │
├────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌───────────────────┐  ┌──────────────────────────┐  │
│  │ DiscoverySvc   │  │ Pairing/AuthSvc   │  │ Realtime Gateway (WS)    │  │
│  │ (mDNS/QR seed) │  │ (device trust)    │  │ (commands/events/acks)   │  │
│  └────────┬───────┘  └────────┬──────────┘  └──────────┬───────────────┘  │
│           │                    │                        │                  │
│  ┌────────┴────────────────────┴────────────────────────┴───────────────┐ │
│  │                  Domain Application Services                           │ │
│  │  Layout Service | Action Registry | Command Router | Audit Logger      │ │
│  └────────┬───────────────────────────────────────────────────────────────┘ │
├───────────┴────────────────────────────────────────────────────────────────┤
│                          Execution + Persistence Layer                      │
├────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐        ┌───────────────────────────────────────┐ │
│  │ Action Executor     │        │ SQLite (config, trusted devices, log) │ │
│  │ (open app/url/media)│        │ + file asset store (icons/thumbnails) │ │
│  └─────────────────────┘        └───────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Mobile Controller UI | Render published tiles, send tap intents, show execution status | Native mobile app or PWA with persistent local session token |
| Desktop Control Panel | Manage tiles/layout/icons and map tile -> action payload | Desktop web UI inside Electron/Tauri shell |
| Discovery Service | Make PC discoverable on LAN and expose bootstrap metadata | DNS-SD/mDNS advertisement with service type + host/port |
| Pairing/Auth Service | Establish trusted relationship and issue device credential | One-time pairing code/QR + signed long-lived device token |
| Realtime Gateway | Bidirectional low-latency channel for command/ack/state events | WebSocket (or Socket.IO) namespace per paired device |
| Action Registry | Validate, normalize, and version action payloads | Strict schema validation + allowlisted action types |
| Command Router | Route command to idempotent executor path and produce correlation IDs | In-process command bus with retry-safe IDs |
| Action Executor | Invoke OS-level actions safely and return deterministic outcomes | Child-process launch wrappers + media control adapters |
| Audit Logger | Persist command request/result for trust, debugging, replay hints | Append-only event table in SQLite |
| Persistence | Source of truth for dashboard config and trust state | SQLite in WAL mode for local concurrency |

## Recommended Project Structure

```text
src/
├── apps/
│   ├── desktop-shell/          # Electron/Tauri bootstrap and packaging
│   ├── desktop-panel/          # Tile editor + live preview UI
│   └── mobile-controller/      # Phone runtime UI
├── runtime/
│   ├── gateway/                # WebSocket/Socket.IO transport handlers
│   ├── discovery/              # mDNS/DNS-SD announce + browse
│   ├── pairing/                # pairing handshake + device trust
│   ├── commands/               # command bus, idempotency, ACK tracking
│   └── execution/              # app/url/media executors
├── domain/
│   ├── tiles/                  # tile entities, ordering, icon refs
│   ├── actions/                # action schemas and validators
│   └── events/                 # audit event types and mappers
├── infra/
│   ├── db/                     # SQLite adapters, migrations, repositories
│   ├── assets/                 # icon storage + thumbnail pipeline
│   └── security/               # token signing, key handling
└── shared/
    ├── contracts/              # request/event DTOs used by all clients
    └── utils/                  # logging, clocks, IDs, error mapping
```

### Structure Rationale

- **runtime/:** isolates transport/discovery/pairing risk from UI churn and keeps low-latency command path testable in headless mode.
- **domain/:** prevents transport-specific logic from polluting action semantics, so swapping WS libraries does not rewrite business logic.
- **infra/:** keeps persistence/security edge cases localized, which reduces blast radius when hardening credentials and migrations.
- **shared/contracts:** enforces one typed protocol for desktop+mobile+runtime, minimizing integration drift.

## Architectural Patterns

### Pattern 1: PC-Hosted Monolith with Thin Clients

**What:** Keep all authority and action execution on the PC host runtime; mobile and panel are clients only.
**When to use:** MVP through early adoption (<10k active installs) where reliability and low ops cost matter more than distributed scale.
**Trade-offs:** Fastest path and easiest debugging; limited remote/WAN support until later relay architecture is introduced.

**Example:**
```typescript
// mobile sends intent only; host decides and executes
emit("command.execute", {
  commandId,
  tileId,
  clientTs,
});
```

### Pattern 2: Command + Acknowledgement Protocol with Correlation IDs

**What:** Every command has `commandId`, explicit ACK stages (`received`, `started`, `succeeded|failed`), and timeout semantics.
**When to use:** Always for remote-control semantics where users need trust that a tap mapped to a single deterministic action.
**Trade-offs:** Slightly more protocol complexity; major gain in debuggability, retry safety, and user confidence.

**Example:**
```typescript
type CommandAck =
  | { stage: "received"; commandId: string }
  | { stage: "started"; commandId: string }
  | { stage: "succeeded"; commandId: string; result: "ok" }
  | { stage: "failed"; commandId: string; code: string; detail?: string };
```

### Pattern 3: Schema-First Action Registry (Allowlist)

**What:** Route only known action types (`open_app`, `open_url`, `media`) through versioned schemas and executors.
**When to use:** Security-sensitive local execution where arbitrary payloads must never map directly to shell execution.
**Trade-offs:** Slower to add new action types; much lower command-injection risk and easier compatibility handling.

## Data Flow

### Request Flow

```text
[Tap Tile on Phone]
    ↓
[Mobile Controller] -> [Realtime Gateway] -> [Command Router] -> [Action Executor]
    ↓                       ↓                    ↓                    ↓
[UI ACK/Event] <- [ACK stream] <- [Audit Logger + Store] <- [Execution Result]
```

### State Management

```text
[SQLite + Event Log]
    ↓ (publish changes)
[Runtime Domain Services] -> [Gateway emits deltas] -> [Desktop + Mobile stores]
    ↑                                                    ↓
    +------------------- [UI mutation commands] ---------+
```

### Key Data Flows

1. **Pairing flow:** Mobile discovers host (mDNS or manual IP) -> enters/scans one-time code -> host binds device and issues credential -> subsequent sessions authenticate with credential.
2. **Dashboard publish flow:** Desktop edits tiles -> validates action payloads -> persists config -> runtime publishes versioned layout snapshot -> mobile atomically swaps to new version.
3. **Command execution flow:** Mobile sends `commandId` + `tileId` -> router resolves action -> executor runs OS action -> ACK stages stream back -> final result persisted and shown in UI.
4. **Recovery flow:** On reconnect, mobile sends last seen offset/version -> host replays missed config/events when available; otherwise forces full snapshot sync.

## Implementation Sequence (Risk-Minimizing MVP)

1. **Host runtime skeleton (no UI):** boot process, SQLite schema, logging, health endpoint.
2. **Deterministic command plane:** WebSocket channel, command IDs, ACK protocol, in-memory fake executor.
3. **Real executors for 3 action types:** open app, open URL, media controls with strict allowlist validation.
4. **Pairing and trust:** one-time code/QR pairing, persistent device credentials, connection auth gate.
5. **Desktop control panel CRUD:** tile create/edit/reorder/delete, action mapping, publish versioning.
6. **Mobile controller UI:** consume published layout, execute commands, render live ACK/result states.
7. **Discovery and polish:** mDNS discovery, fallback manual IP entry, reconnect/resync, structured diagnostics.

**Why this order minimizes risk:** It proves the core value loop (tap -> deterministic action -> visible ACK) before spending time on editor polish and LAN discovery edge cases.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Single-host in-process runtime is sufficient; prioritize reliability telemetry over infra complexity. |
| 1k-100k users | Add stronger reconnect recovery, richer audit indexing, crash-safe queueing for pending commands; keep single-node per installation. |
| 100k+ users | Introduce optional cloud relay/control plane for WAN and multi-device sync; keep local execution agent authoritative on each PC. |

### Scaling Priorities

1. **First bottleneck:** reconnect and state drift under flaky Wi-Fi; solve with versioned snapshots + offset-based replay.
2. **Second bottleneck:** command trust/debuggability; solve with end-to-end correlation IDs and searchable audit events.

## Anti-Patterns

### Anti-Pattern 1: UI-Driven Direct OS Execution

**What people do:** Desktop/mobile UI directly invokes OS commands or shell calls.
**Why it's wrong:** Blends trust boundaries, increases injection risk, and makes retry/idempotency impossible.
**Do this instead:** Force all execution through host runtime command router + allowlisted executors.

### Anti-Pattern 2: Best-Effort Fire-and-Forget Commands

**What people do:** Send command events without IDs/ACKs and assume success.
**Why it's wrong:** Users lose trust when taps are duplicated, dropped, or silently fail during network jitter.
**Do this instead:** Use explicit ACK stages, retry policy, and terminal success/failure state.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| DNS-SD/mDNS | Advertise `_service._tcp.local` and discover host endpoint on LAN | Standard local-link service discovery; include manual-IP fallback for constrained networks. |
| WebSocket transport | Persistent bidirectional command/event channel | Prefer secure channel on trusted pairings (`wss` where practical). |
| OS process/media APIs | Adapter layer behind Action Executor | Never pass unsanitized user input to shell-backed execution paths. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| mobile-controller <-> runtime/gateway | typed realtime protocol | Includes auth token, command IDs, ACK stream, resync operations. |
| desktop-panel <-> runtime/domain | command/query API + events | Panel writes intent; runtime remains source of truth. |
| runtime/commands <-> runtime/execution | in-process command bus | Enforces validation, idempotency, and audit hooks before execution. |

## Sources

- RFC 6455 WebSocket Protocol (IETF, 2011, updated by later RFCs) - handshake model, ws/wss, security considerations. Confidence: HIGH. https://www.rfc-editor.org/rfc/rfc6455
- RFC 6762 Multicast DNS (IETF, 2013) - local-link discovery behavior and constraints. Confidence: HIGH. https://www.rfc-editor.org/rfc/rfc6762
- RFC 6763 DNS-Based Service Discovery (IETF, 2013, updated by RFC8553) - service instance discovery pattern. Confidence: HIGH. https://www.rfc-editor.org/rfc/rfc6763
- Socket.IO delivery guarantees (updated Jan 22, 2026) - at-most-once default and app-level at-least-once patterns. Confidence: MEDIUM. https://socket.io/docs/v4/delivery-guarantees
- Socket.IO connection state recovery (updated Jan 22, 2026) - reconnect/session restoration semantics. Confidence: MEDIUM. https://socket.io/docs/v4/connection-state-recovery
- Node.js child_process docs (v25.7.0) - command execution APIs and shell-injection cautions. Confidence: HIGH. https://nodejs.org/api/child_process.html
- SQLite WAL documentation (updated 2025-05-31) - concurrency model and checkpoint behavior for local persistence. Confidence: HIGH. https://www.sqlite.org/wal.html
- Apple Developer: "How to use multicast networking in your app" (2020-06-22) - iOS local-network privacy, Bonjour declarations, multicast entitlement. Confidence: MEDIUM. https://developer.apple.com/news/?id=0oi77447
- Electron security checklist (latest docs) - IPC sender validation and secure content guidance for desktop shell hardening. Confidence: MEDIUM. https://www.electronjs.org/docs/latest/tutorial/security

---
*Architecture research for: local Wi-Fi phone-to-PC remote control app*
*Researched: 2026-02-27*
