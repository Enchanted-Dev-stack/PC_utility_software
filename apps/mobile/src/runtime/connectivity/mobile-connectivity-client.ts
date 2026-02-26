import type { ManualConnectResultPayload } from "../../../../../shared/src/contracts/connectivity/discovery";
import type {
  PairingRequest,
  PairingStatusEvent
} from "../../../../desktop/src/connectivity/pairing/pairing-service";
import type { DesktopConnectivityRuntime } from "../../../../desktop/src/runtime/connectivity/desktop-connectivity-runtime";
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
}
