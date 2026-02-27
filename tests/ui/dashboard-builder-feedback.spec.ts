import {
  createDashboardBuilderFeedback,
  createDashboardBuilderFeedbackIdentity
} from "../../shared/src/contracts/dashboard/dashboard-builder-feedback";
import { DesktopConnectivityRuntime } from "../../apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import { createDashboardBuilderRuntimeHandlers } from "../../apps/desktop/src/ui/dashboard/DashboardBuilderModel";

describe("dashboard builder feedback contract", () => {
  it("creates a deterministic identity for equivalent outcomes", () => {
    const first = createDashboardBuilderFeedbackIdentity({
      operation: "save",
      outcome: "noop"
    });
    const second = createDashboardBuilderFeedbackIdentity({
      operation: "save",
      outcome: "noop"
    });

    expect(first).toBe(second);
  });

  it("includes target tile and error code in identity boundaries", () => {
    const notFound = createDashboardBuilderFeedbackIdentity({
      operation: "update",
      outcome: "failure",
      code: "not_found",
      targetTileId: "tile-1"
    });
    const invalidPayload = createDashboardBuilderFeedbackIdentity({
      operation: "update",
      outcome: "failure",
      code: "invalid_action_payload",
      targetTileId: "tile-1"
    });

    expect(notFound).not.toBe(invalidPayload);
  });

  it("produces framework-agnostic feedback objects", () => {
    const feedback = createDashboardBuilderFeedback({
      operation: "create",
      outcome: "success",
      message: "Tile created"
    });

    expect(feedback).toEqual({
      id: "create|success|none|none",
      operation: "create",
      outcome: "success",
      message: "Tile created",
      dedupeKey: "create|success|none|none",
      code: undefined,
      targetTileId: undefined
    });
  });
});

describe("dashboard builder mutation feedback", () => {
  it("emits deterministic mutation feedback identities for equivalent outcomes", async () => {
    const runtime = createRuntime();
    const handlers = createDashboardBuilderRuntimeHandlers(runtime);

    const missingFirst = await handlers.updateTile({
      tileId: "tile-missing",
      label: "Name"
    });
    const missingSecond = await handlers.updateTile({
      tileId: "tile-missing",
      label: "Name"
    });

    expect(missingFirst.ok).toBe(false);
    expect(missingSecond.ok).toBe(false);
    expect(missingFirst.feedback.dedupeKey).toBe(missingSecond.feedback.dedupeKey);
    expect(missingFirst.feedback.message).toBe("Tile not found");
  });
});

function createRuntime(): DesktopConnectivityRuntime {
  return new DesktopConnectivityRuntime({
    hostId: "host-primary",
    hostName: "Office-PC",
    hostDeviceId: "desktop-1",
    hostIpAddress: "192.168.1.10",
    now: createTickingNow()
  });
}

function createTickingNow(): () => string {
  let tick = 0;
  return () => {
    tick += 1;
    return `2026-02-27T14:00:00.${String(tick).padStart(3, "0")}Z`;
  };
}
