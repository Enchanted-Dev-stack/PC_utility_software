# Feature Research

**Domain:** Local Wi-Fi phone-to-PC remote control app (mobile client + desktop host)
**Researched:** 2026-02-27
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Same-network discovery + trusted pairing | Competitors all lead with "connect phone and PC on same Wi-Fi" and quick setup flows | MEDIUM | Must include explicit trust handshake (pair request/accept) and remembered devices; base security requirement for any LAN control app |
| Low-latency remote input/actions | Core promise is instant control from couch/desk; competitors position this as primary value | MEDIUM | Includes reliable tap/gesture to host action execution and acknowledgement so users trust outcomes |
| Core control set: mouse/trackpad, keyboard input, media controls, app/URL launch | These are baseline controls in mainstream remote apps | MEDIUM | For this project, map to tile actions plus a compact "essentials" set for common controls |
| PC-side desktop host service | Market norm is mobile app + desktop helper/daemon running on the controlled machine | MEDIUM | Needs auto-start option, connection status, and graceful reconnect handling |
| Basic connection security (password or paired device auth, encrypted transport) | Security controls are now openly advertised by incumbents | MEDIUM | v1 should enforce authenticated sessions; do not ship anonymous command execution |
| Setup resiliency + troubleshooting signals | Existing products/documentation spend significant effort on discovery failures/firewall issues | LOW | Include clear host/mobile status, "same network" checks, and actionable diagnostics before advanced features |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Desktop dashboard builder with live mobile preview | Turns generic remote into a creator tool; reduces trial-and-error when designing control layouts | HIGH | Aligns directly with project core value (custom tiles + polished UX); strongest near-term differentiator |
| Visual tile/icon studio (themes, icon generation, per-tile states) | Makes the remote feel personal and premium vs utility-only remotes | MEDIUM | Ship after v1 reliability; can start with templates, then add richer styling/icon generation |
| Action reliability layer (delivery state, retries, deterministic logs) | Builds trust for automation-like usage; users can verify that "tap = expected PC behavior" | HIGH | Important for power users and debugging; should evolve from basic event log in v1 to richer observability |
| Scenario profiles (context-based pages: media, work, gaming) with quick switching | Reduces UI clutter and speeds task-specific workflows | MEDIUM | Natural extension once tile CRUD is stable; can later add scheduled/auto profile switching |
| Optional multi-device control sessions (one host, multiple phones/tablets) | Enables household/shared control and desk+sofa workflows | HIGH | Valuable later; defer until auth/session model is mature |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Internet/WAN remote control in v1 | "Control my PC from anywhere" is attractive | Expands threat model massively (NAT traversal, auth hardening, abuse prevention, incident response); slows MVP reliability | Keep v1 strictly LAN-first; revisit only after local security/reliability metrics are strong |
| Arbitrary scripts/plugins in v1 | Power users want unlimited automation | High security and support burden; command sandboxing and permissioning become product-defining work | Start with curated action types (app launch, URL, media, system controls), then add signed/permissioned extensibility later |
| Bluetooth as primary control path in v1 | Perceived convenience when Wi-Fi is weak | Adds transport complexity and inconsistent platform behavior early | Keep Wi-Fi as primary transport; optionally explore Bluetooth for discovery/pair assist in later phase |
| Full remote desktop/streaming in v1 | Users conflate "remote control" with full screen sharing | Different product category (encoding, latency, bandwidth, privacy), likely derails scope | Stay focused on command/control tiles and lightweight input controls |
| "Supports everything" integrations at launch | Competitors advertise huge integration/plugin catalogs | Creates shallow, fragile integrations and delays core UX quality | Ship a small high-quality action catalog and expand via validated use cases |

## Feature Dependencies

```
Trusted pairing/auth
    requires -> Host service + device identity management
                   requires -> Local network discovery/connectivity layer

Action execution from tiles
    requires -> Trusted pairing/auth
    requires -> Action runtime on host (app launch/URL/media/system)

Desktop dashboard builder + live mobile preview
    requires -> Action execution model + tile schema
    requires -> Bidirectional state sync channel

Reliability layer (delivery state/logs/retries)
    enhances -> Action execution from tiles

WAN remote control
    conflicts -> LAN-first MVP scope and security budget

Arbitrary plugin/script ecosystem
    conflicts -> Curated safe action model in v1
```

### Dependency Notes

