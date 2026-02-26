import {
  buildDesktopConnectionStatusBannerModel,
  type DesktopConnectionStatusBannerModel
} from "../connection-status/DesktopConnectionStatusBanner";
import {
  createActionHistoryPanelRuntimeModel,
  type ActionHistoryPanelModel
} from "../actions/ActionHistoryPanel";
import {
  buildTrustedDevicesPanelModel,
  type TrustedDevicesPanelModel
} from "../trusted-devices/TrustedDevicesPanel";
import type {
  RuntimeConnectionStatusSnapshot,
  RuntimeStatusListener
} from "../../runtime/connectivity/desktop-connectivity-runtime";
import { DesktopConnectivityRuntime } from "../../runtime/connectivity/desktop-connectivity-runtime";

export interface DesktopControlPanelRuntimeModel {
  connectionBanner: DesktopConnectionStatusBannerModel;
  trustedDevicesPanel: TrustedDevicesPanelModel;
  actionHistoryPanel: ActionHistoryPanelModel;
}

export interface DesktopControlPanelRuntimeModelOptions {
  actionHistoryLimit?: number;
}

export interface DesktopControlPanelRuntimeHandlers {
  getModel(): Promise<DesktopControlPanelRuntimeModel>;
  subscribeStatus(listener: RuntimeStatusListener): () => void;
}

export async function createDesktopControlPanelRuntimeModel(
  runtime: DesktopConnectivityRuntime,
  options: DesktopControlPanelRuntimeModelOptions = {}
): Promise<DesktopControlPanelRuntimeModel> {
  const connection = runtime.getConnectionStatus();
  const header = runtime.getHeaderStatus();
  const trustedDevicesPanel = await buildTrustedDevicesPanelModel(runtime.getTrustStore());
  const actionHistoryPanel = createActionHistoryPanelRuntimeModel(
    runtime,
    options.actionHistoryLimit ?? 20
  );

  return {
    connectionBanner: buildDesktopConnectionStatusBannerModel({
      previous: connection,
      current: connection,
      header,
      toastMessage: undefined
    }),
    trustedDevicesPanel,
    actionHistoryPanel
  };
}

export function createDesktopControlPanelRuntimeHandlers(
  runtime: DesktopConnectivityRuntime,
  options: DesktopControlPanelRuntimeModelOptions = {}
): DesktopControlPanelRuntimeHandlers {
  return {
    getModel: async () => createDesktopControlPanelRuntimeModel(runtime, options),
    subscribeStatus: (listener) => runtime.subscribeStatus(listener)
  };
}

export function hasRecentActionRows(snapshot: DesktopControlPanelRuntimeModel): boolean {
  return snapshot.actionHistoryPanel.rows.some((row) => {
    return row.timestamp.length > 0 && (row.outcome === "success" || row.outcome === "failure");
  });
}

export function areRowsNewestFirst(snapshot: DesktopControlPanelRuntimeModel): boolean {
  const rows = snapshot.actionHistoryPanel.rows;
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].timestamp.localeCompare(rows[index].timestamp) < 0) {
      return false;
    }
  }

  return true;
}

export function mergeConnectionSnapshot(
  previous: RuntimeConnectionStatusSnapshot,
  current: RuntimeConnectionStatusSnapshot,
  runtime: DesktopConnectivityRuntime,
  toastMessage?: string
): DesktopConnectionStatusBannerModel {
  return buildDesktopConnectionStatusBannerModel({
    previous,
    current,
    header: runtime.getHeaderStatus(),
    toastMessage
  });
}
