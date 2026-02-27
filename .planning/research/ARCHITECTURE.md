# Architecture Research

**Domain:** UI polish integration for existing desktop builder + live preview + mobile dashboard runtime
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH

## Standard Architecture

### System Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                             Existing Runtime Core                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ DesktopConnectivityRuntime                                                   │
│  ├─ Connectivity + trust + session auth                                     │
│  ├─ Deterministic action execution + history                                │
│  └─ Dashboard layout CRUD + snapshot subscriptions                          │
└──────────────────────────────────────────────────────────────────────────────┘
                                  │ (unchanged contracts/snapshots)
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         UI Model and Handler Layer                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ DesktopControlPanelModel                                                     │
│  ├─ DashboardBuilderModel (mutations via runtime)                           │
│  ├─ DashboardLivePreviewModel (read/subscribe only)                         │
│  ├─ ActionHistoryPanel model                                                 │
│  └─ Connection/TrustedDevices models                                         │
│ MobileDashboardModel (read model from layout snapshot)                       │
└──────────────────────────────────────────────────────────────────────────────┘
                                  │ (new visual semantics only)
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      New UI Polish Architecture Additions                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Design Tokens (single source)                                                │
│  ├─ color/spacing/type/radius/elevation/motion tokens                       │
│  ├─ desktop export (CSS variables/Tailwind theme)                           │
│  └─ mobile export (token map for NativeWind/RN)                             │
│ Component Variant Layer                                                      │
│  ├─ shared variant contracts: tone/state/size                                │
│  └─ desktop + mobile primitive wrappers consume same token names             │
│ Visual QA Layer                                                              │
│  ├─ Storybook states (hover/focus/active/error/empty/loading)               │
│  └─ Playwright screenshot + accessibility parity checks                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (integration-focused)

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `DesktopConnectivityRuntime` (modified: no behavior changes) | Remains source of truth for layout and status snapshots consumed by polished UI | Keep existing APIs (`getDashboardLayout`, `subscribeDashboardLayout`, status/history accessors); no visual tokens or style state added here |
| `DashboardBuilderModel` (modified) | Expose UI-friendly state metadata needed for polish (interaction states, disabled/loading labels) while routing all mutations to runtime | Extend returned model shape only; keep mutation path runtime-owned |
| `DashboardLivePreviewModel` (modified) | Render-ready preview mapping with deterministic order and polish metadata (tile emphasis/tone/motion hints) | Derive all fields from snapshot + token aliases; never own mutable layout state |
| `MobileDashboardModel` (modified) | Mobile parity surface for typography/spacing/motion token application using same semantic state names as desktop preview | Add style semantics fields (not transport fields); preserve `layoutVersion` semantics |
| `design-tokens` module (new) | Single design language for desktop and mobile visual consistency | Style Dictionary token source + generated desktop/mobile outputs |
| `ui-primitives` layer (new) | Reusable component states (`default`, `hover`, `focus`, `active`, `disabled`, `error`) shared by builder, preview, and mobile dashboard | CVA + token aliases + per-surface adapters |
| `visual-regression` test harness (new) | Prevent polish regressions and desktop/mobile preview drift | Storybook scenario matrix + Playwright screenshot/a11y checks |

## Recommended Project Structure

```text
apps/
├── desktop/
│   └── src/
│       ├── ui/
│       │   ├── control-panel/          # Existing runtime-composed panel model (modify)
│       │   ├── dashboard/              # Builder + preview models (modify)
│       │   └── primitives/             # New desktop primitive wrappers (add)
│       └── styles/
│           └── tokens.css              # Generated token variables (add)
├── mobile/
│   └── src/
│       ├── ui/dashboard/               # Existing dashboard model (modify)
│       └── ui/primitives/              # New mobile primitive wrappers (add)
packages/
└── design-tokens/                      # New token source/build output (add)
    ├── src/tokens/                     # Core + semantic token definitions
    ├── dist/desktop/                   # Generated CSS variables/Tailwind theme bridge
    └── dist/mobile/                    # Generated token map for RN/NativeWind
tests/
├── ui/visual/                          # New screenshot + interaction state tests
└── dashboard/                          # Existing runtime integration tests (keep)
```

### Structure Rationale

- **`packages/design-tokens/`** is new and isolated so visual changes cannot accidentally alter runtime/action behavior.
- **`apps/*/ui/primitives/`** gives explicit boundary between semantic component states and domain/runtime handlers.
- **`tests/ui/visual/`** adds a quality gate for polish while existing runtime integration tests continue validating behavior parity.

## Architectural Patterns

### Pattern 1: Runtime-Immutable, View-Semantic Models

