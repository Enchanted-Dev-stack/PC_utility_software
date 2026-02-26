import {
  validateDashboardTileCreateInput,
  validateDashboardTileUpdateInput
} from "../../shared/src/contracts/dashboard/dashboard-tile";

describe("dashboard contract validation", () => {
  it("accepts create payloads for supported action mappings", () => {
    const created = validateDashboardTileCreateInput({
      label: " Browser  ",
      icon: "browser",
      action: {
        actionType: "open_website",
        payload: {
          url: "https://example.com/docs"
        }
      }
    });

    expect(created).toEqual({
      ok: true,
      value: {
        label: "Browser",
        icon: "browser",
        action: {
          actionType: "open_website",
          payload: {
            url: "https://example.com/docs"
          }
        }
      }
    });
  });

  it("rejects create payloads with invalid action payloads using explicit outcomes", () => {
    const invalidActionType = validateDashboardTileCreateInput({
      label: "Launch",
      icon: "apps",
      action: {
        actionType: "macro",
        payload: {}
      }
    });
    expect(invalidActionType).toEqual({
      ok: false,
      code: "invalid_action_type",
      message: "Action type must be one of: open_app, open_website, media_control."
    });

    const invalidPayload = validateDashboardTileCreateInput({
      label: "Media",
      icon: "media",
      action: {
        actionType: "media_control",
        payload: {
          command: "skip"
        }
      }
    });
    expect(invalidPayload).toEqual({
      ok: false,
      code: "invalid_action_payload",
      message:
        "media_control payload.command must be one of: play_pause, next, previous, volume_up, volume_down, mute_toggle."
    });

    const invalidUrl = validateDashboardTileCreateInput({
      label: "Site",
      icon: "browser",
      action: {
        actionType: "open_website",
        payload: {
          url: "ftp://example.com"
        }
      }
    });
    expect(invalidUrl).toEqual({
      ok: false,
      code: "invalid_action_payload",
      message: "open_website payload.url must be a valid http or https URL."
    });
  });

  it("rejects update payloads that make no changes", () => {
    const result = validateDashboardTileUpdateInput({});
    expect(result).toEqual({
      ok: false,
      code: "invalid_update_payload",
      message: "Update payload must provide at least one of: label, icon, action."
    });
  });
});
