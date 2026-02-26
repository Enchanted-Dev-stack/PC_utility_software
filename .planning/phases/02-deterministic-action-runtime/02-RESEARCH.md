# Phase 2: Deterministic Action Runtime - Research

**Researched:** 2026-02-27
**Domain:** Deterministic action execution, staged feedback, and audit history in existing TypeScript runtime
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints

### Locked Decisions
- Deliver Phase 2 scope only: deterministic action runtime for `ACTN-01`, `ACTN-02`, `ACTN-03`, `ACTN-04`, `SAFE-01`.
- Keep aligned with current codebase and established Phase 1 runtime patterns (no major re-platforming).
- Keep the curated v1 action set only: open application, open website, media controls.
- Preserve trust/session authorization gate before action execution (`SAFE-03` behavior from Phase 1).

### Claude's Discretion
- Exact action envelope schema (field names for correlation ID, timing, and result details).
- Exact queueing strategy (global serial vs per-device serial) as long as outcomes remain deterministic.
- Exact history retention policy (entry cap, trimming strategy, optional persistence adapter).
- Exact error taxonomy labels for execution failures.

### Deferred Ideas (OUT OF SCOPE)
- Tile CRUD/live preview/editor workflows (Phase 3).
- Arbitrary scripts/plugins/macros.
- WAN/internet transport and multi-user role systems.

_Note: No Phase 2 `*-CONTEXT.md` exists yet; constraints above are inferred from `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, and Phase 1 artifacts._
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACTN-01 | Trigger "open application" from phone tile and app opens on PC | Typed `open_app` executor, allowlisted app target mapping, guarded runtime pipeline, staged feedback events |
| ACTN-02 | Trigger "open website" from phone tile and URL opens on PC | URL validation (`URL`/`URL.canParse`), `open`/OS launcher adapter, guarded runtime pipeline, staged feedback events |
| ACTN-03 | Trigger media controls from phone and PC responds | Typed `media_control` executor with explicit command enum and OS adapter result codes |
| ACTN-04 | User receives execution feedback (received, running, success/failure) | Action lifecycle event model + runtime subscribers + deterministic transition order |
| SAFE-01 | User can view recent action history with timestamps/outcome in PC panel | Append-only action history store + bounded retention + panel model builder sourced from runtime |
</phase_requirements>

## Summary

Phase 2 should be implemented as an extension of the existing Phase 1 runtime bridge, not a new architecture. The repository already has the key foundation: a concrete desktop runtime, a guarded action request runtime (`SessionAuthGuard`), shared status models, and integration-style Jest tests. The missing piece is a deterministic action lifecycle that turns one accepted command into one ordered sequence of feedback states and one durable history entry.

The highest-leverage design is an `ActionRuntimeOrchestrator` that owns the full lifecycle: validate and authorize -> emit `received` -> enqueue deterministically -> emit `running` -> execute typed handler -> emit terminal `success|failure` -> persist history. This keeps ACTN-04 and SAFE-01 inherently consistent because feedback and audit rows are generated from the same state transition path.

For execution adapters, use built-ins and minimal dependencies: Node child process APIs for controlled command execution, Node URL parsing for strict URL validation, and a thin launcher abstraction for app/URL/media actions. If adopting `open`, account for ESM-only interop in this CommonJS project.

**Primary recommendation:** Implement one guarded, evented action orchestrator with typed executors and append-only history, then wire both phone feedback and desktop history UI to that same stream.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js runtime | `v24.12.0` (repo environment) | Process execution, URL parsing, timing, IDs | Already the project runtime; official stable APIs for URL parsing and child process control |
| TypeScript | `^5.9.3` | Typed action contracts and runtime models | Existing repo baseline; strong fit for discriminated unions and deterministic state enums |
| Jest + ts-jest | `jest ^30.2.0`, `ts-jest ^29.4.5` | Deterministic runtime/integration tests | Already used by Phase 1 test suite and conventions |
| Existing Phase 1 runtime modules | in-repo | Auth guard, connectivity runtime, runtime subscription patterns | Proven in `tests/connectivity/runtime-wiring.spec.ts` and Phase 1 verification |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `open` | `11.0.0` | Cross-platform URL/app opening wrapper (`spawn`-based) | Use for ACTN-01/ACTN-02 launch behavior if you accept ESM interop in CJS codebase |
| `node:url` (`URL`, `URL.canParse`) | built-in | Strict URL validation and normalization | Always for ACTN-02 input sanitization before execution |
| `node:child_process` (`spawn`/`execFile`) | built-in | OS command execution without shell-by-default | Always for action executors needing process launch/system key commands |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `open` package | OS-specific launcher commands via `spawn` only | Avoids ESM dependency, but increases per-OS command and quoting complexity |
| In-memory history only | File/db persistence adapter | In-memory is fastest for MVP; persistence helps restart continuity and post-crash audit trail |
| Single global serial queue | Per-device serial queues | Global queue is simpler and most deterministic; per-device queue improves throughput but adds ordering complexity |

**Installation:**
```bash
npm install open
```

## Architecture Patterns

### Recommended Project Structure
```text
apps/
  desktop/
    src/runtime/actions/
      action-orchestrator.ts      # lifecycle: received -> running -> terminal
      action-registry.ts          # action type -> executor mapping
      executors/
        open-app-executor.ts      # ACTN-01
        open-url-executor.ts      # ACTN-02
        media-control-executor.ts # ACTN-03
      action-history-store.ts     # SAFE-01 append-only + bounded retention
      action-feedback-events.ts   # ACTN-04 event types/subscription
    src/ui/actions/
      ActionHistoryPanel.tsx      # desktop history model/view adapter
