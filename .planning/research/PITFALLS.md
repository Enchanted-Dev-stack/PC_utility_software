# Pitfalls Research

**Domain:** Local Wi-Fi phone-to-PC remote control MVP
**Researched:** 2026-02-27
**Confidence:** MEDIUM

## Critical Pitfalls

### Pitfall 1: Treating LAN as trusted and skipping real pairing

**What goes wrong:**
Any device on the same Wi-Fi can trigger PC actions because the app accepts local traffic without strong device trust.

**Why it happens:**
Teams assume "same network" is enough security and optimize for quick demos.

**How to avoid:**
Require explicit pairing with a one-time code (or QR) shown on PC, issue per-device credentials, and bind every command to authenticated session identity. Keep an action allowlist by default.

**Warning signs:**
- Fresh app install can control PC without a user-confirmed pairing step.
- Commands still work after phone reinstall without re-pair.
- API accepts requests from any host that reaches the port.

**Phase to address:**
Phase 1 - Security model + pairing protocol before feature expansion.

---

### Pitfall 2: Discovery flow breaks on mobile privacy/permission rules

**What goes wrong:**
Phone cannot find PC reliably; users see "no devices found" even on same network.

**Why it happens:**
Teams implement mDNS/NSD but miss platform requirements (iOS local network prompts/Bonjour declarations, Android nearby Wi-Fi permissions).

**How to avoid:**
Build discovery as a state machine with explicit permission states and fallback manual connect (IP + pairing code). Add platform-specific preflight checks at app startup and telemetry for each discovery stage.

**Warning signs:**
- Discovery success rate differs sharply by OS version.
- Spike in permission-denied or SecurityException logs.
- Support reports: "works on desktop, phone never sees host".

**Phase to address:**
Phase 2 - Discovery + permissions hardening, before custom dashboard UX.

---

### Pitfall 3: No command delivery semantics (duplicates, reordering, ghost taps)

**What goes wrong:**
Single tap triggers twice, or delayed commands fire later in the wrong context.

**Why it happens:**
MVPs send fire-and-forget WebSocket/HTTP messages without command IDs, acknowledgments, dedupe window, or timeout policy.

**How to avoid:**
Define protocol envelope early: `command_id`, `issued_at`, `ttl_ms`, `ack_required`, `idempotency_key`. Enforce at-most-once execution per idempotency window and reject expired commands.

**Warning signs:**
- Users report random double execution under weak Wi-Fi.
- Server logs show repeated payloads with no dedupe behavior.
- No measurable command success/ack ratio.

**Phase to address:**
Phase 1 - Protocol contract and execution semantics.

---

### Pitfall 4: Fragile long-lived connections (no heartbeat/reconnect policy)

**What goes wrong:**
UI shows "connected" while socket is dead; first tap after idle fails.

**Why it happens:**
Developers rely on default socket behavior and ignore idle timeouts from network infrastructure and mobile power modes.

**How to avoid:**
Implement heartbeat + liveness detection, explicit reconnect backoff, session resumption, and stale-connection cutover. Surface connection state in UI with last-ack timestamp.

**Warning signs:**
- Control fails mainly after 1-5 minutes idle.
- Reopen app "fixes" connection.
- No ping/pong latency metric or reconnect reason codes.

**Phase to address:**
Phase 3 - Transport reliability and reconnection behavior.

---

### Pitfall 5: OS boundary failures on the PC side (firewall/UIPI/privilege mismatches)

**What goes wrong:**
Some actions silently fail (especially input simulation or app control) despite successful transport.

**Why it happens:**
Control-plane implementation ignores Windows firewall rules and desktop integrity boundaries (UIPI), so "command accepted" != "action executed".

**How to avoid:**
Add install-time firewall rule checks, privilege diagnostics, and per-action capability checks before execution. Return structured execution result codes (`executed`, `blocked_by_uipi`, `blocked_by_firewall`, etc.).

**Warning signs:**
- High rate of "sent" without corresponding "executed" events.
- Works only when app runs elevated.
- Users report media keys work but keyboard/mouse injection doesn't.

