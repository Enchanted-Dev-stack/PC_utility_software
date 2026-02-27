# Stack Research

**Domain:** UI polish and UX refinement for existing desktop builder + mobile dashboard
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Style Dictionary | 5.3.2 | Single source of truth for design tokens exported to web CSS variables and React Native token maps | Best fit for cross-surface consistency without changing runtime architecture; officially supports multi-platform token builds and DTCG-forward token modeling. |
| Tailwind CSS | 4.2.1 | Desktop UI utility system driven by tokenized `@theme` variables | Tailwind v4 turns theme variables into utility APIs, which is ideal for fast visual polish while keeping tokens explicit and centralized. |
| NativeWind | 4.2.2 | Mobile utility styling with Tailwind-compatible class semantics | Keeps desktop/mobile styling language aligned; reduces style drift between live preview and mobile dashboard. |
| Motion (React) | 12.34.3 | Desktop interaction/motion system (layout transitions, enter/exit, gestures) | Production-grade animation API for React with strong layout animation support and clean reduced-motion controls. |
| React Native Reanimated | 4.2.2 | Mobile interaction/motion system (gesture-linked and layout animation) | Current RN-native standard for smooth UI-thread animations; required for production-feel touch feedback and transitions on mobile. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-variance-authority | 0.7.1 | Variant API for shared component state styling (`size`, `tone`, `state`) | Use for all reusable UI primitives (button, tile, badge, banner) to stop ad-hoc class combinations. |
| tailwind-merge | 3.5.0 | Deterministic class conflict resolution | Use in shared `cn()` helper so variant composition cannot create contradictory utilities. |
| clsx | 2.1.1 | Conditional class composition | Use with CVA for readable state-driven styling in builder and preview surfaces. |
| @storybook/react-vite | 10.2.13 | Desktop component catalog, state review, and interaction docs | Use for visual consistency review of desktop controls and dashboard widgets in isolation. |
| @storybook/react-native-web-vite | 10.2.13 | Browser-rendered RN stories for parity checks | Use to compare mobile component visuals against desktop preview without full device loop each time. |
| @playwright/test | 1.58.2 | Visual regression and interaction state checks in CI | Use for screenshot baselines of key views/states (hover/focus/active/error/empty) and live preview parity routes. |
| @axe-core/playwright | 4.11.1 | Automated accessibility audits during visual QA pass | Use for desktop UI polish gate to catch contrast/ARIA regressions while refining visuals. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Storybook test runner (`@storybook/test` via Storybook 10) | Run stories as test scenarios | Use tagged stories (`polish`, `critical`) to enforce consistent state coverage. |
| Playwright snapshot assertions (`toHaveScreenshot`) | Golden screenshot comparisons | Configure per-platform baselines and deterministic fonts/theme seed in CI. |
| Token build script (`style-dictionary build`) | Generate consumable tokens for desktop/mobile | Run before UI builds and commit generated artifacts to avoid drift in local-only runs. |

## Integration Impact on Existing Code

- Keep all existing validated behavior untouched: LAN connectivity, deterministic action runtime, CRUD, and live preview sync stay in current runtime modules.
- Add a new `packages/design-tokens` (or `apps/shared/design-tokens`) boundary; do not mix token source JSON into runtime/action directories.
- Replace hard-coded visual constants in desktop/mobile UI layers with generated token references only; runtime domain models remain unchanged.
- Introduce component primitives incrementally: start with connection banners, action history rows, dashboard tiles, and builder form controls where inconsistency is highest.
- Add Storybook/Playwright as non-blocking local tools first, then enforce CI quality gates after stable baselines are captured.

## Installation

