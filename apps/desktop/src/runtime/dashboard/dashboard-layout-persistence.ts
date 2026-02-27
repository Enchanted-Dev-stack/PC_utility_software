import type {
  DashboardLayoutSnapshot,
  DashboardTile,
  DashboardTileActionMapping
} from "../../../../../shared/src/contracts/dashboard/dashboard-tile";

export interface DashboardLayoutPersistence {
  readSnapshot(): DashboardLayoutSnapshot | null;
  writeSnapshot(snapshot: DashboardLayoutSnapshot): void;
}

export class InMemoryDashboardLayoutPersistence implements DashboardLayoutPersistence {
  private snapshot: DashboardLayoutSnapshot | null;

  public constructor(initialSnapshot?: DashboardLayoutSnapshot) {
    this.snapshot = initialSnapshot ? cloneSnapshot(initialSnapshot) : null;
  }

  public readSnapshot(): DashboardLayoutSnapshot | null {
    return this.snapshot ? cloneSnapshot(this.snapshot) : null;
  }

  public writeSnapshot(snapshot: DashboardLayoutSnapshot): void {
    if (!isValidSnapshot(snapshot)) {
      return;
    }

    this.snapshot = cloneSnapshot(snapshot);
  }
}

function isValidSnapshot(snapshot: DashboardLayoutSnapshot): boolean {
  if (!Number.isInteger(snapshot.version) || snapshot.version < 0) {
    return false;
  }

  if (typeof snapshot.updatedAt !== "string" || snapshot.updatedAt.length === 0) {
    return false;
  }

  if (!Array.isArray(snapshot.tiles)) {
    return false;
  }

  return snapshot.tiles.every((tile) => {
    return (
      typeof tile.id === "string" &&
      typeof tile.label === "string" &&
      typeof tile.icon === "string" &&
      Number.isInteger(tile.order) &&
      typeof tile.createdAt === "string" &&
      typeof tile.updatedAt === "string" &&
      isValidAction(tile.action)
    );
  });
}

function isValidAction(action: DashboardTileActionMapping): boolean {
  if (action.actionType === "open_app") {
    return typeof action.payload.appId === "string";
  }

  if (action.actionType === "open_website") {
    return typeof action.payload.url === "string";
  }

  return (
    typeof action.payload.command === "string" &&
    (action.payload.value === undefined || typeof action.payload.value === "number")
  );
}

function cloneSnapshot(snapshot: DashboardLayoutSnapshot): DashboardLayoutSnapshot {
  return {
    version: snapshot.version,
    updatedAt: snapshot.updatedAt,
    tiles: snapshot.tiles.map((tile) => cloneTile(tile))
  };
}

function cloneTile(tile: DashboardTile): DashboardTile {
  return {
    ...tile,
    action: cloneAction(tile.action)
  };
}

function cloneAction(action: DashboardTileActionMapping): DashboardTileActionMapping {
  if (action.actionType === "open_app") {
    return {
      actionType: "open_app",
      payload: {
        appId: action.payload.appId,
        ...(action.payload.arguments ? { arguments: [...action.payload.arguments] } : {})
      }
    };
  }

  if (action.actionType === "open_website") {
    return {
      actionType: "open_website",
      payload: {
        url: action.payload.url
      }
    };
  }

  return {
    actionType: "media_control",
    payload: {
      command: action.payload.command,
      ...(action.payload.value === undefined ? {} : { value: action.payload.value })
    }
  };
}
