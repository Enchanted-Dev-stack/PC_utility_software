import { PairingService } from "../../apps/desktop/src/connectivity/pairing/pairing-service";
import { PairingFlow } from "../../apps/mobile/src/connectivity/pairing/usePairingFlow";

describe("pairing approval gate", () => {
  it("keeps QR pairing pending until desktop explicitly approves", async () => {
    const enrollments: Array<{ deviceId: string; hostId: string }> = [];
    const service = new PairingService(
      {
        async enrollTrustedDevice(entry) {
          enrollments.push({ deviceId: entry.deviceId, hostId: entry.hostId });
        }
      },
      {
        hostId: "host-123",
        idGenerator: () => "pair-qr",
        codeGenerator: () => "123456",
        now: () => "2026-02-27T00:00:00.000Z"
      }
    );

    const flow = new PairingFlow(
      {
        async requestPairing(input) {
          return service.requestPairing(input);
        },
        async getPairingStatus(challengeId) {
          return service.getPairingStatus(challengeId);
        }
      },
      "phone-abc"
    );

    const pendingState = await flow.startQrPairing("phone");
    expect(pendingState.status).toBe("pending");
    expect(pendingState.qrValue).toContain("pair-qr");
    expect(enrollments).toHaveLength(0);

    await flow.refreshStatus();
    expect(flow.getState().status).toBe("pending");

    await service.approvePairing("pair-qr");
    const approvedState = await flow.refreshStatus();

    expect(approvedState.status).toBe("approved");
    expect(enrollments).toEqual([{ deviceId: "phone-abc", hostId: "host-123" }]);
  });

  it("supports code pairing initiated by desktop and returns denial reason", async () => {
    const service = new PairingService(
      {
        async enrollTrustedDevice() {
          return;
        }
      },
      {
        hostId: "host-123",
        idGenerator: () => "pair-code",
        codeGenerator: () => "654321",
        now: () => "2026-02-27T00:00:00.000Z"
      }
    );

    const flow = new PairingFlow(
      {
        async requestPairing(input) {
          return service.requestPairing(input);
        },
        async getPairingStatus(challengeId) {
          return service.getPairingStatus(challengeId);
        }
      },
      "phone-xyz"
    );

    const pendingState = await flow.startCodePairing("desktop");
    expect(pendingState.status).toBe("pending");
    expect(pendingState.sixDigitCode).toBe("654321");

    service.denyPairing("pair-code", "denied_by_desktop");
    const deniedState = await flow.refreshStatus();

    expect(deniedState.status).toBe("denied");
    expect(deniedState.failureReason).toBe("denied_by_desktop");
  });
});
