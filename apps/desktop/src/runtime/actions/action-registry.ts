import type { ActionType } from "../../../../../shared/src/contracts/actions/action-command";
import type { ActionExecutorMap } from "./action-orchestrator";
import { createMediaControlExecutor, type MediaControlPlatformAdapter } from "./executors/media-control-executor";
import { createOpenAppExecutor } from "./executors/open-app-executor";
import { createOpenWebsiteExecutor } from "./executors/open-url-executor";

export interface ActionRegistryOptions {
  platform?: NodeJS.Platform;
  mediaWindowsAdapter?: MediaControlPlatformAdapter;
}

export function createActionExecutorRegistry(
  options: ActionRegistryOptions = {}
): ActionExecutorMap {
  return {
    open_app: createOpenAppExecutor({
      platform: options.platform
    }),
    open_website: createOpenWebsiteExecutor({
      platform: options.platform
    }),
    media_control: createMediaControlExecutor({
      platform: options.platform,
      windowsAdapter: options.mediaWindowsAdapter
    })
  };
}

export function isRegisteredActionType(actionType: string): actionType is ActionType {
  return actionType === "open_app" || actionType === "open_website" || actionType === "media_control";
}