**Phase to address:**
Phase 2 - PC agent bootstrap and environment validation.

---

### Pitfall 6: Action engine is over-permissive too early

**What goes wrong:**
MVP exposes broad command primitives (arbitrary shell/script execution) that create severe abuse risk and unstable UX.

**Why it happens:**
Teams optimize for flexibility over safety before they have trust, auditability, and policy controls.

**How to avoid:**
Ship v1 with narrow, typed actions only (open approved app, open URL from allowlist, media controls). Keep "arbitrary command" behind later phase with explicit policy, prompts, and audit trail.

**Warning signs:**
- Feature requests push plugin/script support before core reliability metrics are green.
- No per-action policy/approval model exists.
- Security review cannot explain blast radius of one compromised phone.

**Phase to address:**
Phase 1 - MVP scope guardrails and action policy.

---

### Pitfall 7: No observability for control loop quality

**What goes wrong:**
Team cannot distinguish discovery failures vs transport failures vs execution failures; roadmap decisions become guesswork.

**Why it happens:**
MVP logging is ad hoc and does not track end-to-end command lifecycle.

**How to avoid:**
Define event schema for every stage: discover -> pair -> connect -> send -> ack -> execute -> result. Add session replay IDs, latency percentiles, and failure taxonomy dashboards.

**Warning signs:**
- Bugs described as "sometimes doesn't work" with no actionable traces.
- No P95 tap-to-effect latency metric.
- Fixes regress unrelated areas unnoticed.

**Phase to address:**
Phase 3 - Reliability instrumentation before UI polish phase.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded host/port + no discovery fallback | Faster initial demo | High support burden across routers/OS versions | Prototype only (not MVP release) |
| Single shared auth token for all phones | Easy session handling | No device revocation, weak auditability | Never |
| Fire-and-forget commands | Minimal protocol complexity | Ghost taps, duplicate execution, no trust in system | Never |
| Skip firewall/privilege diagnostics | Less installer work | "Works on my machine" failures in production | Never |
| Add arbitrary script action in v1 | Power-user appeal | Large security blast radius and policy debt | Never in local-control MVP |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| iOS local networking (Bonjour/local LAN access) | Triggering permission too early or missing plist/service declarations | Request at feature entry, declare required services/usage strings, handle denied state with manual connect fallback |
| Android Wi-Fi/nearby permissions | Assuming pre-Android-13 flow works everywhere | Handle Android version branches, request `NEARBY_WIFI_DEVICES` (and location where required), instrument permission outcomes |
| mDNS/NSD discovery | Assuming service names/ports are static and globally unique | Accept service-name conflict renames, publish runtime port, resolve service before connect |
| Windows Defender Firewall | Relying on first-run prompts and local admin user behavior | Stage explicit inbound rules and verify effective policy during setup |
| Win32 input injection | Assuming accepted command means input reached target app | Detect and report UIPI/integrity blocking; align agent privilege with controlled target scope |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No backpressure on command queue | Latency spikes, stale actions execute late | Per-session queue caps, TTL expiry, drop policy for stale commands | Noticeable even at 1-5 concurrent sessions under weak Wi-Fi |
| Aggressive polling for discovery/health | Battery drain on phone, noisy network | Event-driven discovery + bounded heartbeat intervals | Early, especially on mobile battery saver modes |
| Synchronous action execution in one thread | One slow app launch blocks all commands | Isolate transport loop from executor pool, enforce per-action timeout | At moderate action diversity (media + app launch + URL) |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting private subnet by source IP only | Any LAN peer can send control commands | Authenticated pairing + per-device credentials + command signing/session auth |
| Allowing broad CORS/local endpoint exposure | Browser-origin CSRF/DNS-rebinding-style control attempts | Strict origin policy, CSRF-resistant command channel, no unauthenticated state-changing endpoints |
| Storing long-lived secret in plaintext config | Credential theft from local machine/profile backups | Encrypt at rest with OS keystore/DPAPI and rotate on re-pair |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Connected" status based only on socket open | False confidence; first tap fails | Show health as last successful ack/execution timestamp |
| Generic failure toasts ("Action failed") | Users cannot self-recover | Actionable errors: "Allow Local Network", "Open firewall", "Re-pair device" |
| Pairing flow buried after dashboard setup | Confusing first-run; low completion | Pair first, then unlock editor/live preview |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Pairing:** Device appears in list but cannot be individually revoked - verify per-device identity and revoke flow.
- [ ] **Connectivity:** Manual test works once - verify reconnect after idle, Wi-Fi switch, and app background/foreground.
- [ ] **Action execution:** Command returns 200/ACK - verify OS-level execution outcome code is persisted and visible.
- [ ] **Security:** LAN-only works in home setup - verify behavior on hostile LAN simulation and blocked-origin web requests.
- [ ] **Reliability:** Demo feels instant - verify P50/P95 tap-to-effect latency and duplicate-rate under packet loss.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Weak pairing/auth model shipped | HIGH | Freeze feature work, rotate all credentials, force re-pair, add auth gate in protocol layer |
| Discovery broken on one OS family | MEDIUM | Ship manual-connect fallback, hotfix permissions UX, add discovery stage telemetry |
| Duplicate/ghost command execution | HIGH | Introduce idempotency keys and dedupe store, invalidate stale queued commands, add command audit view |
| Silent OS execution failures on Windows | MEDIUM | Add diagnostics wizard, expose execution reason codes, patch installer for firewall/privilege checks |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| LAN-trust/no real pairing | Phase 1 - Security model + pairing protocol | Unauthorized unpaired device cannot execute any action in test LAN |
| Discovery permission failures | Phase 2 - Discovery and platform permissions | Device discovery success by OS/version tracked and > target threshold |
| Duplicate/ghost commands | Phase 1 - Protocol semantics | Idempotency tests pass under retry and packet loss simulation |
| Dead sockets after idle | Phase 3 - Transport reliability | Heartbeat/reconnect test suite passes idle + network flap scenarios |
| Windows firewall/UIPI execution gaps | Phase 2 - PC agent environment checks | Installer diagnostics detect + remediate blocked conditions |
| Over-permissive action surface | Phase 1 - Scope and policy guardrails | Only typed allowlisted actions exposed in MVP API |
| Missing observability | Phase 3 - Telemetry and diagnostics | End-to-end lifecycle trace available for every failed command |

