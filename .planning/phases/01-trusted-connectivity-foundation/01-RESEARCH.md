# Phase 1: Trusted Connectivity Foundation - Research

**Researched:** 2026-02-27
**Domain:** Local LAN discovery, trust pairing, authenticated control channel
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Host discovery flow
- Phone app starts with automatic host scanning immediately on open.
- If no host is found within a short window, show: `Retry scan` and `Enter IP manually`.
- If multiple hosts are found, list each with PC name, device ID, and last-seen timestamp for explicit user selection.
- If discovery fails but manual IP succeeds, remember the last successful host and offer quick reconnect next time.

### Pairing experience
- Support both QR pairing and 6-digit code pairing in v1.
- Pairing can be initiated from either phone or PC.
- PC must require explicit Approve/Deny for every new pairing request.
- Trust is persistent after approval (until revoked), not one-session-only.

### Reconnect behavior
- Returning trusted devices auto-reconnect to last trusted host by default.
- Keep a visible switch-host option while auto-reconnecting.
- On connection drop, use automatic retry with backoff and also show manual retry.
- During reconnecting state, action tiles are blocked/disabled to prevent stale triggers.
- After roughly 30-60 seconds of failed retries, stop retry loop and show explicit reconnect CTA.

### Connection status UX
- Show clear labeled status states (Connected, Reconnecting, Disconnected) with color coding.
- In reconnecting/disconnected states, show a short reason hint and primary action button.
- Show active host and trusted indicator in the main header; full trust management remains in settings.
- Use subtle animated transitions and concise toasts for state changes.

### Claude's Discretion
- Exact visual styling tokens (spacing, typography, iconography) for status components.
- Exact retry backoff interval values within the selected pattern.
- Exact wording for status hints/toasts as long as semantics remain the same.

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CNCT-01 | Discover host on same Wi-Fi or connect via manual IP fallback | Discovery service + manual host connect endpoint + persisted last host |
| CNCT-02 | Complete one-time explicit trust pairing | Pairing request handshake with code/QR challenge and PC approval gate |
| CNCT-03 | Reconnect trusted phone without repeating pairing | Stored trust record + resumable session token + reconnect state machine |
| CNCT-04 | Show live connection status on phone and PC | Shared connection state model + event bus updates to both UIs |
| SAFE-02 | Remove trusted phone from PC control panel | Trust store with revoke endpoint + UI list/remove action |
| SAFE-03 | Accept actions only from paired/authenticated devices | Auth middleware validating trust + session before action routes |
</phase_requirements>

## Summary

For this phase, the safest implementation sequence is: establish a deterministic transport and host identity first, then layer pairing and trust persistence, then finalize reconnection/state UX and revocation. This reduces risk of rework because pairing and reconnect behavior depend on stable host identity and session lifecycle semantics.

The architecture should use one canonical trust store on the PC host and require all action requests to pass a trust + session validator before dispatch. Discovery should remain lightweight (LAN broadcast/mDNS + manual IP fallback), while pairing should be explicit and human-approved from the PC UI regardless of which side initiated the flow.

**Primary recommendation:** Build a single connection state machine shared by transport, auth, and UI so discovery, pairing, reconnect, and revocation all emit consistent state transitions.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ws | 8.x | Bidirectional realtime channel between phone and PC | Stable, low-overhead WebSocket transport for LAN apps |
| bonjour-service or equivalent mDNS adapter | latest compatible | LAN host discovery advertisement and lookup | Common pattern for zero-config discovery on local networks |
| zod | 3.x | Runtime validation of pairing/session/action payloads | Prevents malformed requests and drift between clients |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| qrcode | 1.x | Render pairing challenge as QR | For phone-initiated quick pair UX |
| nanoid | 5.x | Generate ephemeral pairing/session IDs | Non-guessable short-lived tokens |
| lowdb/sqlite adapter | latest compatible | Persist trusted devices and last-host metadata | If durable trust store is not already present |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WebSocket (`ws`) | Socket.IO | Easier event semantics but extra framing/protocol overhead |
| mDNS-only discovery | UDP broadcast probe | Better fallback on some networks but noisier and OS-firewall sensitive |

