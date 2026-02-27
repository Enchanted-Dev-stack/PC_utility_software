import type { DashboardLayoutSnapshot } from "../../../../../shared/src/contracts/dashboard/dashboard-tile";
import { projectDashboardPreview } from "../../../../../shared/src/contracts/dashboard/dashboard-preview-projection";
import type { DesktopConnectivityRuntime } from "../../runtime/connectivity/desktop-connectivity-runtime";
import { createDesktopPreviewTileAppearance, type DesktopSurfaceAppearance } from "../visual-system/desktop-visual-theme";

export interface DashboardPreviewTileModel {
  id: string;
  label: string;
  icon: string;
  order: number;
  actionSummary: string;
  appearance: DesktopSurfaceAppearance;
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
  const projection = projectDashboardPreview(snapshot);
  return {
    layoutVersion: projection.layoutVersion,
    updatedAt: projection.updatedAt,
    tiles: projection.tiles.map((tile) => ({
      ...tile,
      appearance: createDesktopPreviewTileAppearance("neutral")
    }))
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
