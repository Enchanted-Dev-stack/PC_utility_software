# Phase 3: Dashboard Builder and Live Preview - Research

**Researched:** 2026-02-27
**Domain:** Dashboard tile CRUD, layout ordering, and runtime-synchronized mobile preview in existing TypeScript runtime
**Confidence:** MEDIUM-HIGH

## User Constraints (inferred from planning artifacts)

- Deliver only Phase 3 scope: `DASH-01`, `DASH-02`, `DASH-03`, `DASH-04`, `DASH-05`.
- Preserve established architecture from Phases 1/2: runtime-owned state, typed contracts, deterministic updates, Jest integration tests.
- Keep action mapping aligned with existing curated action types (`open_app`, `open_website`, `media_control`); do not introduce new executor categories in this phase.
- Keep trust/connectivity/runtime behavior intact; dashboard editing must not bypass existing session/trust model.
- Out of scope for this phase: themes/profiles/macros/internet relay (`CSTM-*`, `TRNS-*`).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | User can create a new tile in PC panel with label and icon | Add typed dashboard tile contract + runtime create API with validation and deterministic ID generation |
| DASH-02 | User can edit tile label, icon, and mapped action | Add update API with immutable patching + action-payload validation against shared action contracts |
| DASH-03 | User can reorder tiles and save layout changes | Add reorder API (`fromIndex`/`toIndex`) with canonical reindexing and persisted snapshot replacement |
| DASH-04 | User can delete tiles from layout | Add delete API returning updated snapshot and predictable not-found behavior |
| DASH-05 | User can preview mobile dashboard in real time from PC panel | Add runtime event stream for dashboard snapshot changes; mobile preview model subscribes to same stream |
</phase_requirements>

## Summary

Phase 3 should follow the same runtime-first pattern used by connectivity and deterministic actions: a single source of truth in desktop runtime, typed contracts in `shared`, and UI models that render immutable snapshots instead of owning business state. The current codebase already demonstrates this pattern in `ActionHistoryStore`, `ActionFeedbackEvents`, `DesktopControlPanelModel`, and `TrustedDevicesPanel` runtime handlers.

The key planning decision is to treat dashboard layout as a first-class runtime resource, not ad-hoc UI state. Implement one dashboard layout store with explicit operations (create, update, reorder, delete), versioned snapshots, and subscription hooks. Then wire both desktop builder and mobile preview to that same snapshot stream. This is the most direct way to satisfy DASH-05 without introducing divergent desktop/mobile state.

No new framework dependency is required for this phase. Existing TypeScript + Jest + in-memory runtime composition is sufficient for v1 scope if we keep operations deterministic, validate payloads centrally, and preserve immutable snapshots.

**Primary recommendation:** Implement a runtime-owned `DashboardLayoutStore` + `DashboardLayoutEvents` pair and have both PC builder model and mobile preview model read from/subcribe to that shared runtime stream.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | `v24.12.0` | Runtime for desktop/mobile bridge and utilities (`URL`, `structuredClone`, `crypto.randomUUID`) | Already running in project; stable built-ins avoid extra dependencies |
| TypeScript | `5.9.3` | Strict contracts for tile schema, actions, and runtime snapshots | Existing baseline; discriminated unions already used in shared action contracts |
| Jest | `30.2.0` | Integration-style runtime verification | Existing test runner and scripts already established |
| ts-jest | `29.4.6` | TypeScript test transpilation for current Jest workflow | Existing repository setup (`preset: "ts-jest"`) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (`randomUUID`) | built-in | Collision-resistant tile IDs | Always when creating new tile IDs |
| `structuredClone` | built-in | Safe snapshot cloning for event emission and read APIs | When returning or broadcasting runtime snapshots |
| Existing runtime event pattern (`Set` listeners) | in-repo | Lightweight pub/sub for real-time preview updates | For dashboard layout change notifications |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory dashboard store | File/db persistence in this phase | Persistence is useful later, but not required by DASH-01..05 acceptance language |
| Custom listener Set | Node `EventEmitter` | `EventEmitter` is fine, but existing code already standardizes on typed Set-based subscribe/unsubscribe |
| Built-in UUID | `nanoid`/`uuid` package | Extra dependency not needed for this phase's requirements |

