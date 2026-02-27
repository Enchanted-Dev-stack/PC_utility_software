# Project Research Summary

**Project:** PC Remote Control Studio
**Domain:** UI polish and UX refinement for desktop builder + live preview + mobile dashboard
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH

## Executive Summary

This milestone is not a platform rewrite; it is a quality pass on an existing local-first remote-control product that already has deterministic runtime behavior, dashboard CRUD, and live preview architecture. The research is consistent across all tracks: high-quality teams in this situation preserve runtime contracts and focus polish work in UI layers only. The product should feel like one system across desktop and mobile, which requires a shared token language, complete interaction-state coverage, and parity checks between builder preview and mobile rendering.

The recommended approach is token-first and contract-first. Introduce a dedicated `design-tokens` module (Style Dictionary), feed desktop via Tailwind v4 and mobile via NativeWind-compatible outputs, and standardize component state semantics through a shared primitive/variant layer (CVA + `clsx` + `tailwind-merge`). Roll out state matrix coverage before adding richer motion, then harden with Storybook scenarios and Playwright + axe quality gates. This gives visual consistency without risking behavior regressions in connectivity, trust, action execution, or layout versioning.

The main risk is “polish drift”: teams accidentally changing runtime behavior while restyling, or shipping desktop-only visual improvements that break preview/mobile fidelity and accessibility. Mitigation is clear: freeze interaction contracts first, derive visual semantics from runtime snapshots (never the reverse), enforce reduced-motion and focus/contrast guardrails, and gate merges with deterministic visual regression checks in pinned CI environments.

## Key Findings

### Recommended Stack

The stack is purpose-built for cross-surface consistency without changing runtime architecture: build-time tokens, utility-driven styling on both surfaces, one animation stack per surface, and visual QA automation.

**Core technologies:**
- **Style Dictionary 5.3.2:** Token pipeline and multi-platform output — single source of truth for desktop/mobile visual semantics.
- **Tailwind CSS 4.2.1:** Desktop token consumption via `@theme` variables — fast, explicit utility system for polish work.
- **NativeWind 4.2.2:** Mobile styling with Tailwind-compatible semantics — keeps mobile aligned with desktop naming and states.
- **Motion 12.34.3 + Reanimated 4.2.2:** Purposeful interaction and transition layer — smooth but controllable motion with reduced-motion paths.
- **CVA 0.7.1 + clsx 2.1.1 + tailwind-merge 3.5.0:** Variant contract layer — prevents ad hoc class/state drift.
- **Storybook 10.2.13 + Playwright 1.58.2 + axe-core 4.11.1:** Visual and accessibility quality gate — catches parity and UI regressions before release.

Critical version constraints: Tailwind v4 + NativeWind v4 alignment, Reanimated installed via Expo SDK 55 tooling, and Storybook React/RN-web frameworks on Vite >= 5.

### Expected Features

Feature research points to a polish-first MVP centered on consistency, trust, and accessibility rather than net-new workflow complexity.

**Must have (table stakes):**
- Shared design tokens across desktop builder and mobile dashboard.
- Full interaction-state matrix (`default`, `hover`, `focus`, `active`, `disabled`, `loading`) mapped to runtime truth.
- Preview-to-mobile parity checks tied to `layoutVersion` and shared snapshot semantics.
- Deterministic feedback surfaces for save/reorder/pairing/action outcomes.
- Accessibility baseline: visible focus, contrast compliance, touch target minimums, status semantics, reduced-motion policy.

**Should have (competitive):**
- Builder interaction-fidelity scorecard (contrast/focus/target/state/parity checks).
- Runtime-lifecycle micro-interactions (`queued -> running -> terminal`) with no optimistic fake success.
- Context-aware polish presets (Work/Media/Gaming) and robust empty/error state kit.

**Defer (v2+):**
- Screenshot overlay visual diff tooling across devices.
- Adaptive personalization of density/motion from usage telemetry.

### Architecture Approach

Architecture guidance is explicit: keep `DesktopConnectivityRuntime` and snapshot contracts stable, and add polish semantics only in UI projection/model layers. New work is concentrated in `packages/design-tokens`, `apps/*/ui/primitives`, and `tests/ui/visual`, while `DashboardBuilderModel`, `DashboardLivePreviewModel`, and `MobileDashboardModel` are extended with derived style metadata only.

**Major components:**
1. **Runtime core (existing, unchanged behavior):** authoritative source for connectivity/trust/action/layout snapshots.
2. **UI model + handler layer (modified):** derives visual semantics from runtime snapshots while preserving runtime-owned mutations.
3. **Design token module (new):** generates desktop/mobile token artifacts from one semantic namespace.
4. **UI primitives/variants layer (new):** shared state contracts consumed by builder, preview, and mobile dashboard.
5. **Visual QA harness (new):** Storybook state matrix + Playwright/axe parity and accessibility gating.

### Critical Pitfalls

1. **Polishing before behavior contracts are frozen** — lock and test current interaction/state contracts before visual refactors.
2. **Decorative motion without accessibility fallback** — enforce `full` vs `reduced` motion modes and never use motion as the only state cue.
3. **Non-composited animation jank** — prefer transform/opacity, cap concurrent effects, and profile interaction-heavy screens.
4. **Focus/contrast regressions from restyling** — ship explicit focus/state tokens and verify keyboard/touch accessibility in QA gates.
5. **Desktop/mobile semantic drift** — enforce shared naming/token contracts and treat preview parity issues as correctness bugs.

## Implications for Roadmap

Based on the combined research, use a 5-phase roadmap that mirrors architecture dependencies and pitfall prevention.

