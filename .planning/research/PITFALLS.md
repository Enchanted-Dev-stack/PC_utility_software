# Pitfalls Research

**Domain:** UI polish and UX refinement for an existing desktop/mobile remote-control product
**Researched:** 2026-02-27
**Confidence:** MEDIUM

## Critical Pitfalls

### Pitfall 1: Polishing visuals before locking interaction/state contracts

**What goes wrong:**
UI refactors (spacing, hierarchy, component variants) accidentally change behavior: wrong disabled states, stale selection, or preview/editor desync.

**Why it happens:**
Teams treat polish as "CSS-only" work and skip a behavior baseline for existing flows.

**How to avoid:**
Freeze interaction contracts first: document current state machine and event outcomes for builder, preview, pairing banner, and action dispatch feedback. Add high-signal regression tests (golden behavior tests + smoke E2E) before visual refactors.

**Warning signs:**
- "Looks better" PRs also change runtime handler wiring.
- QA finds regressions in pairing/action flows after typography/layout-only tickets.
- Disabled/enabled states differ between desktop builder and mobile preview for same runtime snapshot.

**Phase to address:**
Phase 1 - Baseline behavior lock + design token adoption kickoff.

---

### Pitfall 2: Motion that is decorative but not accessible

**What goes wrong:**
Added transitions/parallax/scale effects cause dizziness, distraction, or unusable flows for users with reduced-motion preferences.

**Why it happens:**
Motion specs are authored without an explicit reduced-motion policy and no OS preference hook.

**How to avoid:**
Define a motion contract with two modes: `full` and `reduced`. Gate non-essential motion behind reduced-motion detection (`prefers-reduced-motion` on web-equivalent surfaces, OS accessibility setting on native shells), and keep essential feedback via opacity/color/state change.

**Warning signs:**
- No test case for reduced motion in CI/manual QA.
- Entry animations run on every view revisit regardless of user preference.
- Motion is used as the only state cue (no static equivalent).

**Phase to address:**
Phase 2 - Motion system implementation and accessibility guardrails.

---

### Pitfall 3: Non-composited animations and main-thread jank

**What goes wrong:**
Hover/press/reorder animations stutter, input feels delayed, and polish makes the app feel slower than v1.0.

**Why it happens:**
Animations are implemented on layout/paint-heavy properties (top/left/width/height/shadows everywhere), with no responsiveness budget.

**How to avoid:**
Adopt animation performance rules: animate transform/opacity first, cap concurrent animated elements, and profile interaction-heavy screens. Track interaction latency (INP-style target <= 200 ms for web-equivalent surfaces) and frame stability during drag/reorder flows before merge.

**Warning signs:**
- Lighthouse/DevTools flags non-composited animations.
- Input feedback visibly lags during hover storms or drag reorder.
- CPU spikes on desktop while mobile preview falls below smooth frame rate.

**Phase to address:**
Phase 3 - Performance hardening for interactions and animations.

---

### Pitfall 4: Focus/contrast regressions introduced by restyling

**What goes wrong:**
Custom components look polished but keyboard focus becomes hard to see, low-contrast states blend into background, and accessibility regresses.

**Why it happens:**
Default browser/OS indicators are removed (`outline: none` style patterns, subtle borders) without replacing them with compliant indicators.

**How to avoid:**
Create explicit state tokens for focus/hover/active/disabled with contrast requirements (non-text contrast >= 3:1 for required UI indicators). Validate keyboard path and focus visibility for all actionable controls on desktop builder and mobile surface equivalents.

**Warning signs:**
- Focus ring only visible on some controls.
- Hover state is visible but keyboard focus is not.
- Designers approve static mocks but no keyboard walkthrough is run.

**Phase to address:**
Phase 2 - Interaction states system (before broad UI rollout).

---

### Pitfall 5: Inconsistent component semantics across desktop builder and mobile dashboard

**What goes wrong:**
Same action tile/state is presented with different labels, icon meaning, or status affordances across surfaces; users lose trust in preview fidelity.

**Why it happens:**
Desktop and mobile surfaces evolve separately, with local naming and style overrides instead of shared semantic tokens and component contracts.