shared/
  src/contracts/actions/
    action-command.ts             # command envelope + payload schema/types
    action-feedback.ts            # lifecycle event contracts
tests/
  actions/
    deterministic-action-runtime.spec.ts
```

### Pattern 1: Guard-First Action Orchestration
**What:** Keep SessionAuthGuard at the top of the action pipeline and short-circuit unauthorized requests before lifecycle events reach `running`.
**When to use:** Every incoming action command from mobile/desktop clients.
**Example:**
```typescript
// Source: existing pattern in apps/desktop/src/runtime/actions/action-request-runtime.ts
const authorized = await guard.authorizeAction(command);
if (!authorized.authorized) {
  return { accepted: false, actionId: command.actionId, reason: authorized.reason };
}
```

### Pattern 2: Single Source Lifecycle Events (ACTN-04)
**What:** Emit exactly ordered stages for each `actionId`: `received` -> `running` -> `success|failure`.
**When to use:** For all accepted actions regardless of type.
**Example:**
```typescript
// Source: Node EventEmitter pattern + Phase 1 runtime status subscriptions
emit({ actionId, stage: "received", at: nowIso() });
emit({ actionId, stage: "running", at: nowIso() });
try {
  const result = await executor.execute(command);
  emit({ actionId, stage: "success", at: nowIso(), result });
} catch (error) {
  emit({ actionId, stage: "failure", at: nowIso(), errorCode: mapError(error) });
}
```

### Pattern 3: Append-Only Audit History from Terminal Events (SAFE-01)
**What:** Persist history entries only at terminal state (`success` or `failure`) with timestamps and outcome metadata.
**When to use:** For all actions after execution attempt completes.
**Example:**
```typescript
// Source: project runtime model pattern + append-only audit approach
historyStore.append({
  actionId,
  actionType,
  requestedAt,
  completedAt,
  outcome, // success | failure
  reasonCode
});
```

### Anti-Patterns to Avoid
- **Fire-and-forget dispatch:** never mark an action done at "dispatched" only; must emit terminal success/failure.
- **UI-generated history rows:** history must be runtime-owned, not assembled in UI components.
- **Unvalidated action payloads:** never pass raw app path/URL/media command directly to executor.
- **Shell-string execution of user input:** avoid `exec` with concatenated command strings for app/URL targets.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL safety checks | Custom regex URL validator | WHATWG `URL` / `URL.canParse` | Correct edge-case parsing and protocol normalization are already solved |
| Cross-platform URL/app opening | Manual shell command concatenation | `open` (or strict per-OS `spawn` wrappers) | Reduces quoting/injection mistakes and platform drift |
| Command shell escaping | String interpolation into shell | `spawn`/`execFile` argument arrays | Prevents shell metacharacter injection paths |
| Feedback state bookkeeping in UI | Ad-hoc UI timers/state guesses | Runtime-emitted lifecycle events | Ensures ACTN-04 feedback matches real execution state |

**Key insight:** Determinism here is mostly an orchestration problem. Reusing proven primitives (guard, runtime stream, append-only log, safe process APIs) removes entire classes of race and security bugs.

## Common Pitfalls

### Pitfall 1: Action accepted but never reaches terminal state
**What goes wrong:** UI sees `received`/`running` but no `success` or `failure`, leaving stale spinners.
**Why it happens:** Exceptions in executors are swallowed or lifecycle emission is split across modules.
**How to avoid:** Centralize terminal emission in one `try/catch/finally` path per action.
**Warning signs:** History row missing for accepted action; long-running `running` states without timeout handling.

### Pitfall 2: Duplicate execution under reconnect/retry
**What goes wrong:** Same user intent launches app/URL twice.
**Why it happens:** Missing idempotency key or no dedupe window around `actionId`.
**How to avoid:** Treat `actionId` as idempotency key and short-circuit duplicates to prior terminal result.
**Warning signs:** Same `actionId` appears multiple times in history with multiple terminal outcomes.

### Pitfall 3: Command injection through launcher paths/URLs
**What goes wrong:** Malformed payloads execute unintended commands.
**Why it happens:** Using shell commands with unsanitized input.
**How to avoid:** Validate payloads, use allowlisted action types, prefer `spawn/execFile` and URL parser.
**Warning signs:** Inputs containing shell metacharacters are accepted unchanged.

### Pitfall 4: Non-deterministic ordering across rapid taps
**What goes wrong:** Later taps finish before earlier ones without clear sequencing, confusing user feedback.
**Why it happens:** Concurrent execution without queue policy.
**How to avoid:** Define queueing policy explicitly (global serial or per-device serial) and document ordering semantics.
**Warning signs:** Feedback stream order differs from submission order for same device/session.

### Pitfall 5: Audit history diverges from feedback stream
**What goes wrong:** Desktop history shows success while feedback showed failure (or vice versa).
**Why it happens:** Separate write paths for UI feedback and history persistence.
**How to avoid:** Derive history entries from the same terminal lifecycle event object.
**Warning signs:** Mismatched timestamps/outcomes between event logs and panel rows.

## Code Examples

Verified/grounded patterns from current repository and official docs:

### Guard Before Dispatch (existing repository)
```typescript
// Source: apps/desktop/src/runtime/actions/action-request-runtime.ts
const authorized = await this.guard.authorizeAction(command);
if (!authorized.authorized) {
  return {
    accepted: false,
    actionId: command.actionId,
    reason: authorized.reason
  };
}
await this.dispatcher(command);
```

### URL Validation Before Open (Node WHATWG URL API)
```typescript
// Source: https://nodejs.org/api/url.html
function validateHttpUrl(input: string): { ok: true; href: string } | { ok: false } {
  if (!URL.canParse(input)) return { ok: false };
  const parsed = new URL(input);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false };
  return { ok: true, href: parsed.href };
}
```

### Safe Process Execution (Node child_process)
```typescript
// Source: https://nodejs.org/api/child_process.html
import { spawn } from "node:child_process";