- **Trusted pairing/auth requires host service + identity management:** pairing is not a UI toggle; it depends on persisted device trust and session validation.
- **Tile action execution requires pairing + host runtime:** without both, taps are either insecure or no-op.
- **Live preview requires shared tile schema + state sync:** preview quality depends on accurate model parity between desktop editor and mobile runtime.
- **Reliability layer enhances action execution:** logging/ack/retry turns "best effort" into trustworthy control.
- **WAN and plugin extensibility conflict with v1 goals:** both introduce security/performance scope that competes with MVP polish and determinism.

## MVP Definition

### Launch With (v1)

Minimum viable product - what is needed to validate the concept.

- [ ] Local discovery + trusted pairing over Wi-Fi LAN - essential security and setup baseline
- [ ] Desktop host service + mobile client connectivity with reconnect handling - mandatory control loop
- [ ] Tile CRUD in desktop control panel (create/edit/reorder/delete) - core product workflow
- [ ] Fast action execution for curated action types (open app, open URL, media controls, basic system controls) - validates utility
- [ ] Live mobile preview for tile layout/state during editing - key UX differentiator, should be in v1 if schedule allows
- [ ] Basic action/event log with success/failure feedback - confidence and debugging for early users

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Rich visual customization (themes, icon packs, generated icons) - add when baseline reliability KPI is met
- [ ] Profile/page templates (media/work/presentation) - add when users demonstrate repeat layout patterns
- [ ] Shortcut and macro chains (multi-step, no arbitrary scripting) - add after action engine stability
- [ ] Optional Bluetooth-assisted discovery/pairing - add if LAN discovery friction is a top support issue

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Controlled extensibility model (signed plugins, permissioned actions) - defer until trust model and review process exist
- [ ] Multi-device concurrent sessions with role controls - defer until auth/session model matures
- [ ] WAN/relay-based remote access - defer until security architecture and operational posture are ready
- [ ] Limited screen feedback/thumbnail streams for context (not full remote desktop) - defer until command/control UX is proven

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Wi-Fi discovery + trusted pairing | HIGH | MEDIUM | P1 |
| Host service + resilient connection loop | HIGH | MEDIUM | P1 |
| Tile CRUD in desktop panel | HIGH | MEDIUM | P1 |
| Curated action execution engine | HIGH | MEDIUM | P1 |
| Live mobile preview in editor | HIGH | HIGH | P1 |
| Basic delivery log + action feedback | HIGH | LOW | P1 |
| Rich theming/icon generation | MEDIUM | MEDIUM | P2 |
| Profile templates and quick switching | MEDIUM | MEDIUM | P2 |
| Multi-step macros (safe subset) | MEDIUM | MEDIUM | P2 |
| Multi-device sessions | MEDIUM | HIGH | P3 |
| Plugin marketplace/arbitrary scripts | LOW | HIGH | P3 |
| WAN remote access | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Unified Remote | KDE Connect | Our Approach |
|---------|----------------|-------------|--------------|
| Same-network setup + server app | Desktop server + auto detection over Wi-Fi/Bluetooth | Pairing across devices on same network; manual IP fallback documented | Wi-Fi-first setup with strong pairing UX and clear diagnostics |
| Core controls (input/media/commands) | Broad remote catalog (mouse, keyboard, media, power, commands) | Virtual input, multimedia control, run predefined commands | Focused, reliable curated action set in v1, then expand intentionally |
| Security posture | Password protection + encryption called out | Explicit pairing trust model and firewall guidance | Mandatory trusted pairing + authenticated session by default |
| Customization depth | Custom remotes in full version | Plugin-based capability set | Core differentiator: desktop builder + live preview + visual tile system |

## Sources

- KDE Connect user documentation (features, pairing, troubleshooting, platform limits; last edited 2026-01-28): https://userbase.kde.org/KDEConnect
- Unified Remote Google Play listing (feature set, security claims, transport modes; updated 2024-07-31): https://play.google.com/store/apps/details?id=com.Relmtech.Remote
- Remote Mouse website (core positioning and setup model): https://www.remotemouse.net/
- Remote Mouse Google Play listing (feature set, security/password mention, transport modes; updated 2025-11-29): https://play.google.com/store/apps/details?id=com.hungrybolo.remotemouseandroid
- Macro Deck official site (customizable pages/profiles/plugins, QR/Web client flow): https://macrodeck.org/
- Touch Portal official site (macro page model, plugin ecosystem, customization-heavy positioning): https://www.touch-portal.com/

---
*Feature research for: local Wi-Fi phone-to-PC remote control app*
*Researched: 2026-02-27*
