import type { ManualConnectResultPayload } from "../../../../../shared/src/contracts/connectivity/discovery";
import type { ActionFeedbackEvent } from "../../../../../shared/src/contracts/actions/action-feedback";
import type {
  PairingRequest,
  PairingStatusEvent
} from "../../../../desktop/src/connectivity/pairing/pairing-service";
import type { DesktopConnectivityRuntime } from "../../../../desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import type {
  ActionCommandEnvelope,
  ActionRequestResult
} from "../../../../desktop/src/runtime/actions/action-request-runtime";
import type { ActionHistoryEntry } from "../../../../desktop/src/runtime/actions/action-history-store";
import type { DashboardLayoutSnapshot } from "../../../../../shared/src/contracts/dashboard/dashboard-tile";
import type { HostDiscoveryClient } from "../../connectivity/discovery/useHostDiscovery";
import type { PairingClient } from "../../connectivity/pairing/usePairingFlow";
import type { ReconnectClient } from "../../connectivity/session/useReconnectFlow";

export class MobileConnectivityClient implements HostDiscoveryClient, PairingClient, ReconnectClient {
  private readonly runtime: DesktopConnectivityRuntime;
  private readonly requesterDeviceId: string;

  public constructor(runtime: DesktopConnectivityRuntime, requesterDeviceId: string) {
    this.runtime = runtime;
    this.requesterDeviceId = requesterDeviceId;
  }

  public async scanHosts() {
    return this.runtime.scanHosts(this.requesterDeviceId);
  }

  public async manualConnect(
    ipAddress: string,
    requesterDeviceId: string = this.requesterDeviceId
  ): Promise<ManualConnectResultPayload> {
    return this.runtime.manualConnect(ipAddress, requesterDeviceId);
  }

  public async requestPairing(input: PairingRequest): Promise<PairingStatusEvent> {
    return this.runtime.requestPairing(input);
  }

  public async getPairingStatus(challengeId: string): Promise<PairingStatusEvent> {
    return this.runtime.getPairingStatus(challengeId);
  }

  public async connectToHost(hostId: string): Promise<boolean> {
    const result = await this.runtime.connectToHost({
      hostId,
      requesterDeviceId: this.requesterDeviceId
    });
    return result.connected;
  }

  public async submitAction(
    command: Omit<ActionCommandEnvelope, "deviceId"> & { deviceId?: string }
  ): Promise<ActionRequestResult> {
    return this.runtime.handleAction({
      ...command,
      deviceId: command.deviceId ?? this.requesterDeviceId
    });
  }

  public subscribeActionFeedback(
    listener: (event: ActionFeedbackEvent) => void,
    actionId?: string
  ): () => void {
    return this.runtime.subscribeActionFeedback((event) => {
      if (actionId && event.actionId !== actionId) {
        return;
      }

      listener(event);
    });
  }

  public getRecentActionHistory(limit = 20): ActionHistoryEntry[] {
    return this.runtime.getRecentActionHistory(limit);
  }

  public getDashboardLayout(): DashboardLayoutSnapshot {
    return this.runtime.getDashboardLayout();
  }

  public subscribeDashboardLayout(
    listener: (snapshot: DashboardLayoutSnapshot) => void
  ): () => void {
    return this.runtime.subscribeDashboardLayout(listener);
  }
}
