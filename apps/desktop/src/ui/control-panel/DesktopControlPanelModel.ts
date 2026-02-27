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
import {
  createDashboardBuilderRuntimeHandlers,
  createDashboardBuilderRuntimeModel,
  type DashboardBuilderMutationResult,
  type DashboardBuilderRuntimeHandlers,
  type DashboardBuilderRuntimeModel
} from "../dashboard/DashboardBuilderModel";
import type { DashboardBuilderFeedback } from "../../../../../shared/src/contracts/dashboard/dashboard-builder-feedback";
import {
  createDesktopControlPanelAppearance,
  createDesktopSurfaceAppearance,
  mapDesktopToneToSemantic,
  type DesktopControlPanelAppearance,
  type DesktopSurfaceAppearance
} from "../visual-system/desktop-visual-theme";
import type {
  RuntimeConnectionStatusSnapshot,
  RuntimeStatusListener
} from "../../runtime/connectivity/desktop-connectivity-runtime";
import { DesktopConnectivityRuntime } from "../../runtime/connectivity/desktop-connectivity-runtime";

export interface DesktopControlPanelRuntimeModel {
  connectionBanner: DesktopConnectionStatusBannerModel;
  connectionBannerAppearance: DesktopSurfaceAppearance;
  trustedDevicesPanel: TrustedDevicesPanelModel;
  actionHistoryPanel: ActionHistoryPanelModel;
  dashboardBuilder: DashboardBuilderRuntimeModel;
  feedbackMessage?: DesktopControlPanelFeedbackMessage;
  appearance: DesktopControlPanelAppearance;
}

export interface DesktopControlPanelFeedbackMessage {
  id: string;
  source: "builder" | "connection";
  message: string;
}

export interface DesktopControlPanelRuntimeModelOptions {
  actionHistoryLimit?: number;
}

export interface DesktopControlPanelRuntimeHandlers {
  getModel(): Promise<DesktopControlPanelRuntimeModel>;
  subscribeStatus(listener: RuntimeStatusListener): () => void;
  dashboardBuilder: DashboardBuilderRuntimeHandlers;
}

export async function createDesktopControlPanelRuntimeModel(
  runtime: DesktopConnectivityRuntime,
  options: DesktopControlPanelRuntimeModelOptions = {},
  latestBuilderFeedback?: DashboardBuilderFeedback
): Promise<DesktopControlPanelRuntimeModel> {
  const connection = runtime.getConnectionStatus();
  const header = runtime.getHeaderStatus();
  const trustedDevicesPanel = await buildTrustedDevicesPanelModel(runtime.getTrustStore());
  const actionHistoryPanel = createActionHistoryPanelRuntimeModel(
    runtime,
    options.actionHistoryLimit ?? 20
  );
  const dashboardBuilder = await createDashboardBuilderRuntimeModel(runtime);
  const connectionBanner = buildDesktopConnectionStatusBannerModel({
    previous: connection,
    current: connection,
    header,
    toastMessage: undefined
  });

  return {
    connectionBanner,
    connectionBannerAppearance: createDesktopSurfaceAppearance(
      "banner",
      mapDesktopToneToSemantic(connectionBanner.tone)
    ),
    trustedDevicesPanel,
    actionHistoryPanel,
    dashboardBuilder,
    feedbackMessage: selectFeedbackMessage(connectionBanner, latestBuilderFeedback ?? dashboardBuilder.latestFeedback),
    appearance: createDesktopControlPanelAppearance()
  };
}

export function createDesktopControlPanelRuntimeHandlers(
  runtime: DesktopConnectivityRuntime,
  options: DesktopControlPanelRuntimeModelOptions = {}
): DesktopControlPanelRuntimeHandlers {
  const dashboardBuilder = createDashboardBuilderRuntimeHandlers(runtime);
  let lastFeedbackMessageId: string | undefined;
  let latestBuilderFeedback: DashboardBuilderFeedback | undefined;

  const wrapBuilderMutation = async (
    callback: () => Promise<DashboardBuilderMutationResult>
  ): Promise<DashboardBuilderMutationResult> => {
    const result = await callback();
    latestBuilderFeedback = result.feedback;
    return result;
  };

  const wrappedBuilderHandlers: DashboardBuilderRuntimeHandlers = {
    getModel: dashboardBuilder.getModel,
    createTile: async (input) => wrapBuilderMutation(() => dashboardBuilder.createTile(input)),
    updateTile: async (input) => wrapBuilderMutation(() => dashboardBuilder.updateTile(input)),
    deleteTile: async (input) => wrapBuilderMutation(() => dashboardBuilder.deleteTile(input)),
    moveTile: async (input) => wrapBuilderMutation(() => dashboardBuilder.moveTile(input)),
    saveLayout: async (selectedTileId) => wrapBuilderMutation(() => dashboardBuilder.saveLayout(selectedTileId))
  };

  return {
    getModel: async () => {
      const model = await createDesktopControlPanelRuntimeModel(runtime, options, latestBuilderFeedback);
      if (model.feedbackMessage && model.feedbackMessage.id === lastFeedbackMessageId) {
        return {
          ...model,
          feedbackMessage: undefined
        };
      }
      if (model.feedbackMessage) {
        lastFeedbackMessageId = model.feedbackMessage.id;
      }
      return model;
    },
    subscribeStatus: (listener) => runtime.subscribeStatus(listener),
    dashboardBuilder: wrappedBuilderHandlers
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

function selectFeedbackMessage(
  banner: DesktopConnectionStatusBannerModel,
  builderFeedback?: DashboardBuilderFeedback
): DesktopControlPanelFeedbackMessage | undefined {
  if (builderFeedback) {
    return toBuilderFeedbackMessage(builderFeedback);
  }

  if (!banner.toast) {
    return undefined;
  }

  return {
    id: banner.toast.id,
    source: "connection",
    message: banner.toast.message
  };
}

function toBuilderFeedbackMessage(feedback: DashboardBuilderFeedback): DesktopControlPanelFeedbackMessage {
  return {
    id: `builder-${feedback.dedupeKey}`,
    source: "builder",
    message: feedback.message
  };
}
