import type { DashboardLayoutSnapshot } from "../../../../../shared/src/contracts/dashboard/dashboard-tile";
import type { DesktopConnectivityRuntime } from "../../runtime/connectivity/desktop-connectivity-runtime";

export interface DashboardPreviewTileModel {
  id: string;
  label: string;
  icon: string;
  order: number;
  actionSummary: string;
}

export interface DashboardLivePreviewModel {
  layoutVersion: number;
  updatedAt: string;
  tiles: DashboardPreviewTileModel[];
}

export interface DashboardLivePreviewRuntimeHandlers {
  getModel(): Promise<DashboardLivePreviewModel>;
  subscribe(listener: (model: DashboardLivePreviewModel) => void): () => void;
}

export function createDashboardLivePreviewModel(
  snapshot: DashboardLayoutSnapshot
): DashboardLivePreviewModel {
  return {
    layoutVersion: snapshot.version,
    updatedAt: snapshot.updatedAt,
    tiles: toPreviewTiles(snapshot)
  };
}

export async function createDashboardLivePreviewRuntimeModel(
  runtime: DesktopConnectivityRuntime
): Promise<DashboardLivePreviewModel> {
  return createDashboardLivePreviewModel(runtime.getDashboardLayout());
}

export function createDashboardLivePreviewRuntimeHandlers(
  runtime: DesktopConnectivityRuntime
): DashboardLivePreviewRuntimeHandlers {
  return {
    getModel: async () => createDashboardLivePreviewRuntimeModel(runtime),
    subscribe: (listener) => {
      return runtime.subscribeDashboardLayout((snapshot) => {
        listener(createDashboardLivePreviewModel(snapshot));
      });
    }
  };
}

function summarizeAction(action: DashboardLayoutSnapshot["tiles"][number]["action"]): string {
  if (action.actionType === "open_app") {
    return `Open app: ${action.payload.appId}`;
  }

  if (action.actionType === "open_website") {
    return `Open website: ${action.payload.url}`;
  }

  return action.payload.value === undefined
    ? `Media control: ${action.payload.command}`
    : `Media control: ${action.payload.command} (${action.payload.value})`;
}

function toPreviewTiles(snapshot: DashboardLayoutSnapshot): DashboardPreviewTileModel[] {
  return [...snapshot.tiles]
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.id.localeCompare(right.id);
    })
    .map((tile, index) => ({
      id: tile.id,
      label: tile.label,
      icon: tile.icon,
      order: index,
      actionSummary: summarizeAction(tile.action)
    }));
}