**How to avoid:**
Define a cross-surface component contract for each shared primitive (tile, section header, status badge, action feedback). Enforce consistent naming/identification and shared token sources; only allow platform-specific divergence when documented.

**Warning signs:**
- "Same" tile has different status wording or icon meaning on desktop vs mobile.
- Preview parity bugs are treated as cosmetic, not correctness bugs.
- Components are duplicated per surface rather than derived from shared specs.

**Phase to address:**
Phase 1 - Shared design language and cross-surface contract definition.

---

### Pitfall 6: Layout shift and unstable feedback during async updates

**What goes wrong:**
Toasts, loading placeholders, or dynamic content insertion shift controls mid-interaction, causing mis-taps/mis-clicks and perceived instability.

**Why it happens:**
Polish adds dynamic UI elements without reserved space, stable sizing, or lifecycle rules for async status UI.

**How to avoid:**
Reserve layout regions for dynamic feedback (toast rail, status rows, skeleton dimensions), prefer transform/opacity transitions, and set visual stability checks (CLS-style threshold <= 0.1 for web-equivalent surfaces). Treat unexpected shift as release-blocking.

**Warning signs:**
- Buttons move after load/refresh.
- Users report tapping one action and triggering another.
- Preview surface jumps when runtime status updates arrive.

**Phase to address:**
Phase 3 - Visual stability and async rendering hardening.

---

### Pitfall 7: No visual regression net for polish work

**What goes wrong:**
Subtle spacing/typography/state regressions ship repeatedly because behavior tests pass but UI fidelity drifts.

**Why it happens:**
Milestone is test-light on snapshots and cross-device baselines; teams rely on ad hoc manual review.

**How to avoid:**
Adopt deterministic visual regression tests for key routes/states (desktop builder + mobile dashboard + live preview parity screens). Lock screenshot environment in CI, maintain baseline snapshots intentionally, and gate merges on approved diffs.

**Warning signs:**
- Frequent "tiny" UI bugfixes after each release.
- Screenshots differ by environment unexpectedly.
- Teams cannot answer whether hover/focus/disabled visuals changed between builds.

**Phase to address:**
Phase 4 - QA and release readiness gate for polish.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Surface-specific one-off CSS overrides | Fast visual wins | Cross-surface drift and unmaintainable style cascade | Prototype spikes only; never for milestone completion |
| Adding animation directly in feature components | Quick demos | Inconsistent motion language and hard-to-disable effects | Only for temporary experiments behind flags |
| Removing default focus styles without replacement | Cleaner screenshots | Keyboard accessibility failure and usability regressions | Never |
| Skipping reduced-motion mode | Less implementation effort | Accessibility debt and user discomfort | Never |
| No visual baseline tests in CI | Faster PR cycle | High post-release polish churn | Never for a polish milestone |

## Integration Gotchas

Common mistakes when connecting existing systems during polish.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Desktop builder state -> live preview | Recomputing view state independently in each surface | Drive both from shared runtime snapshot/version and map to surface-specific presentation only |
| Design tokens -> code | Ad hoc token naming by team/surface | Single token namespace with semantic tiers (global, component, state) and documented aliasing |
| Animation library -> app state | Triggering animation from scattered business events | Centralize motion triggers in UI state layer with clear enter/exit/update semantics |
| Visual testing -> CI | Running screenshots on inconsistent hosts | Pin browser/OS/project settings and generate baselines in controlled environment |

## Performance Traps

Patterns that work in demos but fail under real usage.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Animating layout-affecting properties | Stutter during hover/reorder | Prefer compositor-friendly properties; profile traces in PR | Immediately on low/mid-tier devices |
| Excessive simultaneous micro-animations | "Busy" UI and delayed input feedback | Motion budget per screen; cap concurrent animations | At moderate component density |
| Async UI inserted without reserved space | Controls jump mid-interaction | Reserve space/skeleton sizes and stabilize feedback regions | As soon as live updates or toasts are frequent |

## Security Mistakes

Security-adjacent mistakes specific to polish rollout.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting polished status UI over runtime truth | Users think action executed when it failed | Keep success/error states sourced from runtime outcome codes, not optimistic visual assumptions |
| Hiding important risk cues in subtle styling | Users miss trust/pairing warnings | Preserve high-contrast trust/security indicators as non-optional states in design system |

