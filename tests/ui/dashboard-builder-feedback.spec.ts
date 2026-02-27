import {
  createDashboardBuilderFeedback,
  createDashboardBuilderFeedbackIdentity
} from "../../shared/src/contracts/dashboard/dashboard-builder-feedback";

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