**What:** Keep runtime snapshots authoritative, and add polish semantics in UI models as derived fields.
**When to use:** Any UI polish that needs extra display metadata but must not touch transport/business logic.
**Trade-offs:** Slightly larger UI model shape; strongest protection against behavior regressions.

**Example:**
```typescript
type PolishedTileView = {
  id: string;
  label: string;
  order: number;
  tone: "default" | "selected" | "disabled";
  emphasis: "normal" | "high";
};

function toPolishedTileView(snapshotTile: DashboardLayoutSnapshot["tiles"][number]): PolishedTileView {
  return {
    id: snapshotTile.id,
    label: snapshotTile.label,
    order: snapshotTile.order,
    tone: "default",
    emphasis: "normal"
  };
}
```

### Pattern 2: Token-First Visual Contracts

**What:** Components consume semantic tokens (`surface.card`, `text.muted`, `motion.fast`) rather than hard-coded per-screen values.
**When to use:** All builder, preview, and mobile dashboard surfaces in this milestone.
**Trade-offs:** Initial setup cost; large long-term reduction in cross-surface drift.

### Pattern 3: State Matrix QA Before Motion Expansion

**What:** Lock visual state matrix first (default/hover/focus/active/error/empty/loading), then add transitions/animations.
**When to use:** UI polish milestones where behavior is already shipped and regressions are costly.
**Trade-offs:** Slower early animation work; faster stabilization and easier bug isolation.

## Data Flow

### Request Flow (after polish integration)

```text
[User interaction on desktop/mobile]
    ↓
[UI primitive state + token styling]
    ↓
[UI Model Handlers] -> [DesktopConnectivityRuntime mutations/queries] -> [DashboardLayoutService]
    ↓                         ↓
[Builder/Preview/Mobile model projection with polish semantics] <- [runtime snapshot/event]
```

### State Management

```text
[Runtime snapshots/events] -----------------> [Desktop and Mobile UI models]
           ^                                              |
           |                                              v
      [Runtime mutations] <--- [Builder handlers]   [Token-based rendering only]
```

### Key Data Flows for This Milestone

1. **Builder interaction state flow:** builder handler triggers runtime mutation, UI model recomputes selected/dirty/error states, primitive components render tokenized states.
2. **Preview parity flow:** runtime snapshot drives both desktop preview and mobile model; both resolve style semantics from the same token names.
3. **Feedback polish flow:** existing status/toast/history models gain visual state mapping without altering runtime status/event payloads.

## Integration Points (explicit new vs modified)

### Internal Boundaries

| Boundary | New vs Modified | Communication | Notes |
|----------|-----------------|---------------|-------|
| `DesktopControlPanelModel` ↔ `DashboardBuilderModel` | Modified | Direct model composition | Add style-semantic fields and state labels; keep existing async handler routing.
| `DashboardBuilderModel` ↔ `DesktopConnectivityRuntime` | Modified | Existing runtime APIs | No new runtime mutation endpoints needed for polish.
| `DashboardLivePreviewModel` ↔ `DesktopConnectivityRuntime.subscribeDashboardLayout` | Modified | Existing subscription stream | Preserve current realtime behavior; add projection-only visual metadata.
| `MobileDashboardModel` ↔ dashboard snapshot contract | Modified | Existing shared contract | Keep `layoutVersion`/order semantics identical to desktop preview.
| `design-tokens` ↔ desktop/mobile UI layers | New | Generated artifacts import | New cross-surface integration; must be one-way (tokens -> UI), not runtime-aware.
| `ui-primitives` ↔ feature models | New | Props/state contract | Primitive components accept semantic props, never runtime services directly.
| `visual regression tests` ↔ Storybook/views | New | Screenshot/assertion pipeline | Gate visual drift and accessibility regressions in CI.

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Storybook | Isolated state rendering for desktop/mobile components | Use as baseline catalog before screenshot automation.
| Playwright + axe-core | Snapshot + accessibility verification on key states | Run after runtime integration tests; visual tests should not replace behavioral tests.
| Style Dictionary | Build-time token generation | Generated outputs are consumed by UI only; runtime remains unaware.

## Build Order (dependency-aware for milestone plans)

1. **Polish Foundation: token pipeline and semantic naming (new components only)**
   - Build `packages/design-tokens` with color/type/spacing/radius/elevation/motion primitives and semantic aliases.
   - Output desktop and mobile token artifacts.
   - Dependency: none; this is prerequisite for all visual consistency work.

2. **Desktop primitive and state matrix rollout (new + modified)**
   - Add `apps/desktop/src/ui/primitives/*` and refactor high-impact surfaces first: connection banner, action history rows, dashboard builder controls.
   - Extend UI models with state semantics (`tone`, `transition`, `disabled`) as derived values.
   - Dependency: Phase 1 tokens.