function runCommand(file: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}
```

### Deterministic Lifecycle + History Append
```typescript
// Source: recommended Phase 2 orchestrator pattern
emit({ actionId, stage: "received", at: nowIso() });
emit({ actionId, stage: "running", at: nowIso() });
const startedAt = nowIso();
try {
  await registry.execute(command);
  const finishedAt = nowIso();
  emit({ actionId, stage: "success", at: finishedAt });
  history.append({ actionId, actionType: command.actionType, startedAt, finishedAt, outcome: "success" });
} catch (error) {
  const finishedAt = nowIso();
  emit({ actionId, stage: "failure", at: finishedAt, errorCode: mapError(error) });
  history.append({ actionId, actionType: command.actionType, startedAt, finishedAt, outcome: "failure" });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Binary action status (`dispatched` only) | Staged lifecycle (`received`, `running`, terminal) | Modern control-plane UX expectations | Users get trustworthy progress and actionable failures |
| Trust check buried in transport edge | Guard-first runtime pipeline | Established in Phase 1 | Phase 2 can extend safely without redoing auth model |
| Ad-hoc action logs | Structured append-only runtime history | Current best practice for deterministic systems | Easier debugging and SAFE-01 coverage |

**Deprecated/outdated:**
- Fire-and-forget command handling without idempotency/correlation semantics.
- Building terminal outcomes from UI timers instead of runtime execution results.

## Open Questions

1. **Media control adapter target OS matrix**
   - What we know: ACTN-03 requires media controls; current repo has no OS-level media executor yet.
   - What's unclear: Whether Phase 2 should be Windows-first only or cross-platform from day one.
   - Recommendation: Plan Windows-first adapter with explicit `unsupported_platform` failure code for non-Windows in v1, then expand.

2. **History durability scope for SAFE-01**
   - What we know: Requirement asks for recent history visibility; persistence across app restart is not explicitly stated.
   - What's unclear: Whether restart persistence is required for acceptance.
   - Recommendation: Implement history store interface now; ship in-memory adapter first, keep file/db adapter as follow-up task if needed.

3. **Queueing policy granularity**
   - What we know: Deterministic behavior needs explicit ordering semantics.
   - What's unclear: Whether ordering must be global or only per device/session.
   - Recommendation: Start with per-device serial queue to preserve single-user determinism while avoiding global blocking.

## Sources

### Primary (HIGH confidence)
- `C:\Users\user\pc-remote-control-app\.planning\REQUIREMENTS.md` - Phase 2 requirement IDs and acceptance semantics.
- `C:\Users\user\pc-remote-control-app\.planning\ROADMAP.md` - Phase goal/success criteria.
- `C:\Users\user\pc-remote-control-app\apps\desktop\src\runtime\actions\action-request-runtime.ts` - existing guard-first dispatch baseline.
- `C:\Users\user\pc-remote-control-app\apps\desktop\src\runtime\connectivity\desktop-connectivity-runtime.ts` - runtime subscription/status event pattern.
- `C:\Users\user\pc-remote-control-app\tests\connectivity\runtime-wiring.spec.ts` - established integration-style runtime verification pattern.
- https://nodejs.org/api/child_process.html - safe process execution and shell-risk guidance.
- https://nodejs.org/api/url.html - WHATWG URL parsing/validation APIs.
- https://raw.githubusercontent.com/sindresorhus/open/main/readme.md - cross-platform launcher API and ESM/security notes.

### Secondary (MEDIUM confidence)
- `npm view open version` (`11.0.0`) and metadata from npm registry.
- https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.sendkeys.sendwait?view=windowsdesktop-9.0 - Windows key-send behavior notes and timing caveats for media/input style adapters.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - Node/TS/Jest baseline is high confidence; media adapter choice still platform-dependent.
- Architecture: HIGH - directly grounded in proven Phase 1 runtime and requirement mapping.
- Pitfalls: MEDIUM-HIGH - strongly supported by Node docs and observed runtime architecture failure modes.

**Research date:** 2026-02-27
**Valid until:** 2026-03-29
