import { ReconnectFlow } from "../../apps/mobile/src/connectivity/session/useReconnectFlow";
import { buildActionTilesGateModel } from "../../apps/mobile/src/ui/controls/ActionTilesGate";

describe("reconnect flow and action tile gate", () => {
  it("reconnects to last trusted host and re-enables controls on success", async () => {
    let nowMs = 0;
    let attempts = 0;
    const states: string[] = [];

    const flow = new ReconnectFlow(
      {
        async connectToHost(hostId) {
          attempts += 1;
          expect(hostId).toBe("host-primary");
          return attempts >= 3;
        }
      },
      {
        lastSuccessfulHostId: "host-primary",
        retryBackoffMs: [10000, 10000, 10000],
        retryWindowMs: 45000,
        now: () => nowMs,
        sleep: async (ms) => {
          nowMs += ms;
        },
        onStateChange: (state) => {
          states.push(state.state);
        }
      }
    );

    const connected = await flow.handleDisconnect("connection_lost");

    expect(connected.state).toBe("connected");
    expect(connected.hostId).toBe("host-primary");
    expect(states).toContain("reconnecting");

    const gateModel = buildActionTilesGateModel(flow.getState());
    expect(gateModel.disabled).toBe(false);
  });

  it("supports switch-host during reconnect and uses the new target", async () => {
    let nowMs = 0;
    const attemptedHosts: string[] = [];
    let sleepStarted = false;
    let releaseSleep: () => void = () => {
      throw new Error("Expected reconnect flow to wait before retrying");
    };

    const flow = new ReconnectFlow(
      {
        async connectToHost(hostId) {
          attemptedHosts.push(hostId);
          return hostId === "host-backup";
        }
      },
      {
        lastSuccessfulHostId: "host-primary",
        retryBackoffMs: [10000, 10000],
        retryWindowMs: 45000,
        now: () => nowMs,
        sleep: (ms) =>
          new Promise<void>((resolve) => {
            sleepStarted = true;
            releaseSleep = () => {
              nowMs += ms;
              resolve();
            };
          })
      }
    );

    const reconnectPromise = flow.handleDisconnect("connection_lost");
    await Promise.resolve();
    flow.switchHost("host-backup");
    if (!sleepStarted) {
      throw new Error("Expected reconnect flow to wait before retrying");
    }
    releaseSleep();

    const result = await reconnectPromise;
    expect(result.state).toBe("connected");
    expect(result.hostId).toBe("host-backup");
    expect(attemptedHosts).toEqual(["host-primary", "host-backup"]);
  });

  it("stops retrying after the configured window and keeps actions disabled", async () => {
    let nowMs = 0;

    const flow = new ReconnectFlow(
      {
        async connectToHost() {
          return false;
        }
      },
      {
        lastSuccessfulHostId: "host-primary",
        retryBackoffMs: [15000, 15000, 15000],
        retryWindowMs: 30000,
        now: () => nowMs,
        sleep: async (ms) => {
          nowMs += ms;
        }
      }
    );

    const disconnected = await flow.handleDisconnect("connection_lost");

    expect(disconnected.state).toBe("disconnected");
    expect(disconnected.reason).toBe("retry_window_exhausted");

    const gateModel = buildActionTilesGateModel(disconnected);
    expect(gateModel.disabled).toBe(true);
    expect(gateModel.reason).toBe("disconnected");
  });
});
