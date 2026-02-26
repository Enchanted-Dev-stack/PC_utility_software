import { randomUUID } from "node:crypto";
import type {
  DashboardLayoutSnapshot,
  DashboardTile,
  DashboardTileCreateInput,
  DashboardTileUpdateInput,
  DashboardValidationCode
} from "../../../../../shared/src/contracts/dashboard/dashboard-tile";
import {
  validateDashboardTileCreateInput,
  validateDashboardTileUpdateInput
} from "../../../../../shared/src/contracts/dashboard/dashboard-tile";
import { DashboardLayoutEvents } from "./dashboard-layout-events";
import { DashboardLayoutStore } from "./dashboard-layout-store";

export interface DashboardLayoutServiceConfig {
  store?: DashboardLayoutStore;
  events?: DashboardLayoutEvents;
  idFactory?: () => string;
  now?: () => string;
}

export type DashboardMutationErrorReason = "validation_failed" | "not_found" | "invalid_reorder";

export interface DashboardMutationError {
  ok: false;
  reason: DashboardMutationErrorReason;
  code?: DashboardValidationCode;
  message: string;
}

export interface DashboardMutationSuccess<T = DashboardLayoutSnapshot> {
  ok: true;
  snapshot: DashboardLayoutSnapshot;
  result: T;
}

export type DashboardMutationResult<T = DashboardLayoutSnapshot> =
  | DashboardMutationSuccess<T>
  | DashboardMutationError;

export class DashboardLayoutService {
  private readonly store: DashboardLayoutStore;
  private readonly events: DashboardLayoutEvents;
  private readonly idFactory: () => string;
  private readonly now: () => string;

  public constructor(config: DashboardLayoutServiceConfig = {}) {
    this.store = config.store ?? new DashboardLayoutStore();
    this.events = config.events ?? new DashboardLayoutEvents();
    this.idFactory = config.idFactory ?? (() => randomUUID());
    this.now = config.now ?? (() => new Date().toISOString());
  }

  public getSnapshot(): DashboardLayoutSnapshot {
    return this.store.getSnapshot();
  }

  public subscribe(listener: (snapshot: DashboardLayoutSnapshot) => void): () => void {
    return this.events.subscribe(listener);
  }

  public createTile(input: unknown): DashboardMutationResult<DashboardTile> {
    const validated = validateDashboardTileCreateInput(input);
    if (!validated.ok) {
      return {
        ok: false,
        reason: "validation_failed",
        code: validated.code,
        message: validated.message
      };
    }

    const createdAt = this.now();
    const base = this.store.getSnapshot();
    const tile: DashboardTile = {
      id: this.idFactory(),
      label: validated.value.label,
      icon: validated.value.icon,
      action: validated.value.action,
      order: base.tiles.length,
      createdAt,
      updatedAt: createdAt
    };

    const snapshot = this.store.createTile(tile, createdAt);
    this.events.emit(snapshot);
    return {
      ok: true,
      snapshot,
      result: cloneTile(tile)
    };
  }

  public updateTile(tileId: string, input: unknown): DashboardMutationResult<DashboardTile> {
    const validated = validateDashboardTileUpdateInput(input);
    if (!validated.ok) {
      return {
        ok: false,
        reason: "validation_failed",
        code: validated.code,
        message: validated.message
      };
    }

    const updatedAt = this.now();
    let updatedTile: DashboardTile | null = null;
    const snapshot = this.store.updateTile(
      tileId,
      (tile) => {
        const merged = mergeTilePatch(tile, validated.value, updatedAt);
        updatedTile = merged;
        return merged;
      },
      updatedAt
    );
    if (!snapshot || !updatedTile) {
      return {
        ok: false,
        reason: "not_found",
        message: `Dashboard tile '${tileId}' was not found.`
      };
    }

    this.events.emit(snapshot);
    return {
      ok: true,
      snapshot,
      result: cloneTile(updatedTile)
    };
  }

  public reorderTiles(input: {
    fromIndex: number;
    toIndex: number;
  }): DashboardMutationResult<DashboardLayoutSnapshot> {
    if (!Number.isInteger(input.fromIndex) || !Number.isInteger(input.toIndex)) {
      return {
        ok: false,
        reason: "invalid_reorder",
        message: "Dashboard reorder indices must be integers."
      };
    }

    const updatedAt = this.now();
    const snapshot = this.store.reorderTiles(input.fromIndex, input.toIndex, updatedAt);
    if (!snapshot) {
      return {
        ok: false,
        reason: "invalid_reorder",
        message: "Dashboard reorder indices are outside the tile range."
      };
    }

    this.events.emit(snapshot);
    return {
      ok: true,
      snapshot,
      result: snapshot
    };
  }

  public deleteTile(tileId: string): DashboardMutationResult<{ tileId: string }> {
    const updatedAt = this.now();
    const snapshot = this.store.deleteTile(tileId, updatedAt);
    if (!snapshot) {
      return {
        ok: false,
        reason: "not_found",
        message: `Dashboard tile '${tileId}' was not found.`
      };
    }

    this.events.emit(snapshot);
    return {
      ok: true,
      snapshot,
      result: {
        tileId
      }
    };
  }
}

function mergeTilePatch(
  tile: DashboardTile,
  patch: DashboardTileUpdateInput,
  updatedAt: string
): DashboardTile {
  return {
    ...tile,
    label: patch.label ?? tile.label,
    icon: patch.icon ?? tile.icon,
    action: patch.action ?? tile.action,
    updatedAt
  };
}

function cloneTile(tile: DashboardTile): DashboardTile {
  return {
    ...tile,
    action:
      tile.action.actionType === "open_app"
        ? {
            actionType: "open_app",
            payload: {
              appId: tile.action.payload.appId,
              ...(tile.action.payload.arguments ? { arguments: [...tile.action.payload.arguments] } : {})
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
  };
}
