# Feature Research

**Domain:** UI polish and UX refinement for desktop builder + mobile dashboard in a local-first phone-to-PC remote control app
**Researched:** 2026-02-27
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Unified design tokens across desktop builder and mobile dashboard | Users expect one product, not two mismatched surfaces | MEDIUM | Create one source of truth for spacing, typography, color, radii, elevation, and state colors; must reuse existing builder/preview component boundaries from Phase 03 |
| Complete component interaction states (default/hover/focus/active/disabled/loading) | Modern UI quality is judged by predictable states, especially in editor tools | MEDIUM | Must be mapped to existing runtime auth/connectivity/action states so visuals reflect actual system state (not guessed UI state) |
| Live preview parity with mobile presentation | Builder UX fails if what users design differs from what the phone renders | HIGH | Needs visual parity checks tied to existing `layoutVersion` and snapshot-driven preview flow; include parity acceptance criteria in QA |
| Deterministic feedback surfaces for user actions | Users expect immediate, clear feedback after every tap/save/reorder/publish action | MEDIUM | Reuse runtime-owned feedback taxonomy and status codes; show pending/success/failure without changing underlying execution semantics |
| Accessibility baseline for polished interactions | Production polish now includes accessibility fundamentals, not just visuals | MEDIUM | Minimum expectations: 3:1 non-text contrast, visible focus, 24x24 target size minimum on touch controls, status messages exposed programmatically |
| Motion policy with reduced-motion support | Users expect tasteful motion; some users need motion minimized | LOW | Keep motion purposeful and short, and provide reduced-motion behavior for interaction-triggered animations |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Interaction fidelity scorecard in builder | Gives creators confidence that a tile/page meets polish criteria before publish | MEDIUM | Automated checks for contrast/focus/target size/state coverage/parity using existing builder models and preview snapshots |
| Action lifecycle micro-interactions tied to deterministic runtime stages | Makes the product feel premium while reinforcing trust in action execution | MEDIUM | Animate between queued -> running -> terminal states using runtime event stream from Phase 02; no synthetic success states |
| Visual diff mode: builder preview vs mobile runtime screenshot | Converts "looks off" reports into concrete, fixable deltas | HIGH | Requires screenshot capture + overlay diff tooling on top of current preview/runtime pipelines |
| Context-aware polish presets (Work/Media/Gaming) | Speeds high-quality setup and reduces design friction | LOW | Pre-tuned spacing, icon style, and motion presets layered on top of existing tile schema and CRUD flows |
| Empty/error state quality kit for all major flows | Raises perceived product maturity where many apps feel unfinished | LOW | Standardized layouts and copy for no-tiles, disconnected, untrusted device, invalid payload, and retry exhaustion states |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full UI redesign during polish milestone | "If we are polishing, we should revamp everything" | Blows scope and risks regression in already-validated runtime/builder behavior | Keep IA and workflows stable; improve visual system, states, and feedback quality in place |
| Motion-heavy transitions/parallax everywhere | Motion can make UI feel modern quickly | Can hurt responsiveness perception, conflict with reduced-motion needs, and add maintenance cost | Use a constrained motion language for only state changes and hierarchy transitions |
| UI-only optimistic success before runtime terminal events | Feels fast in demos | Breaks trust when runtime later reports deny/failure; conflicts with deterministic feedback model | Show pending immediately, commit success only on runtime terminal success code |
| Desktop-first polish that ignores mobile tap ergonomics | Desktop builder is easier to tune first | Produces beautiful editor but frustrating phone control surface | Enforce mobile target size and spacing checks as release gate for dashboard tiles |
| Per-screen bespoke component styling | Looks unique per page | Violates consistency and increases cognitive load and QA burden | Centralize on shared tokens/components and allow only constrained variants |

## Feature Dependencies

```
Unified design tokens
    requires -> Existing desktop builder component layer
    requires -> Existing mobile dashboard rendering layer

Interaction states coverage
    requires -> Runtime snapshot/status models (connectivity, trust, action lifecycle)
    requires -> Builder handlers that already route mutations through runtime services

Preview parity QA
    requires -> Shared tile schema + layoutVersion parity
    requires -> Existing live preview subscription model

Deterministic feedback polish
    requires -> Runtime-owned feedback taxonomy and terminal outcome codes

Action lifecycle micro-interactions
    enhances -> Deterministic feedback polish
    requires -> Ordered runtime lifecycle events

UI-only optimistic success states
    conflicts -> Deterministic runtime feedback contract

Motion-heavy decorative animation
    conflicts -> Reduced-motion accessibility and perceived responsiveness
```