**Installation:**
```bash
# No new dependencies required for Phase 3 baseline
npm install
```

## Architecture Patterns

### Recommended Project Structure
```text
apps/
  desktop/
    src/runtime/dashboard/
      dashboard-layout-store.ts        # CRUD + reorder + snapshot versioning
      dashboard-layout-events.ts       # subscribe/emit snapshot updates
      dashboard-layout-service.ts      # validation + operation orchestration
    src/ui/dashboard/
      DashboardBuilderModel.ts         # PC builder view model from runtime snapshot
      DashboardLivePreviewModel.ts     # mobile-frame preview model from same snapshot
  mobile/
    src/ui/dashboard/
      MobileDashboardModel.ts          # phone tile model from runtime snapshot
shared/
  src/contracts/dashboard/
    dashboard-tile.ts                  # tile/action schema, icon and action mapping types
tests/
  dashboard/
    dashboard-builder-live-preview.spec.ts
```

### Pattern 1: Runtime-Owned Snapshot State
**What:** Keep dashboard layout state in a runtime store with immutable snapshots, not in UI-level mutable collections.
**When to use:** For all create/edit/reorder/delete operations.
**Example:**
```typescript
// Source: apps/desktop/src/runtime/actions/action-history-store.ts
public append(entry: ActionHistoryEntry): ActionHistoryEntry {
  this.entries.push({ ...entry });
  const overflow = this.entries.length - this.maxEntries;
  if (overflow > 0) {
    this.entries.splice(0, overflow);
  }
  return { ...entry };
}
```

### Pattern 2: Typed Subscribe/Unsubscribe Event Feed
**What:** Expose `subscribe(listener) => unsubscribe` and emit typed events from runtime mutations.
**When to use:** For live preview and any builder UI that must update immediately after edits.
**Example:**
```typescript
// Source: apps/desktop/src/runtime/actions/action-feedback-events.ts
public subscribe(listener: ActionFeedbackListener): () => void {
  this.listeners.add(listener);
  return () => {
    this.listeners.delete(listener);
  };
}
```

### Pattern 3: Runtime Handlers as UI Boundary
**What:** Keep UI-facing APIs as handler bundles (`getModel`, mutations, subscriptions) built from runtime.
**When to use:** For desktop builder panel and preview panel integration.
**Example:**
```typescript
// Source: apps/desktop/src/ui/trusted-devices/TrustedDevicesPanel.tsx
export interface TrustedDevicesPanelRuntimeHandlers {
  getModel(): Promise<TrustedDevicesPanelRuntimeModel>;
  revoke(input: { deviceId: string; hostId: string }): Promise<{ success: boolean; statusLabel: string }>;
  subscribe(listener: RuntimeStatusListener): () => void;
}
```

### Pattern 4: Canonical Reindex on Reorder
**What:** After each reorder, rewrite `order` as contiguous integers (`0..n-1`) before persisting snapshot.
**When to use:** Every drag/drop or move action.
**Example:**
```typescript
// Source: recommended pattern for deterministic ordering
function moveAndReindex<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
```

