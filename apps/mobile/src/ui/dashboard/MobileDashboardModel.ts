import type { DashboardLayoutSnapshot } from "../../../../../shared/src/contracts/dashboard/dashboard-tile";
import { projectDashboardPreview } from "../../../../../shared/src/contracts/dashboard/dashboard-preview-projection";
import { createMobileTileAppearance, type MobileSurfaceAppearance } from "../visual-system/mobile-visual-theme";

export interface MobileDashboardTileModel {
  id: string;
  label: string;
  icon: string;
  order: number;
  actionSummary: string;
  appearance: MobileSurfaceAppearance;
}

export interface MobileDashboardModel {
  layoutVersion: number;
  updatedAt: string;
  tiles: MobileDashboardTileModel[];
}

export function createMobileDashboardModel(snapshot: DashboardLayoutSnapshot): MobileDashboardModel {
  const projection = projectDashboardPreview(snapshot);

  return {
    layoutVersion: projection.layoutVersion,
    updatedAt: projection.updatedAt,
    tiles: projection.tiles.map((tile) => ({
      ...tile,
      appearance: createMobileTileAppearance("neutral")
    }))
  };
}
