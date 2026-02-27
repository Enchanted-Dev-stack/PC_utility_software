import type {
  DashboardLayoutSnapshot,
  DashboardTileActionMapping,
  DashboardIconToken
} from "./dashboard-tile";

export interface DashboardPreviewProjectionTile {
  id: string;
  label: string;
  icon: DashboardIconToken;
  order: number;
  actionSummary: string;
}

export interface DashboardPreviewProjection {
  layoutVersion: number;
  updatedAt: string;
  tiles: DashboardPreviewProjectionTile[];
}

export function projectDashboardPreview(snapshot: DashboardLayoutSnapshot): DashboardPreviewProjection {
  return {
    layoutVersion: snapshot.version,
    updatedAt: snapshot.updatedAt,
    tiles: projectDashboardPreviewTiles(snapshot)
  };
}

export function projectDashboardPreviewTiles(
  snapshot: DashboardLayoutSnapshot
): DashboardPreviewProjectionTile[] {
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

function summarizeAction(action: DashboardTileActionMapping): string {
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