### Anti-Patterns to Avoid
- **Dual state stores:** do not keep separate authoritative layout state in desktop and mobile models.
- **UI-only optimistic mutations without runtime ack:** every builder operation should round-trip through runtime API.
- **Index-only tile identity:** never identify tiles by array index; use stable tile IDs.
- **Partial payload updates without validation:** edits that change action type must re-validate mapped payload.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tile ID generation | Timestamp/counter IDs | `crypto.randomUUID()` | Avoid collisions and ordering artifacts in concurrent edits |
| Deep snapshot copying | JSON stringify/parse clone | `structuredClone` or explicit typed copy | Preserves non-JSON-safe values and avoids hidden mutation leaks |
| Event framework from scratch | Complex custom observer lifecycle | Existing Set-based subscribe/unsubscribe pattern | Already proven in codebase and easy to reason about |
| Action schema drift | Separate dashboard action enum | Reuse `shared/src/contracts/actions/action-command.ts` types | Prevents builder/runtime mismatch and invalid mapped actions |

**Key insight:** This phase is mainly a state-model synchronization problem; reusing existing runtime/event/contract patterns eliminates most rewrite risk.

## Common Pitfalls

### Pitfall 1: Preview and saved layout diverge
**What goes wrong:** Desktop preview shows one order while runtime executes another.
**Why it happens:** Preview derives from local UI state while save writes separate runtime store.
**How to avoid:** Preview must read the same runtime snapshot object used for persistence.
**Warning signs:** Reopen model returns different order than currently displayed preview.

### Pitfall 2: Reorder produces duplicate or skipped positions
**What goes wrong:** Multiple tiles share same position or gaps appear after repeated moves.
**Why it happens:** Mutating only two indices instead of canonical reindex pass.
**How to avoid:** Rebuild ordered array and reassign all order indices after each move.
**Warning signs:** Sort instability and non-deterministic snapshot comparisons in tests.

### Pitfall 3: Edit action mapping becomes invalid silently
**What goes wrong:** Tile appears editable, but mapped action payload is no longer executable.
**Why it happens:** Action type changed without payload validation/reset.
**How to avoid:** Validate against shared action contracts and coerce/reset payload when type changes.
**Warning signs:** Runtime returns `validation_failed` for tiles created in builder.

### Pitfall 4: Subscriber leaks in live preview
**What goes wrong:** Multiple duplicate preview updates and memory growth over time.
**Why it happens:** Subscriptions never unsubscribed on model teardown.
**How to avoid:** Always return unsubscribe functions and assert call paths in tests.
**Warning signs:** Same change event processed multiple times by the same preview model.

### Pitfall 5: Non-deterministic test assertions due to generated IDs/timestamps
**What goes wrong:** Flaky tests around create/edit/reorder scenarios.
**Why it happens:** Random IDs and real-time clocks are not controlled.
**How to avoid:** Inject deterministic `idFactory` and `now()` in dashboard runtime service for tests.
**Warning signs:** Snapshot tests fail intermittently with ordering or value drift.

## Code Examples

Verified/grounded patterns from current repository and official docs:

### Typed runtime subscriptions
```typescript
// Source: apps/desktop/src/runtime/actions/action-feedback-events.ts
public emit(event: ActionFeedbackEvent): void {
  this.listeners.forEach((listener) => listener(event));
}

public subscribe(listener: ActionFeedbackListener): () => void {
  this.listeners.add(listener);
  return () => this.listeners.delete(listener);
}
```

### Runtime handlers consumed by UI models
```typescript
// Source: apps/desktop/src/ui/control-panel/DesktopControlPanelModel.ts
export function createDesktopControlPanelRuntimeHandlers(
  runtime: DesktopConnectivityRuntime,
  options: DesktopControlPanelRuntimeModelOptions = {}
): DesktopControlPanelRuntimeHandlers {
  return {
    getModel: async () => createDesktopControlPanelRuntimeModel(runtime, options),
    subscribeStatus: (listener) => runtime.subscribeStatus(listener)
  };
}
```

### UUID generation for tile identity
```typescript
// Source: https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptorandomuuidoptions
import { randomUUID } from "node:crypto";

const tileId = randomUUID();
```

