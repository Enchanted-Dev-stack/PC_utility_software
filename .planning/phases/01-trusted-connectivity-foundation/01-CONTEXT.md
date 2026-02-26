# Phase 1: Trusted Connectivity Foundation - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver secure phone-to-PC LAN connectivity for first-time and returning users: host discovery (with fallback), trusted pairing, reconnect behavior, visible connection states, and trusted-device revocation.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<specifics>
## Specific Ideas

- Keep setup beginner-friendly: auto-first with obvious fallback paths.
- Keep behavior deterministic and explicit so users trust that only approved devices can control the PC.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 01-trusted-connectivity-foundation*
*Context gathered: 2026-02-27*