## UX Pitfalls

Common UX mistakes in UI polish milestones.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Prioritizing motion spectacle over clarity | Slower task completion and confusion | Use motion to clarify cause/effect, not decorate every interaction |
| Inconsistent action labels/icons across surfaces | Users distrust preview and mis-trigger actions | Enforce consistent identification for same functionality |
| Hover-focused designs without keyboard parity | Non-mouse users lose operability confidence | Design and test state parity: hover, focus, active, disabled |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **State fidelity:** Polished components still map 1:1 to existing runtime states - verify with state matrix (desktop + mobile + preview).
- [ ] **Motion accessibility:** Reduced-motion mode suppresses non-essential animations - verify at OS preference level.
- [ ] **Performance:** Interaction latency and animation smoothness stay within targets under typical load - verify with profiled traces.
- [ ] **Focus/contrast:** Keyboard focus and key state indicators remain visible - verify against WCAG-based checks.
- [ ] **Visual regression:** Snapshot diffs are reviewed and intentional - verify in CI before release.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Behavior regressions after visual refactor | HIGH | Revert to behavior-safe branch, re-apply polish behind state-contract tests, release in smaller slices |
| Motion causes accessibility complaints | MEDIUM | Hotfix reduced-motion defaults, disable offending transitions via central motion flags, add accessibility regression tests |
| Widespread visual drift across surfaces | MEDIUM | Introduce token mapping freeze, run parity audit screen-by-screen, remove one-off overrides and backfill component contracts |
| UI jank introduced by animations | MEDIUM | Profile traces, replace layout/paint-heavy transitions, set per-screen motion budget and block non-composited animations |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Polishing before interaction contracts | Phase 1 - Behavior baseline + shared design contract | Existing behavior smoke/E2E suite passes before and after refactor |
| Decorative motion without accessibility | Phase 2 - Motion system + reduced-motion compliance | Reduced-motion test pass on all target surfaces |
| Non-composited animation jank | Phase 3 - Performance hardening | Performance audit has no critical non-composited animation findings |
| Focus/contrast regressions | Phase 2 - State styling and accessibility checks | Keyboard walkthrough and contrast checks pass for all actionable controls |
| Cross-surface semantic drift | Phase 1 - Cross-surface component semantics | Desktop/mobile/live-preview parity checklist passes |
| Layout shifts from async polish | Phase 3 - Visual stability hardening | CLS-style visual stability and mis-click tests pass in CI |
| Missing visual regression net | Phase 4 - QA/release gate | Snapshot baselines exist and diffs require explicit approval |

## Sources

- W3C WCAG 2.2 Understanding SC 2.3.3 (Animation from Interactions), updated 2025-09-16: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html (HIGH)
- MDN `prefers-reduced-motion`, last modified 2026-01-08: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion (HIGH)
- W3C WCAG 2.2 Understanding SC 2.4.7 (Focus Visible), updated 2025-09-17: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html (HIGH)
- W3C WCAG 2.2 Understanding SC 1.4.11 (Non-text Contrast): https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html (HIGH)
- W3C WCAG 2.2 Understanding SC 3.2.4 (Consistent Identification), updated 2025-09-16: https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification (HIGH)
- web.dev Optimize INP, last updated 2025-09-02: https://web.dev/articles/optimize-inp (MEDIUM)
- web.dev CLS overview, last updated 2023-04-12: https://web.dev/articles/cls (MEDIUM)
- Chrome for Developers Lighthouse: Avoid non-composited animations, last updated 2024-12-08: https://developer.chrome.com/docs/lighthouse/performance/non-composited-animations (MEDIUM)
- Playwright visual comparisons docs (snapshot-based UI regression): https://playwright.dev/docs/test-snapshots (MEDIUM)
- Design Tokens Community Group Format Module 2025.10 (preview draft, not standard): https://www.designtokens.org/TR/2025.10/format/ (LOW)

---
*Pitfalls research for: UI polish and UX refinement milestone (existing product surfaces)*
*Researched: 2026-02-27*
