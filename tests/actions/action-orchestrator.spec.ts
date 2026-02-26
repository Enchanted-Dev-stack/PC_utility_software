import {
  ACTION_TYPES,
  MEDIA_CONTROL_COMMANDS,
  type ActionCommand
} from "../../shared/src/contracts/actions/action-command";
import type { ActionFeedbackEvent } from "../../shared/src/contracts/actions/action-feedback";

describe("action contract coverage", () => {
  it("includes curated v1 action command variants", () => {
    expect(ACTION_TYPES).toEqual(["open_app", "open_website", "media_control"]);
    expect(MEDIA_CONTROL_COMMANDS).toEqual([
      "play_pause",
      "next_track",
      "previous_track",
      "volume_set",
      "volume_up",
      "volume_down",
      "mute_toggle"
    ]);
  });

  it("keeps action envelope identifiers aligned with session auth guard fields", () => {
    const command: ActionCommand = {
      actionId: "act-1",
      actionType: "open_website",
      payload: { url: "https://example.com" },
      deviceId: "device-1",
      hostId: "host-1",
      sessionId: "session-1",
      requestedAt: "2026-02-27T00:00:00.000Z"
    };

    expect(command.deviceId).toBeDefined();
    expect(command.hostId).toBeDefined();
    expect(command.sessionId).toBeDefined();
    expect(command.actionId).toBeDefined();
    expect(command.requestedAt).toBeDefined();
  });

  it("supports all required lifecycle feedback stages without any", () => {
    const received: ActionFeedbackEvent = {
      actionId: "act-1",
      actionType: "open_app",
      deviceId: "device-1",
      hostId: "host-1",
      sessionId: "session-1",
      requestedAt: "2026-02-27T00:00:00.000Z",
      emittedAt: "2026-02-27T00:00:00.010Z",
      stage: "received"
    };

    const running: ActionFeedbackEvent = {
      ...received,
      stage: "running",
      emittedAt: "2026-02-27T00:00:00.020Z"
    };

    const success: ActionFeedbackEvent = {
      ...received,
      stage: "success",
      outcome: "success",
      outcomeCode: "executed",
      completedAt: "2026-02-27T00:00:00.030Z"
    };

    const failure: ActionFeedbackEvent = {
      ...received,
      stage: "failure",
      outcome: "failure",
      outcomeCode: "execution_failed",
      completedAt: "2026-02-27T00:00:00.030Z",
      error: {
        category: "executor",
        detailCode: "launcher_failed",
        message: "Unable to launch"
      }
    };

    expect(received.stage).toBe("received");
    expect(running.stage).toBe("running");
    expect(success.stage).toBe("success");
    expect(failure.stage).toBe("failure");
  });
});