### Phase 1: Behavior Lock + Token Foundation
**Rationale:** Prevent regressions first, then establish shared design language.
**Delivers:** Interaction contract baseline tests, `design-tokens` module, semantic token taxonomy, initial desktop/mobile token outputs.
**Addresses:** Shared token system, cross-surface consistency prerequisites.
**Avoids:** Pitfall 1 (behavior drift) and Pitfall 5 (semantic divergence).

### Phase 2: State Matrix + Primitive Rollout
**Rationale:** State clarity must precede animation and broad restyling.
**Delivers:** Desktop/mobile primitive wrappers, full interaction-state coverage for high-impact surfaces (connection banner, history rows, builder controls), accessibility state tokens.
**Uses:** Tailwind/NativeWind + CVA stack from STACK.md.
**Implements:** `ui-primitives` boundary and runtime-immutable view semantics.
**Avoids:** Pitfall 4 (focus/contrast regressions).

### Phase 3: Preview-Mobile Parity + Deterministic Feedback Polish
**Rationale:** Core value is trustworthy preview fidelity and runtime-aligned UI feedback.
**Delivers:** Matching style semantics in `DashboardLivePreviewModel` and `MobileDashboardModel`, parity assertions tied to `layoutVersion`, deterministic status/outcome mapping.
**Addresses:** P1 parity and feedback features.
**Avoids:** Pitfall 5 (parity drift) and optimistic UI anti-feature risk.

### Phase 4: Motion + Performance Hardening
**Rationale:** Add animation only after state/parity contracts are stable.
**Delivers:** Motion token application for key transitions, reduced-motion compliance, interaction performance budgets, layout-shift stability checks for async surfaces.
**Uses:** Motion + Reanimated with constrained motion policy.
**Avoids:** Pitfall 2 (motion accessibility), Pitfall 3 (jank), Pitfall 6 (layout shift instability).

### Phase 5: Visual QA Gate + v1.x Enhancements
**Rationale:** Lock quality before scale and layer in selective differentiators.
**Delivers:** Storybook state catalog, Playwright screenshot baselines, axe audits in CI; optional scorecard/micro-interactions/presets once baseline is green.
**Implements:** visual-regression harness and release gates.
**Avoids:** Pitfall 7 (no regression net).

### Phase Ordering Rationale

- Dependencies are strict: tokens -> state matrix -> parity feedback -> motion -> QA hardening.
- Architecture is protected by keeping runtime immutable and confining polish to projection/primitives/tests.
- Pitfalls are neutralized in phase order instead of patched later (especially behavior drift, parity drift, and accessibility regressions).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** Preview/mobile parity assertions and screenshot strategy need concrete tooling decisions per renderer setup.
- **Phase 4:** Motion performance budgets and reduced-motion behavior need platform-specific validation details.
- **Phase 5:** Deterministic visual baseline strategy (fonts/OS/browser pinning) may need CI environment research.

Phases with standard patterns (can likely skip extra research-phase):
- **Phase 1:** Token pipeline setup and semantic namespace design are well documented and low novelty.
- **Phase 2:** Interaction-state primitive rollout follows mature component-system patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Strong official docs and concrete versioning, with minor uncertainty around exact in-repo renderer entrypoints. |
| Features | MEDIUM | Priorities are clear and internally consistent; differentiator sizing still needs product tradeoff validation. |
| Architecture | MEDIUM-HIGH | Grounded in existing project boundaries and explicit dependency order; integration details are actionable. |
| Pitfalls | MEDIUM-HIGH | Risks are well documented by WCAG/MDN/web performance guidance and map cleanly to phase controls. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Renderer integration specifics:** Confirm exact desktop/mobile render entrypoints and Storybook wiring before locking task breakdown.
- **Visual baseline determinism:** Validate CI font/OS/browser pinning strategy before adopting screenshot gates as merge blockers.
- **Parity acceptance metrics:** Define concrete pass/fail thresholds for preview-vs-mobile parity (pixel tolerance, state coverage, route set).
- **Motion budget thresholds:** Set measurable limits (latency/frame stability/concurrent animations) per critical interaction flow.

## Sources

### Primary (HIGH confidence)
- `C:/Users/user/pc-remote-control-app/.planning/research/STACK.md` — recommended stack, versions, integration constraints.
- `C:/Users/user/pc-remote-control-app/.planning/research/FEATURES.md` — table stakes, differentiators, anti-features, prioritization.
- `C:/Users/user/pc-remote-control-app/.planning/research/ARCHITECTURE.md` — component boundaries, build order, anti-patterns.
- `C:/Users/user/pc-remote-control-app/.planning/research/PITFALLS.md` — phase-mapped risks and prevention strategies.
- https://tailwindcss.com/docs/theme — token-driven theme variables.
- https://styledictionary.com/getting-started/installation/ — multi-platform token generation.
- https://storybook.js.org/docs/get-started/frameworks/react-vite — Storybook framework patterns.
- https://playwright.dev/docs/test-snapshots — visual baseline testing patterns.
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html — contrast requirements.
- https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html — focus visibility requirements.

### Secondary (MEDIUM confidence)
- https://www.nativewind.dev — Tailwind-style RN workflow for cross-surface parity.
- https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/ — native animation constraints and setup.
- https://web.dev/articles/optimize-inp — interaction latency guidance.
- https://developer.chrome.com/docs/lighthouse/performance/non-composited-animations — animation performance pitfalls.

### Tertiary (LOW confidence)
- https://www.designtokens.org/TR/2025.10/format/ — DTCG draft direction (helpful, but still draft-level authority).

---
*Research completed: 2026-02-27*
*Ready for roadmap: yes*
