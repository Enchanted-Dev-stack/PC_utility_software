import { TrustedDeviceRevoker } from "../../connectivity/trust/revoke-trusted-device";
import { TrustedDeviceRecord, TrustedDeviceStore } from "../../connectivity/trust/trust-store";

export interface TrustedDevicePanelItem {
  deviceId: string;
  hostId: string;
  trustedSince: string;
  lastApprovedAt: string;
  revokeActionLabel: string;
}

export interface TrustedDevicesPanelModel {
  title: string;
  subtitle: string;
  items: TrustedDevicePanelItem[];
  emptyStateLabel?: string;
}

export async function buildTrustedDevicesPanelModel(
  trustStore: TrustedDeviceStore
): Promise<TrustedDevicesPanelModel> {
  const records = await trustStore.getTrustedDevices();
  const sorted = sortTrustedDevices(records);
  const items = sorted.map((record) => ({
    deviceId: record.deviceId,
    hostId: record.hostId,
    trustedSince: record.pairedAt,
    lastApprovedAt: record.lastApprovedAt,
    revokeActionLabel: "Revoke access"
  }));

  return {
    title: "Trusted devices",
    subtitle: "Revoke any phone to require pairing before control actions are accepted again.",
    items,
    emptyStateLabel: items.length ? undefined : "No trusted phones are linked to this PC yet."
  };
}

export async function revokeDeviceFromPanel(
  revoker: TrustedDeviceRevoker,
  input: { deviceId: string; hostId: string }
): Promise<{ success: boolean; statusLabel: string }> {
  const result = await revoker.revokeTrustedDevice(input);
  if (!result.revoked) {
    return {
      success: false,
      statusLabel: "Device was already removed"
    };
  }

  return {
    success: true,
    statusLabel:
      result.invalidatedSessions > 0
        ? "Access revoked and active session terminated"
        : "Access revoked"
  };
}

function sortTrustedDevices(records: TrustedDeviceRecord[]): TrustedDeviceRecord[] {
  return [...records].sort((a, b) => b.lastApprovedAt.localeCompare(a.lastApprovedAt));
}
