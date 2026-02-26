import type {
  DashboardLayoutSnapshot,
  DashboardTile,
  DashboardTileActionMapping
} from "../../../../../shared/src/contracts/dashboard/dashboard-tile";

export class DashboardLayoutStore {
  private snapshot: DashboardLayoutSnapshot;

  public constructor(initial?: DashboardLayoutSnapshot) {
    if (initial) {
      this.snapshot = cloneSnapshot(initial);
      return;
    }

    this.snapshot = {
      version: 0,
      updatedAt: new Date(0).toISOString(),
      tiles: []
    };
  }

  public getSnapshot(): DashboardLayoutSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  public createTile(tile: DashboardTile, updatedAt: string): DashboardLayoutSnapshot {
    return this.writeSnapshot([...this.snapshot.tiles, tile], updatedAt);
  }

  public updateTile(
    tileId: string,
    updater: (current: DashboardTile) => DashboardTile,
    updatedAt: string
  ): DashboardLayoutSnapshot | null {
    const index = this.snapshot.tiles.findIndex((tile) => tile.id === tileId);
    if (index < 0) {
      return null;
    }

    const nextTiles = this.snapshot.tiles.map((tile, tileIndex) => {
      if (tileIndex !== index) {
        return tile;
      }
      return updater(cloneTile(tile));
    });

    return this.writeSnapshot(nextTiles, updatedAt);
  }

  public reorderTiles(fromIndex: number, toIndex: number, updatedAt: string): DashboardLayoutSnapshot | null {
    if (!isValidIndex(fromIndex, this.snapshot.tiles.length)) {
      return null;
    }
    if (!isValidIndex(toIndex, this.snapshot.tiles.length)) {
      return null;
    }

    const nextTiles = this.snapshot.tiles.map((tile) => cloneTile(tile));
    const [moved] = nextTiles.splice(fromIndex, 1);
    nextTiles.splice(toIndex, 0, moved);

    return this.writeSnapshot(nextTiles, updatedAt);
  }

  public deleteTile(tileId: string, updatedAt: string): DashboardLayoutSnapshot | null {
    const index = this.snapshot.tiles.findIndex((tile) => tile.id === tileId);
    if (index < 0) {
      return null;
    }

    const nextTiles = this.snapshot.tiles.filter((tile) => tile.id !== tileId);
    return this.writeSnapshot(nextTiles, updatedAt);
  }

  private writeSnapshot(tiles: DashboardTile[], updatedAt: string): DashboardLayoutSnapshot {
    const canonicalTiles = tiles.map((tile, order) => ({
      ...cloneTile(tile),
      order
    }));

    this.snapshot = {
      version: this.snapshot.version + 1,
      updatedAt,
      tiles: canonicalTiles
    };

    return cloneSnapshot(this.snapshot);
  }
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

function isValidIndex(index: number, size: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < size;
}