### Dependency Notes

- **Unified design tokens require both desktop and mobile surfaces:** if either side bypasses tokens, parity debt reappears immediately.
- **Interaction state polish requires runtime truth:** connectivity/trust/action states must come from existing runtime snapshots, not local UI assumptions.
- **Preview parity depends on current Phase 03 architecture:** layout versioning and normalized tile ordering are the backbone for reliable visual comparison.
- **Feedback polish depends on Phase 02 deterministic outcomes:** the UI should map to existing typed outcome codes and keep denial reasons explicit.
- **Anti-features mainly conflict with established contracts:** optimistic success and ad-hoc styling undermine trust and consistency already built into prior milestones.

## MVP Definition

### Launch With (v1)

Minimum viable product - what is needed to validate the concept.

- [ ] Shared design token system applied to desktop builder and mobile dashboard - baseline consistency
- [ ] Complete interaction state coverage for core controls and tiles - baseline usability
- [ ] Deterministic feedback UI for save/reorder/pairing/action dispatch outcomes - baseline trust
- [ ] Preview-to-mobile parity checks with explicit acceptance criteria - baseline design reliability
- [ ] Accessibility baseline for contrast, focus visibility, touch targets, and status message semantics - baseline production readiness

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Builder polish scorecard with automated checks - add when token/state rollout is stable
- [ ] Action lifecycle micro-interactions mapped to runtime stages - add when baseline feedback UI is trusted
- [ ] Context-aware style presets (work/media/gaming) - add when core polish baseline is complete

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Visual diff tooling with screenshot overlays across devices - defer until volume of parity bugs justifies tooling cost
- [ ] Adaptive personalization of density/motion defaults per user behavior - defer until enough usage telemetry exists

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Shared design tokens across desktop/mobile | HIGH | MEDIUM | P1 |
| Full interaction state coverage | HIGH | MEDIUM | P1 |
| Deterministic feedback UI mapping runtime outcomes | HIGH | MEDIUM | P1 |
| Preview parity acceptance checks | HIGH | HIGH | P1 |
| Accessibility baseline (contrast/focus/targets/status) | HIGH | MEDIUM | P1 |
| Motion policy + reduced-motion support | MEDIUM | LOW | P1 |
| Builder polish scorecard | MEDIUM | MEDIUM | P2 |
| Runtime-lifecycle micro-interactions | MEDIUM | MEDIUM | P2 |
| Context-aware polish presets | MEDIUM | LOW | P2 |
| Screenshot-based visual diff tooling | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Common in polished productivity tools | Typical weakness in utility remotes | Our Approach |
|---------|--------------------------------------|-------------------------------------|--------------|
| Interaction states | Full state systems with strong focus/disabled/loading semantics | Hover-only polish, weak focus/disabled cues | Require full state matrix for all builder/dashboard controls |
| Cross-surface consistency | Shared tokens/components across desktop and mobile variants | Desktop and mobile drift over time | Enforce one token system and parity QA tied to layoutVersion |
| Feedback quality | Deterministic, contextual status surfaces | Generic toasts without actionable reasons | Surface runtime-owned outcome codes and explicit deny/failure reasons |
| Motion quality | Subtle state transitions with reduced-motion support | Decorative transitions that hurt clarity | Keep motion purposeful and disable non-essential motion when requested |

## Sources

- Project context and milestone scope: `.planning/PROJECT.md` (updated 2026-02-27)
- Existing runtime/builder dependency decisions: `.planning/STATE.md` (updated 2026-02-27)
- W3C WCAG 2.2 Understanding SC 1.4.11 Non-text Contrast (updated 2025-09-16): https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- W3C WCAG 2.2 Understanding SC 2.5.8 Target Size (Minimum) (updated 2025-10-01): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- W3C WCAG 2.2 Understanding SC 1.4.13 Content on Hover or Focus (updated 2025-09-17): https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html
- W3C WCAG 2.2 Understanding SC 3.2.4 Consistent Identification (updated 2025-09-16): https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html
- W3C WCAG 2.2 Understanding SC 4.1.3 Status Messages (updated 2025-09-16): https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- W3C WCAG 2.2 Understanding SC 2.3.3 Animation from Interactions (updated 2025-09-16): https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- Microsoft Learn accessibility guidance index for Windows apps (updated 2022-05-13): https://learn.microsoft.com/en-us/windows/apps/design/accessibility/accessibility

---
*Feature research for: UI polish and UX refinement milestone*
*Researched: 2026-02-27*
