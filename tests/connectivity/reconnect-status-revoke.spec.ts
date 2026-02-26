import { ReconnectFlow } from "../../apps/mobile/src/connectivity/session/useReconnectFlow";
import { buildActionTilesGateModel } from "../../apps/mobile/src/ui/controls/ActionTilesGate";
import { SessionAuthGuard } from "../../apps/desktop/src/connectivity/session/session-auth-guard";
import {
  InMemoryTrustStorePersistence,
  TrustedDeviceStore
} from "../../apps/desktop/src/connectivity/trust/trust-store";
import { TrustedDeviceRevoker } from "../../apps/desktop/src/connectivity/trust/revoke-trusted-device";
import { buildTrustedDevicesPanelModel, revokeDeviceFromPanel } from "../../apps/desktop/src/ui/trusted-devices/TrustedDevicesPanel";
import { buildConnectionStatusBannerModel } from "../../apps/mobile/src/ui/connection-status/ConnectionStatusBanner";

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

describe("status banner and trusted-device revocation", () => {
  it("renders aligned connected/reconnecting/disconnected status labels", () => {
    const connected = buildConnectionStatusBannerModel({
      state: "connected",
      hostId: "host-primary",
      reason: "none",
      retryAttempt: 0,
      retryWindowMs: 45000,
      canSwitchHost: false,
      canManualRetry: false
    });
    expect(connected.label).toBe("Connected");
    expect(connected.tone).toBe("positive");

    const reconnecting = buildConnectionStatusBannerModel({
      state: "reconnecting",
      hostId: "host-primary",
      reason: "connection_lost",
      retryAttempt: 2,
      retryWindowMs: 45000,
      canSwitchHost: true,
      canManualRetry: false
    });
    expect(reconnecting.label).toBe("Reconnecting");
    expect(reconnecting.primaryActionLabel).toBe("Retry now");
    expect(reconnecting.showSwitchHost).toBe(true);

    const disconnected = buildConnectionStatusBannerModel({
      state: "disconnected",
      hostId: "host-primary",
      reason: "retry_window_exhausted",
      retryAttempt: 4,
      retryWindowMs: 45000,
      canSwitchHost: true,
      canManualRetry: true
    });
    expect(disconnected.label).toBe("Disconnected");
    expect(disconnected.primaryActionLabel).toBe("Reconnect");
  });

  it("revokes trusted device from desktop panel and blocks further authorization", async () => {
    const persistence = new InMemoryTrustStorePersistence();
    const trustStore = new TrustedDeviceStore(persistence);

    await trustStore.enrollTrustedDevice({
      deviceId: "phone-1",
      hostId: "host-primary",
      pairedAt: "2026-02-27T00:00:00.000Z"
    });

    const panelBefore = await buildTrustedDevicesPanelModel(trustStore);
    expect(panelBefore.items).toHaveLength(1);

    const activeSessions = new Set<string>(["host-primary::phone-1"]);
    const revoker = new TrustedDeviceRevoker(trustStore, {
      async invalidateSessionsForDevice(deviceId, hostId) {
        const key = `${hostId}::${deviceId}`;
        if (activeSessions.delete(key)) {
          return 1;
        }
        return 0;
      }
    });

    const revokeResult = await revokeDeviceFromPanel(revoker, {
      deviceId: "phone-1",
      hostId: "host-primary"
    });
    expect(revokeResult.success).toBe(true);
    expect(revokeResult.statusLabel).toContain("revoked");

    const panelAfter = await buildTrustedDevicesPanelModel(trustStore);
    expect(panelAfter.items).toHaveLength(0);

    const guard = new SessionAuthGuard(trustStore, {
      async validateSession() {
        return true;
      }
    });

    const authorization = await guard.authorizeAction({
      sessionId: "session-1",
      deviceId: "phone-1",
      hostId: "host-primary"
    });

    expect(authorization).toEqual({
      authorized: false,
      reason: "untrusted_device"
    });
  });
});