## Sources

- Apple WWDC20: Support local network privacy in your app (local network permission behavior, Info.plist keys, permission timing) - https://developer.apple.com/videos/play/wwdc2020/10110/ (HIGH)
- Android docs: Request permission to access nearby Wi-Fi devices (`NEARBY_WIFI_DEVICES`, runtime requirements) - https://developer.android.google.cn/develop/connectivity/wifi/wifi-permissions?hl=en (HIGH)
- Android docs: Use network service discovery (NSD caveats: service-name conflicts, dynamic ports, lifecycle handling) - https://developer.android.google.cn/develop/connectivity/wifi/use-nsd?hl=en (HIGH)
- Android docs: Optimize for Doze and App Standby (network deferral/background limits, testing commands) - https://developer.android.google.cn/training/monitoring-device-state/doze-standby?hl=en (HIGH)
- Microsoft Learn: Windows Firewall rules and automatic rule-creation behavior - https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/rules (HIGH)
- Microsoft Learn: `SendInput` and UIPI limitation details - https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput (HIGH)
- RFC 6762 (mDNS link-local semantics, conflict handling) - https://datatracker.ietf.org/doc/html/rfc6762 (HIGH)
- websockets docs: keepalive/heartbeat rationale and failure modes - https://websockets.readthedocs.io/en/stable/topics/keepalive.html (MEDIUM)
- Chrome Developers: Private Network Access preflights and CSRF risk to private-network devices - https://developer.chrome.com/blog/private-network-access-preflight (MEDIUM)
- OWASP IoT project (ecosystem-level insecure defaults and weak auth patterns; older but still relevant framing) - https://owasp.org/www-project-internet-of-things/ (LOW)

---
*Pitfalls research for: local Wi-Fi phone-to-PC remote control MVP*
*Researched: 2026-02-27*