## Architecture Patterns

### Recommended Project Structure
```
apps/
  desktop/
    src/connectivity/
      discovery/
      pairing/
      session/
      trust/
      status/
  mobile/
    src/connectivity/
      discovery/
      pairing/
      session/
      status/
shared/
  src/contracts/
  src/types/
```

### Pattern 1: Host Identity + Discovery Registry
**What:** Every host advertises immutable hostId + display metadata. Mobile caches candidates and last successful host.
**When to use:** Initial connect and fallback flows.

### Pattern 2: Explicit Pairing Challenge
**What:** Pairing always generates an expiring challenge requiring PC Approve/Deny.
**When to use:** First trust establishment and re-pair after revocation.

### Pattern 3: Connection State Machine
**What:** State transitions `disconnected -> scanning -> pairing -> connected -> reconnecting` with reason metadata.
**When to use:** Any transport/auth event that affects UX availability.

### Anti-Patterns to Avoid
- **Trust as client-only flag:** Trust must be server-authoritative on PC.
- **Implicit re-pairing during reconnect:** Reconnect must reuse trust/session, not restart pairing silently.
- **Dual status models per platform:** Keep one shared status vocabulary to avoid UI drift.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Socket framing/reliability protocol | Custom message protocol with retries/acks first | WebSocket + typed event envelope | Reduces protocol bugs and simplifies reconnection handling |
| QR encoding/parsing internals | Manual matrix generation | `qrcode` library | Avoids edge-case rendering/scanning issues |
| Input schema parsing | Ad-hoc field checks in handlers | `zod` schema validation | Centralized, testable validation for all inbound payloads |

## Common Pitfalls

### Pitfall 1: Pairing Approval Race
**What goes wrong:** Mobile assumes success before PC approval commit completes.
**How to avoid:** Emit `pairing_pending` then `paired` only after trust store write succeeds.

### Pitfall 2: Reconnect Loop Never Settles
**What goes wrong:** Client retries forever and keeps controls in broken semi-live state.
**How to avoid:** Bounded retry window (30-60s), then hard `disconnected` with explicit CTA.

### Pitfall 3: Revoked Device Still Sends Actions
**What goes wrong:** Existing socket/session remains valid after revoke event.
**How to avoid:** Revoke invalidates trust record and actively terminates matching active sessions.

## Code Examples

### Guard every action route by trust + session
```typescript
const envelope = ActionEnvelopeSchema.safeParse(message)
if (!envelope.success) return sendError("invalid_payload")
if (!trustStore.isTrusted(envelope.data.deviceId)) return sendError("untrusted_device")
if (!sessionStore.isSessionValid(envelope.data.sessionId, envelope.data.deviceId)) return sendError("unauthorized")
dispatchAction(envelope.data)
```

### Reconnect status transition skeleton
```typescript
setStatus({ state: "reconnecting", reason: "socket_closed" })
const ok = await retryWithBackoff(connect, { maxWindowMs: 45000 })
if (ok) setStatus({ state: "connected" })
else setStatus({ state: "disconnected", reason: "retry_exhausted" })
```

## Open Questions

1. **Exact desktop/mobile framework boundaries are not yet codified.**
   - What we know: This repository is still planning-first with no concrete app scaffolding.
   - What's unclear: Final framework/runtime choices for desktop and mobile packages.
   - Recommendation: First implementation plan should create connectivity modules in framework-agnostic folders and thin adapters at UI boundaries.

## Sources

### Primary (HIGH confidence)
- Project documents in `.planning/` (ROADMAP, REQUIREMENTS, CONTEXT, PROJECT).

### Secondary (MEDIUM confidence)
- Established LAN control architecture patterns from prior local-first app implementations.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - dependency recommendations are pattern-based until concrete app scaffolding exists.
- Architecture: HIGH - directly derived from locked phase decisions and requirements.
- Pitfalls: MEDIUM - based on common transport/trust lifecycle failure modes.

**Research date:** 2026-02-27
**Valid until:** 2026-03-27
