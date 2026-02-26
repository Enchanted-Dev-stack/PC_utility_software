import type { DashboardLayoutSnapshot } from "../../../../../shared/src/contracts/dashboard/dashboard-tile";

export type DashboardLayoutListener = (snapshot: DashboardLayoutSnapshot) => void;

export class DashboardLayoutEvents {
  private readonly listeners: Set<DashboardLayoutListener>;

  public constructor() {
    this.listeners = new Set<DashboardLayoutListener>();
  }

  public emit(snapshot: DashboardLayoutSnapshot): void {
    const immutable = cloneSnapshot(snapshot);
    this.listeners.forEach((listener) => listener(cloneSnapshot(immutable)));
  }

  public subscribe(listener: DashboardLayoutListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

function cloneSnapshot(snapshot: DashboardLayoutSnapshot): DashboardLayoutSnapshot {
  return {
    version: snapshot.version,
    updatedAt: snapshot.updatedAt,
    tiles: snapshot.tiles.map((tile) => ({
      ...tile,
      action:
        tile.action.actionType === "open_app"
          ? {
              actionType: "open_app",
              payload: {
                appId: tile.action.payload.appId,
                ...(tile.action.payload.arguments
                  ? { arguments: [...tile.action.payload.arguments] }
                  : {})
              }
            }
          : tile.action.actionType === "open_website"
            ? {
                actionType: "open_website",
                payload: {
                  url: tile.action.payload.url
                }
              }
            : {
                actionType: "media_control",
                payload: {
                  command: tile.action.payload.command,
                  ...(tile.action.payload.value === undefined
                    ? {}
                    : { value: tile.action.payload.value })
                }
              }
    }))
  };
}
