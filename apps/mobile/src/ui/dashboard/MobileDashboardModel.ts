import type { DashboardLayoutSnapshot } from "../../../../../shared/src/contracts/dashboard/dashboard-tile";
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
  const orderedTiles = [...snapshot.tiles].sort((left, right) => left.order - right.order);

  return {
    layoutVersion: snapshot.version,
    updatedAt: snapshot.updatedAt,
    tiles: orderedTiles.map((tile) => ({
      id: tile.id,
      label: tile.label,
      icon: tile.icon,
      order: tile.order,
      actionSummary: summarizeAction(tile.action),
      appearance: createMobileTileAppearance("neutral")
    }))
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