```bash
# Core polish stack
npm install style-dictionary@5.3.2 tailwindcss@4.2.1 nativewind@4.2.2 motion@12.34.3 react-native-reanimated@4.2.2

# Component consistency helpers
npm install class-variance-authority@0.7.1 tailwind-merge@3.5.0 clsx@2.1.1

# Visual QA and a11y
npm install -D @storybook/react-vite@10.2.13 @storybook/react-native-web-vite@10.2.13 @playwright/test@1.58.2 @axe-core/playwright@4.11.1
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Style Dictionary 5 | Direct hand-maintained token files per app | Only if desktop/mobile are permanently diverging visual systems (not true for this milestone). |
| Motion + Reanimated | CSS transitions only (desktop) + RN Animated only (mobile) | Use only for minimal micro-interactions; not sufficient for this milestone's production polish target. |
| Storybook 10 + Playwright | Ad-hoc manual QA | Use manual-only temporarily during first setup week, then migrate to automated baselines. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Full component framework swap (e.g., adopting a new heavy UI kit across all surfaces) | Causes broad rewrite risk and slows milestone focused on polish, not platform migration. | Keep current UI structure; add token + variant + QA layers incrementally. |
| Running two animation stacks per surface (e.g., GSAP + Motion on desktop, Moti + Reanimated + Animated on mobile) | Conflicting mental models and inconsistent motion curves increase UX drift. | One motion stack per surface: Motion for desktop, Reanimated for mobile. |
| Per-screen token overrides checked into app code | Reintroduces inconsistency and breaks preview/mobile parity over time. | Single token source with generated outputs consumed by both apps. |
| Visual QA only on local machines | Screenshot tests become flaky/non-actionable due to environment variance. | Run snapshot baselines in pinned CI environment and review diffs in PR. |

## Stack Patterns by Variant

**If milestone scope is strictly visual consistency first:**
- Implement Style Dictionary + Tailwind/NativeWind + CVA before adding richer animations.
- Because token and component-state consistency is the foundation for any polish work.

**If milestone scope includes high-fidelity interactions now:**
- Add Motion/Reanimated in the same phase, but limit to predefined motion tokens (`duration`, `easing`, `distance`).
- Because ungoverned motion quickly creates parity drift between builder preview and phone dashboard.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `tailwindcss@4.2.1` | `nativewind@4.2.2` | Both are aligned around Tailwind-style token/class workflows; verify NativeWind config for your RN build pipeline. |
| `react-native-reanimated@4.2.2` | Expo SDK 55 (via `expo install`) | Expo docs indicate Reanimated support with Expo Go; install through Expo tooling to avoid native version mismatch. |
| `@storybook/react-vite@10.2.13` | Vite `>=5`, React `>=16.8` | Matches Storybook framework requirements for React Vite projects. |
| `@storybook/react-native-web-vite@10.2.13` | RN `>=0.72`, RN Web `>=0.19`, Vite `>=5` | Enables RN-web stories and docs/testing workflows in browser. |
| `@playwright/test@1.58.2` | Storybook static build or running app routes | Use fixed OS/browser in CI for deterministic visual baselines. |

## Sources

- https://styledictionary.com/getting-started/installation/ - official SD build model, multi-platform token export, CLI/npm usage (official, HIGH)
- https://tailwindcss.com/docs/theme - Tailwind v4 `@theme` variable model and utility generation (official, HIGH)
- https://www.nativewind.dev - NativeWind positioning and Tailwind-style RN workflow (official, MEDIUM)
- https://motion.dev/docs/react-quick-start - Motion React capabilities and install guidance (official, HIGH)
- https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/ - Reanimated 4 requirements/install and architecture notes (official, HIGH)
- https://docs.expo.dev/versions/latest/sdk/reanimated/ - Expo integration path for Reanimated in SDK 55 context (official, HIGH)
- https://storybook.js.org/docs/get-started/frameworks/react-vite - Storybook React Vite framework requirements/install (official, HIGH)
- https://storybook.js.org/docs/get-started/frameworks/react-native-web-vite - Storybook RN Web Vite requirements/install and RN-vs-web guidance (official, HIGH)
- https://playwright.dev/docs/test-snapshots - official visual comparison workflow and caveats (official, HIGH)
- npm registry (`npm view`) for versions/metadata: `style-dictionary`, `tailwindcss`, `nativewind`, `motion`, `react-native-reanimated`, `@storybook/*`, `@playwright/test`, `@axe-core/playwright`, `class-variance-authority`, `tailwind-merge`, `clsx` (registry metadata, MEDIUM)

## Gaps / Validation Needed

- LOW confidence on exact current UI renderer setup in-repo (present codebase is mostly domain/runtime models); confirm desktop/mobile render entrypoints before locking Storybook file structure.
- Validate CI image/font stack before approving screenshot baselines; Playwright docs warn environment drift affects snapshots.

---
*Stack research for: UI polish and UX refinement milestone*
*Researched: 2026-02-27*