3. **Preview/mobile parity projection updates (modified)**
   - Update `DashboardLivePreviewModel` and `MobileDashboardModel` to expose matching style semantics while preserving shared runtime ordering/version.
   - Add parity checks asserting desktop preview and mobile model consume same token aliases for equivalent states.
   - Dependency: Phase 2 component state contracts.

4. **Interaction polish and motion layer (modified)**
   - Apply motion tokens/transitions to builder interactions, status transitions, and tile feedback.
   - Respect reduced-motion path and keep all motion declarative at UI layer.
   - Dependency: stable state matrix and parity semantics from Phases 2-3.

5. **Quality gates and regression hardening (new test infrastructure)**
   - Add Storybook scenarios and Playwright screenshot/a11y tests for critical desktop/mobile states.
   - Gate merges on: visual parity, focus visibility, contrast/accessibility checks, and no change to runtime integration tests.
   - Dependency: all previous phases.

## Anti-Patterns

### Anti-Pattern 1: Runtime Pollution with Visual Concerns

**What people do:** Add styling/motion flags to `DesktopConnectivityRuntime` and shared dashboard contracts.
**Why it's wrong:** Couples product presentation to transport/domain behavior and risks regressions in trusted connectivity/action flows.
**Do this instead:** Keep runtime contracts stable; derive visual semantics in UI model projection layer.

### Anti-Pattern 2: Desktop-Only Polish Tokens

**What people do:** Hard-code desktop style values and attempt to "match mobile later."
**Why it's wrong:** Reintroduces builder-preview-mobile drift, the exact issue this milestone aims to remove.
**Do this instead:** Use a single token source and generate platform-specific outputs before component refactors.

### Anti-Pattern 3: Motion Before State Clarity

**What people do:** Ship animations without locking hover/focus/active/error/empty semantics first.
**Why it's wrong:** Creates flashy but inconsistent UX and makes regression debugging hard.
**Do this instead:** Define and test state matrix first, then layer motion tokens.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Keep monorepo runtime + token pipeline; prioritize fast UI iteration and deterministic behavior regression checks. |
| 1k-100k users | Add stricter visual test sharding and baseline management per surface to control CI runtime. |
| 100k+ users | Introduce design system governance (token versioning policy, deprecation workflow) before large contributor growth. |

### Scaling Priorities

1. **First bottleneck:** style drift between desktop preview and mobile dashboard; solve with shared semantic tokens + parity tests.
2. **Second bottleneck:** regressions from broad UI refactors; solve with state-matrix screenshots and behavior-test co-gating.

## Sources

- `C:/Users/user/pc-remote-control-app/.planning/PROJECT.md` - milestone goal and constraints (HIGH)
- `C:/Users/user/pc-remote-control-app/.planning/STATE.md` - locked architecture decisions from phases 1-3 (HIGH)
- `C:/Users/user/pc-remote-control-app/.planning/ROADMAP.md` - completed runtime foundation and dependency order (HIGH)
- `C:/Users/user/pc-remote-control-app/apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime.ts` - runtime boundaries and dashboard/state APIs (HIGH)
- `C:/Users/user/pc-remote-control-app/apps/desktop/src/ui/control-panel/DesktopControlPanelModel.ts` - current UI composition boundary (HIGH)
- `C:/Users/user/pc-remote-control-app/apps/desktop/src/ui/dashboard/DashboardBuilderModel.ts` - mutation routing and dirty-state semantics (HIGH)
- `C:/Users/user/pc-remote-control-app/apps/desktop/src/ui/dashboard/DashboardLivePreviewModel.ts` - preview projection and runtime subscription usage (HIGH)
- `C:/Users/user/pc-remote-control-app/apps/mobile/src/ui/dashboard/MobileDashboardModel.ts` - mobile dashboard projection baseline (HIGH)
- `C:/Users/user/pc-remote-control-app/tests/dashboard/dashboard-builder-live-preview-integration.spec.ts` - current parity and synchronization guarantees to preserve (HIGH)
- https://styledictionary.com/getting-started/installation/ - multi-platform token generation workflow (official, HIGH)
- https://tailwindcss.com/docs/theme - token-driven theme variable architecture (official, HIGH)
- https://playwright.dev/docs/test-snapshots - screenshot baseline workflow and environment caveats (official, HIGH)
- https://storybook.js.org/docs/get-started/frameworks/react-vite - component state catalog architecture for React surfaces (official, HIGH)

---
*Architecture research for: UI polish and UX refinement milestone*
*Researched: 2026-02-27*