### Use URL parser for mapped website action validation
```typescript
// Source: https://nodejs.org/docs/latest-v24.x/api/url.html#urlcanparseinput-base
function isValidHttpUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const parsed = new URL(value);
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| UI-local mutable tile lists | Runtime-owned immutable snapshots + subscriptions | Established in Phases 1/2 architecture | Enables trustworthy live preview and deterministic persistence |
| Untyped action mapping in editor | Shared typed action contracts reused by builder | Current repo already enforces typed action unions | Prevents runtime/preview mismatch |
| Ad-hoc listener wiring | Standard `subscribe -> unsubscribe` runtime APIs | Existing runtime modules | Cleaner lifecycle and fewer leaks |

**Deprecated/outdated:**
- Deriving mobile preview from unsaved form state instead of committed runtime snapshot.
- Using tile index as identity for edit/delete operations.

## Open Questions

1. **Does Phase 3 require persistence across process restart?**
   - What we know: Requirements require save/update behavior but do not explicitly mention restart durability.
   - What's unclear: Whether "save layout changes" implies disk persistence now vs in-memory runtime persistence for active session.
   - Recommendation: Plan in-memory runtime persistence for Phase 3 acceptance, but design store behind an interface so file/db adapter can be added in follow-up.

2. **How strict should icon validation be?**
   - What we know: Requirement calls for label + icon CRUD, but no canonical icon set is defined.
   - What's unclear: Free-text icon token vs allowlisted icon IDs.
   - Recommendation: Start with allowlisted icon IDs in shared contract to avoid mobile rendering drift.

3. **Who owns final action payload defaults during tile create/edit?**
   - What we know: Action runtime currently validates payload strictly for each action type.
   - What's unclear: Whether builder should auto-seed valid default payloads or require explicit user input before save.
   - Recommendation: Seed safe defaults per action type and block save when required fields are missing.

## Sources

### Primary (HIGH confidence)
- `C:/Users/user/pc-remote-control-app/.planning/REQUIREMENTS.md` - DASH requirement definitions and acceptance language.
- `C:/Users/user/pc-remote-control-app/.planning/ROADMAP.md` - Phase 3 goal and success criteria.
- `C:/Users/user/pc-remote-control-app/.planning/STATE.md` - current phase focus and prior phase decisions.
- `C:/Users/user/pc-remote-control-app/apps/desktop/src/runtime/actions/action-feedback-events.ts` - established subscribe/unsubscribe runtime event pattern.
- `C:/Users/user/pc-remote-control-app/apps/desktop/src/runtime/actions/action-history-store.ts` - immutable append/copy storage style.
- `C:/Users/user/pc-remote-control-app/apps/desktop/src/ui/control-panel/DesktopControlPanelModel.ts` - runtime handler composition pattern.
- `C:/Users/user/pc-remote-control-app/apps/desktop/src/ui/trusted-devices/TrustedDevicesPanel.tsx` - runtime-backed UI handler interface pattern.
- `C:/Users/user/pc-remote-control-app/shared/src/contracts/actions/action-command.ts` - canonical action type contracts to reuse for tile mapping.
- https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptorandomuuidoptions - `randomUUID` API.
- https://nodejs.org/docs/latest-v24.x/api/globals.html#structuredclonevalue-options - `structuredClone` API.
- https://nodejs.org/docs/latest-v24.x/api/url.html#urlcanparseinput-base - URL validation helpers.
- https://jestjs.io/docs/getting-started - Jest 30 setup and CLI patterns (updated 2025-06-10).

### Secondary (MEDIUM confidence)
- `node -v` and `npm ls jest ts-jest typescript --depth=0` in repository environment - effective runtime/tooling versions used locally.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - directly verified from local package graph and active runtime.
- Architecture: MEDIUM-HIGH - strongly grounded in existing runtime patterns; Phase 3 modules not implemented yet.
- Pitfalls: MEDIUM - inferred from existing model/event architecture and requirement semantics.

**Research date:** 2026-02-27
**Valid until:** 2026-03-29
