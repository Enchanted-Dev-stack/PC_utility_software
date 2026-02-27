const http = require("node:http");
const { spawn } = require("node:child_process");
const os = require("node:os");

const PORT = Number(process.env.PORT || 8787);
const ACCESSIBILITY_VERIFICATION_ROUTE = "/verify/builder-accessibility";
const MIN_TILE_SPAN = 1;
const MAX_TILE_SPAN = 4;
const ACTION_DEDUP_WINDOW_MS = 300;
const ICON_CHOICES = [
  "⭐",
  "🔥",
  "🎵",
  "🌐",
  "📝",
  "🎬",
  "📁",
  "⚙️",
  "🧠",
  "🖥️",
  "🎮",
  "💡",
  "🔒",
  "📷",
  "📞",
  "🧩",
];
const BUILDER_SURFACE_CONTROL_IDS = [
  "create-tile",
  "edit-first-tile",
  "reorder-tiles",
  "delete-last-tile",
  "save-layout",
];
const recentActionByDevice = new Map();
const inFlightActions = new Set();

const state = {
  paired: false,
  trustedDeviceId: null,
  connection: "disconnected",
  lastHost: "PC-REMOTE-DESKTOP",
  lastReason: "idle",
  events: [],
  actionHistory: [],
  dashboard: {
    isDirty: false,
    lastSavedAt: null,
    tiles: [
      {
        id: "tile-1",
        order: 0,
        label: "Browser",
        icon: "🌐",
        actionType: "open_url",
        actionValue: "https://example.com",
        spanCols: 2,
        spanRows: 1,
      },
      {
        id: "tile-2",
        order: 1,
        label: "Music",
        icon: "🎵",
        actionType: "media_play_pause",
        actionValue: "",
        spanCols: 2,
        spanRows: 1,
      },
    ],
  },
};

function defaultActionValue(actionType) {
  if (actionType === "open_url") {
    return "https://example.com";
  }
  if (actionType === "open_app") {
    return "notepad.exe";
  }
  return "";
}

function logEvent(type, message) {
  const entry = {
    ts: new Date().toISOString(),
    type,
    message,
  };
  state.events.unshift(entry);
  state.events = state.events.slice(0, 30);
}

function logAction(deviceId, actionType, status, detail) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    deviceId,
    actionType,
    status,
    detail,
  };
  state.actionHistory.unshift(entry);
  state.actionHistory = state.actionHistory.slice(0, 50);
  return entry;
}

function sendJson(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
  });
  res.end(html);
}

function sendRedirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function getAccessibilityVerificationPrerequisite() {
  const requiredControls = BUILDER_SURFACE_CONTROL_IDS.slice();
  return {
    ready: requiredControls.length > 0,
    route: ACCESSIBILITY_VERIFICATION_ROUTE,
    requiredControls,
    guidance:
      "Open the builder verification route before running keyboard/focus checks. /panel is a legacy route and should not be used as the primary accessibility verification entrypoint.",
  };
}

function normalizeTiles() {
  state.dashboard.tiles = state.dashboard.tiles
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((tile, index) => ({
      ...tile,
      order: index,
      icon: String(tile.icon || "⬜"),
      imageUrl: String(tile.imageUrl || ""),
      spanCols: normalizeSpan(tile.spanCols, 2),
      spanRows: normalizeSpan(tile.spanRows, 1),
    }));
}

function normalizeSpan(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(MIN_TILE_SPAN, Math.min(MAX_TILE_SPAN, Math.round(numeric)));
}

function dashboardSnapshot() {
  normalizeTiles();
  return {
    isDirty: state.dashboard.isDirty,
    lastSavedAt: state.dashboard.lastSavedAt,
    tiles: state.dashboard.tiles,
  };
}

function shouldDedupAction(deviceId, actionType) {
  const key = `${deviceId}:${actionType}`;
  if (inFlightActions.has(key)) {
    return true;
  }

  const now = Date.now();
  const last = recentActionByDevice.get(key) || 0;
  if (now - last < ACTION_DEDUP_WINDOW_MS) {
    return true;
  }

  recentActionByDevice.set(key, now);
  inFlightActions.add(key);
  return false;
}

function markActionComplete(deviceId, actionType) {
  const key = `${deviceId}:${actionType}`;
  inFlightActions.delete(key);
  recentActionByDevice.set(key, Date.now());
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 8_000_000) {
        reject(new Error("Payload too large (max 8MB)"));
      }
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeHttpUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  const input = value.trim();
  if (!input || !URL.canParse(input)) {
    return null;
  }

  const parsed = new URL(input);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.href;
}

function networkSnapshot() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const values of Object.values(interfaces)) {
    for (const item of values || []) {
      if (!item || item.family !== "IPv4" || item.internal) {
        continue;
      }
      addresses.push(item.address);
    }
  }

  const unique = [...new Set(addresses)];
  return {
    port: PORT,
    localhostUrl: `http://127.0.0.1:${PORT}`,
    lanUrls: unique.map((address) => `http://${address}:${PORT}`),
  };
}

function splitCommandLine(value) {
  const input = String(value || "").trim();
  if (!input) {
    return [];
  }

  const tokens = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && /\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function launchDetached(command, args) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const child = spawn(command, args, {
      shell: false,
      detached: true,
      windowsHide: true,
      stdio: "ignore",
    });

    child.once("error", (error) => {
      const code = typeof error?.code === "string" ? error.code : "spawn_error";
      settle({ ok: false, detail: code });
    });

    child.once("spawn", () => {
      child.unref();
      settle({ ok: true, detail: "spawned" });
    });

    child.once("close", (exitCode) => {
      if (typeof exitCode === "number" && exitCode !== 0) {
        settle({ ok: false, detail: `exit_code_${exitCode}` });
      }
    });
  });
}

function runCommand(command, args, { timeoutMs = 8_000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let stderr = "";

    const settle = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const child = spawn(command, args, {
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle({ ok: false, detail: "timeout" });
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 2_000) {
        stderr = stderr.slice(0, 2_000);
      }
    });

    child.once("error", (error) => {
      clearTimeout(timer);
      const code = typeof error?.code === "string" ? error.code : "spawn_error";
      settle({ ok: false, detail: code });
    });

    child.once("close", (exitCode) => {
      clearTimeout(timer);
      if (typeof exitCode === "number" && exitCode !== 0) {
        const detail = stderr.trim() || `exit_code_${exitCode}`;
        settle({ ok: false, detail });
        return;
      }
      settle({ ok: true, detail: "ok" });
    });
  });
}

function runPowerShellScript(script, options = {}) {
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  const baseArgs = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodedScript,
  ];

  if (options.detached) {
    return launchDetached("powershell.exe", baseArgs);
  }

  return runCommand("powershell.exe", baseArgs, {
    timeoutMs: options.timeoutMs,
  });
}

async function executeDesktopAction(actionType, actionValue) {
  const sendVirtualKey = (virtualKeyCode, repeats = 1) => {
    if (process.platform !== "win32") {
      return { ok: false, detail: "unsupported_platform" };
    }

    const code = Number(virtualKeyCode);
    const repeatCount = Math.max(1, Math.min(20, Math.round(Number(repeats) || 1)));
    if (!Number.isFinite(code)) {
      return { ok: false, detail: "invalid_virtual_key" };
    }

    return runPowerShellScript(
      `if (-not ("RemoteKeySender" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RemoteKeySender {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
}
for ($i = 0; $i -lt ${repeatCount}; $i++) {
  [RemoteKeySender]::keybd_event(${code}, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 20
  [RemoteKeySender]::keybd_event(${code}, 0, 0x0002, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 30
}`,
      { timeoutMs: 6_000 },
    );
  };

  if (actionType === "open_url") {
    const normalized = normalizeHttpUrl(actionValue);
    if (!normalized) {
      return { ok: false, detail: "invalid_url" };
    }
    if (process.platform === "win32") {
      return launchDetached("cmd", ["/c", "start", "", normalized]);
    }
    if (process.platform === "darwin") {
      return launchDetached("open", [normalized]);
    }
    return launchDetached("xdg-open", [normalized]);
  }

  if (actionType === "open_app") {
    const parts = splitCommandLine(actionValue);
    if (parts.length === 0) {
      return { ok: false, detail: "missing_app_target" };
    }

    if (process.platform === "win32") {
      return launchDetached("cmd", ["/c", "start", "", ...parts]);
    }

    const [command, ...args] = parts;
    return launchDetached(command, args);
  }

  if (actionType === "media_play_pause") {
    return sendVirtualKey(0xB3);
  }

  if (actionType === "media_next") {
    return sendVirtualKey(0xB0);
  }

  if (actionType === "media_previous") {
    return sendVirtualKey(0xB1);
  }

  if (actionType === "volume_up") {
    return sendVirtualKey(0xAF, 5);
  }

  if (actionType === "volume_down") {
    return sendVirtualKey(0xAE, 5);
  }

  if (actionType === "volume_mute") {
    return sendVirtualKey(0xAD);
  }

  if (actionType === "system_lock") {
    if (process.platform !== "win32") {
      return { ok: false, detail: "unsupported_platform" };
    }
    return launchDetached("rundll32.exe", ["user32.dll,LockWorkStation"]);
  }

  if (actionType === "system_sleep") {
    if (process.platform !== "win32") {
      return { ok: false, detail: "unsupported_platform" };
    }
    return runPowerShellScript(
      `if (-not ("RemotePowerState" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RemotePowerState {
  [DllImport("powrprof.dll", SetLastError = true)]
  public static extern bool SetSuspendState(bool hibernate, bool forceCritical, bool disableWakeEvent);
}
"@
}
[bool]$ok = [RemotePowerState]::SetSuspendState($false, $true, $false)
if (-not $ok) {
  Start-Process -FilePath "rundll32.exe" -ArgumentList "powrprof.dll,SetSuspendState 0,1,0" -WindowStyle Hidden | Out-Null
}
exit 0`,
      { timeoutMs: 6_000 },
    );
  }

  if (actionType === "system_shutdown") {
    if (process.platform !== "win32") {
      return { ok: false, detail: "unsupported_platform" };
    }
    return launchDetached("shutdown", ["/s", "/t", "0"]);
  }

  if (actionType === "system_restart") {
    if (process.platform !== "win32") {
      return { ok: false, detail: "unsupported_platform" };
    }
    return launchDetached("shutdown", ["/r", "/t", "0"]);
  }

  if (actionType === "open_task_manager") {
    if (process.platform !== "win32") {
      return { ok: false, detail: "unsupported_platform" };
    }
    return runPowerShellScript('Start-Process -FilePath "taskmgr.exe" -WindowStyle Normal', {
      timeoutMs: 6_000,
    });
  }

  return { ok: false, detail: "unsupported_action" };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, service: "desktop-runtime" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/") {
      sendRedirect(res, ACCESSIBILITY_VERIFICATION_ROUTE);
      return;
    }

    if (req.method === "GET" && url.pathname === "/verify/builder-surface") {
      const prerequisite = getAccessibilityVerificationPrerequisite();
      sendJson(res, prerequisite.ready ? 200 : 503, prerequisite);
      return;
    }

    if (req.method === "GET" && url.pathname === "/discover") {
      state.connection = state.connection === "disconnected" ? "reconnecting" : state.connection;
      sendJson(res, 200, {
        hosts: [
          {
            hostId: "host-01",
            hostName: state.lastHost,
            deviceId: "desktop-device-01",
            lastSeen: Date.now(),
          },
        ],
      });
      logEvent("discover", "Discovery requested from mobile app");
      return;
    }

    if (req.method === "POST" && url.pathname === "/pair") {
      const body = await readBody(req);
      const deviceId = String(body.deviceId || "phone-device");
      state.paired = true;
      state.trustedDeviceId = deviceId;
      state.connection = "connected";
      state.lastReason = "paired_and_connected";
      logEvent("pair", `Device paired: ${deviceId}`);
      sendJson(res, 200, {
        paired: true,
        trustedDeviceId: deviceId,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/revoke") {
      const body = await readBody(req);
      const deviceId = String(body.deviceId || "");
      if (!state.paired || state.trustedDeviceId !== deviceId) {
        sendJson(res, 403, { ok: false, reason: "untrusted_device" });
        return;
      }
      state.paired = false;
      state.trustedDeviceId = null;
      state.connection = "disconnected";
      state.lastReason = "revoked";
      logEvent("revoke", `Device revoked: ${deviceId}`);
      sendJson(res, 200, { revoked: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/status") {
      sendJson(res, 200, {
        paired: state.paired,
        trustedDeviceId: state.trustedDeviceId,
        connection: state.connection,
        activeHost: state.lastHost,
        trustedIndicator: state.paired ? "trusted" : "untrusted",
        reason: state.lastReason,
        events: state.events,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/network") {
      sendJson(res, 200, networkSnapshot());
      return;
    }

    if (req.method === "GET" && url.pathname === "/dashboard") {
      sendJson(res, 200, dashboardSnapshot());
      return;
    }

    if (req.method === "GET" && url.pathname === "/preview") {
      sendJson(res, 200, {
        layoutVersion: state.dashboard.lastSavedAt || "unsaved",
        tiles: dashboardSnapshot().tiles,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/dashboard/tiles") {
      const body = await readBody(req);
      const actionType = String(body.actionType || "open_url");
      const id = `tile-${Date.now()}`;
      const tile = {
        id,
        order: state.dashboard.tiles.length,
        label: String(body.label || `Tile ${state.dashboard.tiles.length + 1}`),
        icon: String(body.icon || "⭐"),
        imageUrl: String(body.imageUrl || "").trim(),
        actionType,
        actionValue: String(body.actionValue || defaultActionValue(actionType)),
        spanCols: normalizeSpan(body.spanCols, 2),
        spanRows: normalizeSpan(body.spanRows, 1),
      };
      state.dashboard.tiles.push(tile);
      state.dashboard.isDirty = true;
      logEvent("dashboard", `Tile created: ${tile.label}`);
      sendJson(res, 200, { ok: true, tile, dashboard: dashboardSnapshot() });
      return;
    }

    if (req.method === "PUT" && url.pathname.startsWith("/dashboard/tiles/")) {
      const id = url.pathname.split("/").pop();
      const body = await readBody(req);
      const tile = state.dashboard.tiles.find((t) => t.id === id);
      if (!tile) {
        sendJson(res, 404, { ok: false, reason: "tile_not_found" });
        return;
      }
      tile.label = String(body.label || tile.label);
      tile.icon = String(body.icon || tile.icon);
      tile.imageUrl = String(
        body.imageUrl === undefined ? tile.imageUrl || "" : body.imageUrl,
      ).trim();
      tile.actionType = String(body.actionType || tile.actionType);
      tile.actionValue = String(
        body.actionValue === undefined ? tile.actionValue : body.actionValue,
      );
      tile.spanCols = normalizeSpan(
        body.spanCols === undefined ? tile.spanCols : body.spanCols,
        tile.spanCols || 2,
      );
      tile.spanRows = normalizeSpan(
        body.spanRows === undefined ? tile.spanRows : body.spanRows,
        tile.spanRows || 1,
      );
      state.dashboard.isDirty = true;
      logEvent("dashboard", `Tile edited: ${tile.label}`);
      sendJson(res, 200, { ok: true, tile, dashboard: dashboardSnapshot() });
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/dashboard/tiles/")) {
      const id = url.pathname.split("/").pop();
      const before = state.dashboard.tiles.length;
      state.dashboard.tiles = state.dashboard.tiles.filter((t) => t.id !== id);
      if (state.dashboard.tiles.length === before) {
        sendJson(res, 404, { ok: false, reason: "tile_not_found" });
        return;
      }
      state.dashboard.isDirty = true;
      normalizeTiles();
      logEvent("dashboard", `Tile deleted: ${id}`);
      sendJson(res, 200, { ok: true, dashboard: dashboardSnapshot() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/dashboard/reorder") {
      const body = await readBody(req);
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (ids.length === 0) {
        sendJson(res, 400, { ok: false, reason: "invalid_ids" });
        return;
      }
      const byId = new Map(state.dashboard.tiles.map((t) => [t.id, t]));
      const nextTiles = [];
      for (const id of ids) {
        const tile = byId.get(id);
        if (!tile) {
          sendJson(res, 400, { ok: false, reason: `unknown_tile:${id}` });
          return;
        }
        nextTiles.push(tile);
        byId.delete(id);
      }
      for (const tile of byId.values()) {
        nextTiles.push(tile);
      }
      state.dashboard.tiles = nextTiles.map((tile, index) => ({ ...tile, order: index }));
      state.dashboard.isDirty = true;
      logEvent("dashboard", "Tiles reordered");
      sendJson(res, 200, { ok: true, dashboard: dashboardSnapshot() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/dashboard/save") {
      state.dashboard.isDirty = false;
      state.dashboard.lastSavedAt = new Date().toISOString();
      logEvent("dashboard", "Layout saved");
      sendJson(res, 200, { ok: true, dashboard: dashboardSnapshot() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/history") {
      sendJson(res, 200, {
        items: state.actionHistory,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/action") {
      const body = await readBody(req);
      const deviceId = String(body.deviceId || "");
      const tileId = String(body.tileId || "");
      const tile = tileId ? state.dashboard.tiles.find((entry) => entry.id === tileId) : null;
      const actionType = String(tile?.actionType || body.actionType || "");
      const actionValue = String(tile?.actionValue || body.actionValue || "");

      if (!state.paired || state.trustedDeviceId !== deviceId) {
        const denied = logAction(deviceId || "unknown", actionType || "unknown", "failed", "untrusted_device");
        sendJson(res, 403, {
          ok: false,
          reason: "untrusted_device",
          action: denied,
        });
        return;
      }

      if (
        ![
          "media_play_pause",
          "media_next",
          "media_previous",
          "open_url",
          "open_app",
          "volume_up",
          "volume_down",
          "volume_mute",
          "system_lock",
          "system_sleep",
          "system_shutdown",
          "system_restart",
          "open_task_manager",
        ].includes(actionType)
      ) {
        const invalid = logAction(deviceId, actionType, "failed", "unsupported_action");
        sendJson(res, 400, {
          ok: false,
          reason: "unsupported_action",
          action: invalid,
        });
        return;
      }

      if ((actionType === "open_url" || actionType === "open_app") && !actionValue.trim()) {
        const invalidTarget = logAction(deviceId, actionType, "failed", "missing_action_target");
        sendJson(res, 400, {
          ok: false,
          reason: "missing_action_target",
          action: invalidTarget,
        });
        return;
      }

      if (shouldDedupAction(deviceId, actionType)) {
        const skipped = logAction(deviceId, actionType, "skipped", "deduplicated");
        sendJson(res, 200, {
          ok: true,
          lifecycle: ["received", "deduplicated"],
          action: skipped,
          resolved: {
            tileId: tile?.id || null,
            actionType,
            actionValue,
          },
        });
        return;
      }

      try {
        const execution = await executeDesktopAction(actionType, actionValue);
        if (!execution.ok) {
          const failed = logAction(deviceId, actionType, "failed", execution.detail || "execution_failed");
          sendJson(res, 500, {
            ok: false,
            reason: "execution_failed",
            action: failed,
            resolved: {
              tileId: tile?.id || null,
              actionType,
              actionValue,
            },
          });
          return;
        }

        const detail = actionValue ? `executed:${actionValue}` : "executed";
        const success = logAction(deviceId, actionType, "success", detail);
        state.lastReason = `action:${actionType}`;
        logEvent("action", `Action executed: ${actionType}`);
        sendJson(res, 200, {
          ok: true,
          lifecycle: ["received", "running", "success"],
          action: success,
          resolved: {
            tileId: tile?.id || null,
            actionType,
            actionValue,
          },
        });
        return;
      } finally {
        markActionComplete(deviceId, actionType);
      }
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/panel" || url.pathname === ACCESSIBILITY_VERIFICATION_ROUTE)
    ) {
      const prerequisite = getAccessibilityVerificationPrerequisite();
      const network = networkSnapshot();
      const mobileUrl = network.lanUrls[0] || network.localhostUrl;
      const bootDashboard = JSON.stringify(dashboardSnapshot());
      const bootHistory = JSON.stringify(state.actionHistory);
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>PC Remote Builder</title>
<style>
:root{--bg:#02090d;--panel:#05131a;--panel-2:#081b24;--text:#b7ffd8;--muted:#5fa28a;--line:#17493a;--accent:#00ff88;--accent-2:#38d6ff;--danger:#ff5f7a;--ok:#adff2f;--shadow:0 0 0 1px rgba(0,255,136,.08),0 18px 40px rgba(0,0,0,.55)}
*{box-sizing:border-box}
body{margin:0;font-family:"JetBrains Mono","Cascadia Mono","Fira Code",Consolas,monospace;color:var(--text);background:radial-gradient(1200px 560px at 20% -10%,rgba(56,214,255,.18),transparent 60%),radial-gradient(900px 420px at 95% 0,rgba(0,255,136,.14),transparent 52%),linear-gradient(180deg,#02090d,#01060a)}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(180deg,rgba(255,255,255,.03) 0,rgba(255,255,255,.03) 1px,transparent 2px,transparent 4px);opacity:.16;z-index:0}
.shell{position:relative;z-index:1;max-width:1280px;margin:0 auto;padding:24px}
.top{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;margin-bottom:20px;border:1px solid var(--line);background:linear-gradient(145deg,#06161f,#071017);border-radius:0;padding:16px;box-shadow:var(--shadow)}
.title h1{font-size:30px;line-height:1.05;margin:0 0 8px;color:var(--accent);text-shadow:0 0 12px rgba(0,255,136,.35)}
.title p{margin:0;color:var(--muted);max-width:720px}
.badge{display:inline-block;background:rgba(0,255,136,.09);color:var(--accent);padding:4px 10px;border-radius:0;border:1px solid rgba(0,255,136,.34);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.status{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.pill{background:var(--panel);border:1px solid var(--line);border-radius:0;padding:6px 12px;font-size:12px;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}
.pill b{color:var(--text)}
.grid{display:grid;grid-template-columns:1.1fr 1.3fr;gap:16px}
.card{background:linear-gradient(155deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:0;box-shadow:var(--shadow);padding:16px}
.card h2{margin:0 0 14px;font-size:17px;color:#b7f8ff;letter-spacing:.07em;text-transform:uppercase}
.muted{color:var(--muted);font-size:12px;line-height:1.45}
.legacy-panel{display:none!important}
.list{display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto}
.tile-item{display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;border:1px solid var(--line);border-radius:0;background:#041018;color:var(--text);padding:10px 12px;cursor:pointer}
.tile-item:hover{border-color:rgba(0,255,136,.6);background:#072128}
.tile-item.active{border-color:var(--accent);background:#08261f;box-shadow:0 0 0 1px rgba(0,255,136,.28) inset}
.tile-item.drag-over{border-color:var(--accent-2);background:#082333}
.tile-main{font-weight:700}
.tile-sub{font-size:11px;color:var(--muted)}
.icon-picker{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px;margin-bottom:10px}
.icon-choice{height:36px;border:1px solid var(--line);border-radius:0;background:#06111a;color:var(--text);font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.icon-choice.active{border-color:var(--accent);background:#0a2320;box-shadow:0 0 0 1px rgba(0,255,136,.25) inset}
.canvas-stage{display:grid;grid-template-columns:minmax(380px,460px) minmax(280px,1fr);gap:14px;align-items:start;margin-top:10px}
.canvas-preview-col{min-width:0}
.canvas-shell{margin-top:0;border:1px solid #0f3342;background:linear-gradient(180deg,#050d15,#09161f);border-radius:0;padding:14px;display:flex;justify-content:center;box-shadow:inset 0 0 0 1px rgba(56,214,255,.16)}
.canvas-phone{position:relative;width:360px;min-height:640px;border-radius:0;overflow:hidden;border:1px solid #123847;background:#051019;box-shadow:0 0 0 1px rgba(56,214,255,.2),0 0 28px rgba(0,0,0,.55)}
.canvas-payload-panel{border:1px solid var(--line);background:linear-gradient(160deg,#07151d,#06101a);padding:14px;border-radius:0;opacity:0;transform:translateX(26px);pointer-events:none;transition:opacity .35s ease,transform .35s ease}
.canvas-payload-panel.visible{opacity:1;transform:translateX(0);pointer-events:auto}
.canvas-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.canvas-payload-panel h3{margin:0 0 8px;font-size:14px;letter-spacing:.07em;text-transform:uppercase;color:#b7f8ff}
.canvas-payload-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.canvas-payload-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.panel-close{padding:4px 8px;min-width:0;line-height:1}
.canvas-tile{position:absolute;overflow:hidden;display:flex;align-items:flex-end;cursor:grab;user-select:none;transition:border-color .12s ease,box-shadow .12s ease,transform .12s ease}
.canvas-tile.active{border-color:var(--accent)!important;box-shadow:0 0 0 1px rgba(0,255,136,.4) inset}
.canvas-tile.dragging{opacity:.45}
.canvas-tile.drag-over{outline:2px dashed var(--accent-2);outline-offset:2px}
.canvas-icon{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.12;pointer-events:none}
.canvas-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5;filter:saturate(1.15) contrast(1.05)}
.canvas-content{position:relative;z-index:2}
.canvas-label{font-weight:700;line-height:1.2}
.canvas-meta{font-size:11px}
.canvas-size{position:absolute;top:8px;left:8px;z-index:3;background:#082c3e;color:#93ecff;font-size:11px;border-radius:0;border:1px solid #19516b;padding:2px 8px}
.resize-handle{position:absolute;right:8px;bottom:8px;width:14px;height:14px;border-radius:0;border:1px solid #3d7182;background:#071f2b;cursor:nwse-resize;z-index:4}
.canvas-theme{min-width:260px}
.canvas-image-preview{margin-top:8px;border:1px solid var(--line);height:110px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#04111a}
.canvas-image-preview img{width:100%;height:100%;object-fit:cover}
.canvas-image-preview span{font-size:11px;color:var(--muted)}
label{display:block;font-size:12px;color:var(--muted);margin-bottom:6px;letter-spacing:.05em;text-transform:uppercase}
input,select{width:100%;border:1px solid var(--line);border-radius:0;padding:10px 12px;font-size:14px;background:#041019;color:var(--text);font-family:inherit}
input::placeholder{color:#4f8b77}
input:focus,select:focus,button:focus{outline:2px solid rgba(0,255,136,.38);outline-offset:1px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:center}
button{border:1px solid var(--line);border-radius:0;padding:10px 12px;font-weight:700;cursor:pointer;background:#071822;color:var(--text);font-family:inherit;letter-spacing:.03em;text-transform:uppercase;font-size:12px}
button:hover{border-color:rgba(0,255,136,.6);background:#0a2328}
button.primary{background:linear-gradient(180deg,#00c76b,#00a85a);border-color:#00c76b;color:#001b0f}
button.primary:hover{background:linear-gradient(180deg,#00dd76,#00b864)}
button.danger{background:linear-gradient(180deg,#ff5f7a,#e94563);border-color:#ff5f7a;color:#24040c}
button.ghost{background:#05131a;border:1px solid var(--line)}
.meta{margin-top:10px;font-size:12px;color:var(--muted)}
pre{background:#030d14;color:#9dffc7;border-radius:0;border:1px solid #154536;padding:12px;overflow:auto;font-size:12px;max-height:250px}
code{color:#93ecff}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left}
th{color:#84dbc0;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
@media (max-width: 1100px){.canvas-stage{grid-template-columns:1fr}.canvas-payload-panel{max-width:none}}
@media (max-width: 900px){.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}.status{justify-content:flex-start}}
</style>
</head><body>
<div class="shell">
  <div class="top">
    <div class="title">
      <span class="badge">Intel Node // Builder Surface</span>
      <h1>PC Remote Command Console</h1>
      <p>Compose handset control payloads, edit live tiles, and monitor action telemetry from a terminal-grade operations surface.</p>
    </div>
    <div class="status">
      <div class="pill">Connection: <b id="conn">${state.connection}</b></div>
      <div class="pill">Host: <b>${state.lastHost}</b></div>
      <div class="pill">Trusted: <b>${state.paired ? "yes" : "no"}</b></div>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <h2 style="margin-bottom:8px">Uplink Endpoint</h2>
    <div class="muted">Use this base URL in the mobile app settings:</div>
    <pre style="margin-top:8px">${mobileUrl}</pre>
  </div>

  <div class="grid">
    <section class="card legacy-panel">
      <h2>Tile Registry</h2>
      <div class="muted">Select a tile to edit. Keyboard: Tab to controls, Enter to activate.</div>
      <div id="tile-list" class="list" aria-label="tile list"></div>
      <div class="actions" style="margin-top:12px">
        <button id="reorder-tiles" data-builder-control="reorder" onclick="reverseOrder()">Reverse Order</button>
        <button class="ghost" onclick="refreshDashboard()">Refresh</button>
      </div>
      <div class="meta">Dirty: <b id="dirty">no</b> | Last Saved: <b id="saved">never</b></div>
    </section>

    <section class="card legacy-panel">
      <h2>Payload Editor</h2>
      <div class="row">
        <div>
          <label for="tile-label">Label</label>
          <input id="tile-label" type="text" placeholder="e.g. Spotify"/>
        </div>
        <div>
          <label for="tile-icon">Icon</label>
          <input id="tile-icon" type="text" placeholder="e.g. 🎵 or 🔥"/>
        </div>
      </div>
      <div>
        <label>Icon Picker</label>
        <div id="icon-picker" class="icon-picker"></div>
      </div>
      <div class="row">
        <div>
          <label for="tile-cols">Tile Columns</label>
          <input id="tile-cols" type="number" min="1" max="4" value="2"/>
        </div>
        <div>
          <label for="tile-rows">Tile Rows</label>
          <input id="tile-rows" type="number" min="1" max="4" value="1"/>
        </div>
      </div>
      <div style="margin-bottom:10px">
        <label for="tile-action">Action</label>
        <select id="tile-action">
          <option value="open_url">Open URL</option>
          <option value="open_app">Open App</option>
          <option value="media_play_pause">Media Play/Pause</option>
        </select>
      </div>
      <div style="margin-bottom:10px">
        <label for="tile-target" id="tile-target-label">Target URL</label>
        <input id="tile-target" type="text" placeholder="https://example.com"/>
      </div>
      <input id="tile-image" type="hidden" value=""/>

      <div class="actions">
        <button id="create-tile" data-builder-control="create" class="primary" onclick="createTile()">Create Tile</button>
        <button id="edit-first-tile" data-builder-control="edit" onclick="updateSelectedTile()">Update Selected</button>
        <button id="delete-last-tile" data-builder-control="delete" class="danger" onclick="deleteSelectedTile()">Delete Selected</button>
        <button id="save-layout" data-builder-control="save" class="primary" onclick="saveLayout()">Save Layout</button>
      </div>

      <div class="meta" id="editor-message">No tile selected yet. Select one from the left or create a new tile.</div>
    </section>

    <section class="card" style="grid-column:1 / -1">
      <h2>Handset Mirror Canvas</h2>
      <div class="muted">Phone-accurate preview. Drag to reorder, drag handle to resize, scroll wheel to nudge size (Shift = width). Click any tile in the mirror to slide in the payload editor at right.</div>
      <div class="canvas-stage">
        <div class="canvas-preview-col">
          <div class="actions" style="margin-top:8px">
            <label for="canvas-theme" style="margin:0">Preview Theme</label>
            <select id="canvas-theme" class="canvas-theme"></select>
          </div>
          <div class="canvas-shell">
            <div id="layout-canvas" class="canvas-phone" aria-label="layout canvas"></div>
          </div>
        </div>
        <aside id="canvas-payload-panel" class="canvas-payload-panel">
          <div class="canvas-panel-head">
            <h3>Mirror Payload Editor</h3>
            <button id="canvas-payload-close" class="ghost panel-close" type="button" aria-label="Close mirror payload editor">x</button>
          </div>
          <div id="canvas-payload-hint" class="muted">Select a tile in the handset mirror canvas to edit payload fields here.</div>
          <div id="canvas-payload-fields" style="display:none;margin-top:10px">
            <div style="margin-bottom:10px">
              <label for="canvas-payload-label">Label</label>
              <input id="canvas-payload-label" type="text" placeholder="Tile label"/>
            </div>
            <div style="margin-bottom:10px">
              <label for="canvas-payload-icon">Icon</label>
              <input id="canvas-payload-icon" type="text" placeholder="⭐"/>
            </div>
            <div style="margin-bottom:10px">
              <label for="canvas-payload-image">Image URL (optional)</label>
              <input id="canvas-payload-image" type="text" placeholder="https://.../tile-image.png"/>
            </div>
            <div style="margin-bottom:10px">
              <label for="canvas-payload-image-file">Or choose image file</label>
              <input id="canvas-payload-image-file" type="file" accept="image/*"/>
              <div class="canvas-image-preview" id="canvas-image-preview"><span>No image selected</span></div>
            </div>
            <div style="margin-bottom:10px">
              <label for="canvas-payload-action">Action</label>
              <select id="canvas-payload-action">
                <option value="open_url">Open URL</option>
                <option value="open_app">Open App</option>
                <option value="media_play_pause">Media Play/Pause</option>
                <option value="media_next">Media Next</option>
                <option value="media_previous">Media Previous</option>
                <option value="volume_up">Volume Up</option>
                <option value="volume_down">Volume Down</option>
                <option value="volume_mute">Volume Mute</option>
                <option value="system_lock">System Lock</option>
                <option value="system_sleep">System Sleep</option>
                <option value="system_shutdown">System Shutdown</option>
                <option value="system_restart">System Restart</option>
                <option value="open_task_manager">Open Task Manager</option>
              </select>
            </div>
            <div style="margin-bottom:10px">
              <label for="canvas-payload-target" id="canvas-payload-target-label">Target URL</label>
              <input id="canvas-payload-target" type="text" placeholder="https://example.com"/>
            </div>
            <div class="canvas-payload-grid">
              <div>
                <label for="canvas-payload-cols">Columns</label>
                <input id="canvas-payload-cols" type="number" min="1" max="4" value="2"/>
              </div>
              <div>
                <label for="canvas-payload-rows">Rows</label>
                <input id="canvas-payload-rows" type="number" min="1" max="4" value="1"/>
              </div>
            </div>
            <div class="canvas-payload-actions">
              <button id="canvas-payload-apply" class="primary" type="button">Apply Payload</button>
              <button id="canvas-payload-reset" class="ghost" type="button">Reset</button>
              <button id="canvas-create-tile" data-builder-control="create" class="ghost" type="button">Create Tile</button>
              <button id="canvas-delete-tile" data-builder-control="delete" class="danger" type="button">Delete Selected</button>
              <button id="canvas-save-layout" data-builder-control="save" class="primary" type="button">Save Layout</button>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <section class="card" style="grid-column:1 / -1">
      <h2>/preview Wire Payload</h2>
      <div class="muted">What the mobile app reads from <code>/preview</code>.</div>
      <pre id="preview-json"></pre>
    </section>

    <section class="card" style="grid-column:1 / -1">
      <h2>Action Telemetry</h2>
      <div class="actions" style="margin-bottom:8px">
        <button class="ghost" onclick="manualRefresh()">Refresh Data</button>
      </div>
      <table>
        <thead><tr><th>Timestamp</th><th>Device</th><th>Action</th><th>Status</th><th>Detail</th></tr></thead>
        <tbody id="history-body"></tbody>
      </table>
    </section>
  </div>
</div>

<script>
const ACCESSIBILITY_VERIFICATION_ROUTE = "${ACCESSIBILITY_VERIFICATION_ROUTE}";
const ICON_CHOICES = ${JSON.stringify(ICON_CHOICES)};
const BOOT_DASHBOARD = ${bootDashboard};
const BOOT_HISTORY = ${bootHistory};
const BUILDER_THEME_KEY = "builder_canvas_theme";
const PHONE_VIEWPORT_WIDTH = 360;
const TILE_ROW_HEIGHT = 96;
const TILE_THEMES = {
  neo_brutal: {
    name: "Neo Brutalist Grid V1",
    background: "#FFF27D",
    border: "#111827",
    text: "#0F172A",
    meta: "#334155",
    iconTint: "#11182733",
    radius: 4,
    borderWidth: 3,
    boxShadow: "4px 4px 0 #0F172A",
    gridGap: 10,
    screenPadding: 10,
    screenBackground: "#F6F8FC",
  },
  premium_glow: {
    name: "Premium Glow Grid V2",
    background: "#000000",
    border: "#1A1A1A",
    text: "#FFFFFF",
    meta: "#6B7280",
    iconTint: "#00E5FF14",
    radius: 10,
    borderWidth: 1,
    boxShadow: "0 0 10px #00E5FF22",
    gridGap: 0,
    screenPadding: 0,
    screenBackground: "#000000",
  },
  amoled_control_center: {
    name: "AMOLED Control Center",
    background: "#000000",
    border: "#1A1A1A",
    text: "#E2E8F0",
    meta: "#64748B",
    iconTint: "#00E5FF14",
    radius: 0,
    borderWidth: 1,
    boxShadow: "none",
    gridGap: 10,
    screenPadding: 10,
    screenBackground: "#000000",
  },
  midnight: {
    name: "Midnight",
    background: "#0F172A",
    border: "#334155",
    text: "#E2E8F0",
    meta: "#94A3B8",
    iconTint: "#E2E8F01A",
    radius: 14,
    borderWidth: 1.6,
    boxShadow: "0 8px 20px #0F172A33",
    gridGap: 10,
    screenPadding: 10,
    screenBackground: "#0B1020",
  },
  divider_grid: {
    name: "Divider Grid",
    background: "#F8FAFC",
    border: "#94A3B8",
    text: "#0F172A",
    meta: "#475569",
    iconTint: "#0F172A0F",
    radius: 0,
    borderWidth: 0.9,
    boxShadow: "none",
    gridGap: 0,
    screenPadding: 0,
    screenBackground: "#F8FAFC",
  },
};

let dashboard = BOOT_DASHBOARD;
let selectedTileId = null;
let draggedTileId = null;
let activeResize = null;
let activeCanvasThemeId = localStorage.getItem(BUILDER_THEME_KEY) || "neo_brutal";
let lastCanvasMetrics = null;
let lastPlacementsByTileId = new Map();
let resizeNudgeInFlight = new Set();
let mirrorPayloadPanelClosed = true;

const SUPPORTED_ACTIONS = [
  "open_url",
  "open_app",
  "media_play_pause",
  "media_next",
  "media_previous",
  "volume_up",
  "volume_down",
  "volume_mute",
  "system_lock",
  "system_sleep",
  "system_shutdown",
  "system_restart",
  "open_task_manager",
];

if (!TILE_THEMES[activeCanvasThemeId]) {
  activeCanvasThemeId = "neo_brutal";
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setMessage(msg) {
  document.getElementById("editor-message").textContent = msg;
}

function selectedIconValue() {
  return document.getElementById("tile-icon").value.trim();
}

function renderIconPicker() {
  const picker = document.getElementById("icon-picker");
  const selected = selectedIconValue();
  picker.innerHTML = ICON_CHOICES
    .map((icon) => {
      const active = icon === selected ? " active" : "";
      return '<button type="button" class="icon-choice' + active + '" data-icon="' + escapeHtml(icon) + '">' + escapeHtml(icon) + '</button>';
    })
    .join("");

  picker.querySelectorAll("[data-icon]").forEach((button) => {
    button.addEventListener("click", () => {
      const icon = button.getAttribute("data-icon") || "⭐";
      document.getElementById("tile-icon").value = icon;
      renderIconPicker();
    });
  });
}

function selectedTile() {
  return dashboard.tiles.find((t) => t.id === selectedTileId) || null;
}

function sortedTiles() {
  return dashboard.tiles.slice().sort((a, b) => a.order - b.order);
}

function normalizeTileSpan(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(${MIN_TILE_SPAN}, Math.min(${MAX_TILE_SPAN}, Math.round(numeric)));
}

function iconGlyph(rawValue) {
  const value = String(rawValue || "").trim();
  return value || "⭐";
}

function activeCanvasTheme() {
  return TILE_THEMES[activeCanvasThemeId] || TILE_THEMES.neo_brutal;
}

function renderCanvasThemeOptions() {
  const select = document.getElementById("canvas-theme");
  if (!select) {
    return;
  }

  const options = Object.entries(TILE_THEMES)
    .map(([id, theme]) => {
      const selected = id === activeCanvasThemeId ? " selected" : "";
      return '<option value="' + escapeHtml(id) + '"' + selected + '>' + escapeHtml(theme.name) + '</option>';
    })
    .join("");
  select.innerHTML = options;
}

function buildPlacements(tiles, gridColumns = 4) {
  const occupancy = [];
  const placements = [];

  function ensureRows(minRows) {
    while (occupancy.length < minRows) {
      occupancy.push(Array.from({ length: gridColumns }, () => false));
    }
  }

  function canPlace(row, col, spanCols, spanRows) {
    ensureRows(row + spanRows);
    for (let r = row; r < row + spanRows; r += 1) {
      for (let c = col; c < col + spanCols; c += 1) {
        if (occupancy[r][c]) {
          return false;
        }
      }
    }
    return true;
  }

  function occupy(row, col, spanCols, spanRows) {
    ensureRows(row + spanRows);
    for (let r = row; r < row + spanRows; r += 1) {
      for (let c = col; c < col + spanCols; c += 1) {
        occupancy[r][c] = true;
      }
    }
  }

  tiles.forEach((tile) => {
    const spanCols = Math.min(normalizeTileSpan(tile.spanCols, 2), gridColumns);
    const spanRows = normalizeTileSpan(tile.spanRows, 1);
    let row = 0;
    let placed = false;

    while (!placed) {
      ensureRows(row + spanRows);
      for (let col = 0; col <= gridColumns - spanCols; col += 1) {
        if (!canPlace(row, col, spanCols, spanRows)) {
          continue;
        }

        occupy(row, col, spanCols, spanRows);
        placements.push({
          tile,
          row,
          col,
          spanCols,
          spanRows,
        });
        placed = true;
        break;
      }

      if (!placed) {
        row += 1;
      }
    }
  });

  return placements;
}

async function patchTile(tileId, body, successMessage) {
  const resp = await fetch("/dashboard/tiles/" + tileId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (resp.status >= 400) {
    const fail = await resp.json();
    throw new Error(fail.reason || String(resp.status));
  }

  const payload = await resp.json();
  dashboard = payload.dashboard;
  selectedTileId = payload.tile.id;
  setForm(payload.tile);
  if (successMessage) {
    setMessage(successMessage);
  }
  renderTileList();
  renderLayoutCanvas();
  renderCanvasPayloadPanel();
  await refreshPreview();
  return payload.tile;
}

async function nudgeTileSize(tileId, deltaCols, deltaRows) {
  if (resizeNudgeInFlight.has(tileId)) {
    return;
  }

  const tile = dashboard.tiles.find((entry) => entry.id === tileId);
  if (!tile) {
    return;
  }

  const nextCols = normalizeTileSpan(Number(tile.spanCols || 2) + deltaCols, tile.spanCols || 2);
  const nextRows = normalizeTileSpan(Number(tile.spanRows || 1) + deltaRows, tile.spanRows || 1);
  if (nextCols === tile.spanCols && nextRows === tile.spanRows) {
    return;
  }

  resizeNudgeInFlight.add(tileId);
  try {
    await patchTile(tileId, { spanCols: nextCols, spanRows: nextRows }, "Resized tile to " + nextCols + "x" + nextRows + ".");
  } finally {
    resizeNudgeInFlight.delete(tileId);
  }
}

async function quickEditTile(tileId) {
  const tile = dashboard.tiles.find((entry) => entry.id === tileId);
  if (!tile) {
    return;
  }

  const nextLabelInput = prompt("Tile label", tile.label || "");
  if (nextLabelInput === null) {
    return;
  }

  const actionPrompt =
    "Action type (" + SUPPORTED_ACTIONS.join(", ") + ")";
  const actionTypeInput = prompt(actionPrompt, tile.actionType || "open_url");
  if (actionTypeInput === null) {
    return;
  }

  const nextActionType = actionTypeInput.trim();
  if (!SUPPORTED_ACTIONS.includes(nextActionType)) {
    alert("Unsupported action type.");
    return;
  }

  let nextActionValue = String(tile.actionValue || "");
  if (nextActionType === "open_url") {
    const target = prompt("Target URL", nextActionValue || "https://example.com");
    if (target === null) {
      return;
    }
    nextActionValue = target.trim();
  } else if (nextActionType === "open_app") {
    const target = prompt("Application command", nextActionValue || "notepad.exe");
    if (target === null) {
      return;
    }
    nextActionValue = target.trim();
  } else {
    nextActionValue = "";
  }

  await patchTile(
    tileId,
    {
      label: nextLabelInput.trim() || tile.label,
      actionType: nextActionType,
      actionValue: nextActionValue,
    },
    "Updated tile directly from canvas.",
  );
}

async function applyReorder(sourceId, targetId) {
  const orderedIds = sortedTiles().map((tile) => tile.id);
  const sourceIndex = orderedIds.indexOf(sourceId);
  const targetIndex = orderedIds.indexOf(targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return;
  }

  orderedIds.splice(sourceIndex, 1);
  orderedIds.splice(targetIndex, 0, sourceId);

  await fetch("/dashboard/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: orderedIds }),
  });

  setMessage("Reordered tiles.");
  await refreshDashboard();
  await refreshPreview();
}

function beginResize(tileId, handleElement, startEvent) {
  startEvent.preventDefault();
  startEvent.stopPropagation();

  const tile = dashboard.tiles.find((entry) => entry.id === tileId);
  if (!tile) {
    return;
  }

  const placement = lastPlacementsByTileId.get(tileId);
  if (!placement || !lastCanvasMetrics) {
    return;
  }

  activeResize = {
    tileId,
    startX: startEvent.clientX,
    startY: startEvent.clientY,
    startCols: normalizeTileSpan(tile.spanCols, 2),
    startRows: normalizeTileSpan(tile.spanRows, 1),
    currentCols: normalizeTileSpan(tile.spanCols, 2),
    currentRows: normalizeTileSpan(tile.spanRows, 1),
    colStep: Math.max(lastCanvasMetrics.cellWidth + lastCanvasMetrics.gap, 40),
    rowStep: TILE_ROW_HEIGHT + lastCanvasMetrics.gap,
    left: placement.left,
    top: placement.top,
    handleElement,
  };
}

function onResizeMove(event) {
  if (!activeResize || !lastCanvasMetrics) {
    return;
  }

  const deltaX = event.clientX - activeResize.startX;
  const deltaY = event.clientY - activeResize.startY;
  const nextCols = normalizeTileSpan(
    activeResize.startCols + Math.round(deltaX / activeResize.colStep),
    activeResize.startCols,
  );
  const nextRows = normalizeTileSpan(
    activeResize.startRows + Math.round(deltaY / activeResize.rowStep),
    activeResize.startRows,
  );

  if (nextCols === activeResize.currentCols && nextRows === activeResize.currentRows) {
    return;
  }

  activeResize.currentCols = nextCols;
  activeResize.currentRows = nextRows;

  const tileElement = activeResize.handleElement.closest(".canvas-tile");
  if (!tileElement) {
    return;
  }

  const width =
    (nextCols * lastCanvasMetrics.cellWidth) + ((nextCols - 1) * lastCanvasMetrics.gap);
  const height =
    (nextRows * TILE_ROW_HEIGHT) + ((nextRows - 1) * lastCanvasMetrics.gap);
  tileElement.style.width = width + "px";
  tileElement.style.height = height + "px";
  const badge = tileElement.querySelector(".canvas-size");
  if (badge) {
    badge.textContent = nextCols + "x" + nextRows;
  }
}

async function onResizeEnd() {
  if (!activeResize) {
    return;
  }

  const payload = {
    spanCols: activeResize.currentCols,
    spanRows: activeResize.currentRows,
  };
  const tileId = activeResize.tileId;
  const didChange =
    activeResize.currentCols !== activeResize.startCols ||
    activeResize.currentRows !== activeResize.startRows;
  activeResize = null;

  if (!didChange) {
    return;
  }

  try {
    await patchTile(tileId, payload, "Resized tile.");
  } catch (error) {
    setMessage("Resize failed: " + error.message);
    await refreshDashboard();
  }
}

function renderLayoutCanvas() {
  const canvas = document.getElementById("layout-canvas");
  const tiles = sortedTiles();
  const theme = activeCanvasTheme();
  const gridColumns = 4;
  const gap = theme.gridGap;
  const screenPadding = theme.screenPadding;
  const contentWidth = Math.max(PHONE_VIEWPORT_WIDTH - (screenPadding * 2), 120);
  const cellWidth = (contentWidth - ((gridColumns - 1) * gap)) / gridColumns;
  const placements = buildPlacements(tiles, gridColumns);

  let totalRows = 1;
  placements.forEach((placement) => {
    const endRow = placement.row + placement.spanRows;
    if (endRow > totalRows) {
      totalRows = endRow;
    }
  });

  const tileRegionHeight = (totalRows * TILE_ROW_HEIGHT) + ((totalRows - 1) * gap);
  const canvasHeight = Math.max(640, tileRegionHeight + (screenPadding * 2));

  lastCanvasMetrics = {
    gap,
    screenPadding,
    cellWidth,
  };

  lastPlacementsByTileId = new Map();
  canvas.style.height = canvasHeight + "px";
  canvas.style.background = theme.screenBackground;
  canvas.style.fontFamily = '"Space Grotesk", "Segoe UI", Arial, sans-serif';

  canvas.innerHTML = placements
    .map((placement) => {
      const tile = placement.tile;
      const cols = placement.spanCols;
      const rows = placement.spanRows;
      const active = tile.id === selectedTileId ? " active" : "";
      const width = (cols * cellWidth) + ((cols - 1) * gap);
      const height = (rows * TILE_ROW_HEIGHT) + ((rows - 1) * gap);
      const left = screenPadding + (placement.col * (cellWidth + gap));
      const top = screenPadding + (placement.row * (TILE_ROW_HEIGHT + gap));
      const compactTile = height < 120;
      const iconSize = Math.max(32, Math.round(height * 0.52));
      const imageUrl = String(tile.imageUrl || "").trim();
      const visualLayer = imageUrl
        ? '<img class="canvas-image" src="' + escapeHtml(imageUrl) + '" alt="tile visual"/>'
        : '<div class="canvas-icon" style="font-size:' + iconSize + 'px;color:' + theme.iconTint + ';">' + escapeHtml(iconGlyph(tile.icon)) + '</div>';

      lastPlacementsByTileId.set(tile.id, {
        left,
        top,
        width,
        height,
        col: placement.col,
        row: placement.row,
      });

      return (
        '<div class="canvas-tile' + active + '" draggable="true" data-tile-id="' + escapeHtml(tile.id) + '" style="left:' + left + 'px;top:' + top + 'px;width:' + width + 'px;height:' + height + 'px;background:' + theme.background + ';border:' + theme.borderWidth + 'px solid ' + theme.border + ';border-radius:0;box-shadow:' + theme.boxShadow + ';">' +
          '<div class="canvas-size">' + cols + 'x' + rows + '</div>' +
          visualLayer +
          '<div class="canvas-content" style="padding:' + (compactTile ? 8 : 12) + 'px;">' +
            '<div class="canvas-label" style="font-size:' + (compactTile ? 14 : 16) + 'px;color:' + theme.text + ';max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:' + (compactTile ? 'nowrap' : 'normal') + ';">' + escapeHtml(tile.label) + '</div>' +
            '<div class="canvas-meta" style="color:' + theme.meta + ';display:' + (compactTile ? 'none' : 'block') + ';">' + escapeHtml(tile.actionType) + '</div>' +
          '</div>' +
          '<div class="resize-handle" title="Drag to resize" data-resize-handle="' + escapeHtml(tile.id) + '"></div>' +
        '</div>'
      );
    })
    .join("");

  canvas.querySelectorAll(".canvas-tile").forEach((tileElement) => {
    const tileId = tileElement.getAttribute("data-tile-id");
    if (!tileId) {
      return;
    }

    tileElement.addEventListener("click", () => {
      selectTile(tileId);
    });

    tileElement.addEventListener("dblclick", () => {
      quickEditTile(tileId).catch((error) => {
        setMessage("Quick edit failed: " + error.message);
      });
    });

    tileElement.addEventListener("wheel", (event) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 1 : -1;
      const promise = event.shiftKey
        ? nudgeTileSize(tileId, delta, 0)
        : nudgeTileSize(tileId, 0, delta);
      promise.catch((error) => {
        setMessage("Resize failed: " + error.message);
      });
    });

    tileElement.addEventListener("dragstart", (event) => {
      draggedTileId = tileId;
      tileElement.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", tileId);
    });

    tileElement.addEventListener("dragend", () => {
      tileElement.classList.remove("dragging");
      draggedTileId = null;
      canvas.querySelectorAll(".canvas-tile").forEach((node) => node.classList.remove("drag-over"));
    });

    tileElement.addEventListener("dragover", (event) => {
      event.preventDefault();
      tileElement.classList.add("drag-over");
    });

    tileElement.addEventListener("dragleave", () => {
      tileElement.classList.remove("drag-over");
    });

    tileElement.addEventListener("drop", async (event) => {
      event.preventDefault();
      tileElement.classList.remove("drag-over");
      const sourceId = draggedTileId || event.dataTransfer?.getData("text/plain");
      if (!sourceId || sourceId === tileId) {
        return;
      }
      await applyReorder(sourceId, tileId);
    });
  });

  canvas.querySelectorAll("[data-resize-handle]").forEach((handleElement) => {
    handleElement.addEventListener("mousedown", (event) => {
      const tileId = handleElement.getAttribute("data-resize-handle");
      if (!tileId) {
        return;
      }
      beginResize(tileId, handleElement, event);
    });
  });
}

function renderTileList() {
  const list = document.getElementById("tile-list");
  const items = dashboard.tiles
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((tile) => {
      const active = tile.id === selectedTileId ? " active" : "";
      return '<button class="tile-item' + active + '" draggable="true" data-tile-id="' + escapeHtml(tile.id) + '">' +
        '<span><div class="tile-main">' + escapeHtml(tile.label) + '</div><div class="tile-sub">' + escapeHtml(tile.icon) + ' • ' + escapeHtml(tile.actionType) + (tile.actionValue ? (' • ' + escapeHtml(tile.actionValue)) : '') + ' • ' + tile.spanCols + 'x' + tile.spanRows + '</div></span>' +
        '<span class="tile-sub">#' + (tile.order + 1) + '</span>' +
      '</button>';
    })
    .join("");
  list.innerHTML = items || '<div class="muted">No tiles yet. Create your first tile.</div>';
  list.querySelectorAll("[data-tile-id]").forEach((button) => {
    const tileId = button.getAttribute("data-tile-id");
    if (!tileId) {
      return;
    }

    button.addEventListener("click", () => {
      selectTile(tileId);
    });

    button.addEventListener("dragstart", (event) => {
      draggedTileId = tileId;
      event.dataTransfer?.setData("text/plain", tileId);
    });

    button.addEventListener("dragover", (event) => {
      event.preventDefault();
      button.classList.add("drag-over");
    });

    button.addEventListener("dragleave", () => {
      button.classList.remove("drag-over");
    });

    button.addEventListener("drop", async (event) => {
      event.preventDefault();
      button.classList.remove("drag-over");
      const sourceId = draggedTileId || event.dataTransfer?.getData("text/plain");
      if (!sourceId || sourceId === tileId) {
        return;
      }
      await applyReorder(sourceId, tileId);
    });

    button.addEventListener("dragend", () => {
      draggedTileId = null;
      list.querySelectorAll(".tile-item").forEach((node) => node.classList.remove("drag-over"));
    });
  });

  document.getElementById("dirty").textContent = dashboard.isDirty ? "yes" : "no";
  document.getElementById("saved").textContent = dashboard.lastSavedAt || "never";
}

function renderPreview(payload) {
  document.getElementById("preview-json").textContent = JSON.stringify(payload, null, 2);
}

function renderHistory(rows) {
  const body = document.getElementById("history-body");
  body.innerHTML = rows.length
    ? rows.map((h) => "<tr><td>" + escapeHtml(h.ts) + "</td><td>" + escapeHtml(h.deviceId) + "</td><td>" + escapeHtml(h.actionType) + "</td><td>" + escapeHtml(h.status) + "</td><td>" + escapeHtml(h.detail) + "</td></tr>").join("")
    : '<tr><td colspan="5">No action history yet</td></tr>';
}

function setForm(tile) {
  document.getElementById("tile-label").value = tile ? tile.label : "";
  document.getElementById("tile-icon").value = tile ? tile.icon : "";
  document.getElementById("tile-image").value = tile ? (tile.imageUrl || "") : "";
  document.getElementById("tile-cols").value = tile ? String(tile.spanCols || 2) : "2";
  document.getElementById("tile-rows").value = tile ? String(tile.spanRows || 1) : "1";
  const actionType = tile ? tile.actionType : "open_url";
  document.getElementById("tile-action").value = actionType;
  document.getElementById("tile-target").value = tile ? (tile.actionValue || "") : defaultTargetForAction(actionType);
  syncTargetUi();
  renderIconPicker();
}

function defaultTargetForAction(actionType) {
  if (actionType === "open_url") {
    return "https://example.com";
  }
  if (actionType === "open_app") {
    return "notepad.exe";
  }
  return "";
}

function syncTargetUi() {
  const actionType = document.getElementById("tile-action").value;
  const targetLabel = document.getElementById("tile-target-label");
  const targetInput = document.getElementById("tile-target");
  if (actionType === "open_url") {
    targetLabel.textContent = "Target URL";
    targetInput.placeholder = "https://example.com";
    targetInput.disabled = false;
  } else if (actionType === "open_app") {
    targetLabel.textContent = "Application Command";
    targetInput.placeholder = "notepad.exe";
    targetInput.disabled = false;
  } else {
    targetLabel.textContent = "No target needed";
    targetInput.placeholder = "media action has no target";
    targetInput.disabled = true;
    targetInput.value = "";
  }
}

function syncCanvasPayloadTargetUi() {
  const actionType = document.getElementById("canvas-payload-action").value;
  const targetLabel = document.getElementById("canvas-payload-target-label");
  const targetInput = document.getElementById("canvas-payload-target");

  if (actionType === "open_url") {
    targetLabel.textContent = "Target URL";
    targetInput.placeholder = "https://example.com";
    targetInput.disabled = false;
  } else if (actionType === "open_app") {
    targetLabel.textContent = "Application Command";
    targetInput.placeholder = "notepad.exe";
    targetInput.disabled = false;
  } else {
    targetLabel.textContent = "No target needed";
    targetInput.placeholder = "Action has no target";
    targetInput.disabled = true;
    targetInput.value = "";
  }
}

function renderCanvasImagePreview() {
  const preview = document.getElementById("canvas-image-preview");
  const imageUrl = document.getElementById("canvas-payload-image").value.trim();
  if (!imageUrl) {
    preview.innerHTML = "<span>No image selected</span>";
    return;
  }

  preview.innerHTML = '<img src="' + escapeHtml(imageUrl) + '" alt="tile image preview"/>';
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(new Error("image_read_failed"));
    };
    reader.readAsDataURL(file);
  });
}

function readCanvasPayloadForm() {
  const actionType = document.getElementById("canvas-payload-action").value;
  const rawTarget = document.getElementById("canvas-payload-target").value.trim();
  const actionValue = (actionType === "open_url" || actionType === "open_app") ? rawTarget : "";
  return {
    label: document.getElementById("canvas-payload-label").value.trim() || "Untitled Tile",
    icon: document.getElementById("canvas-payload-icon").value.trim() || "⭐",
    imageUrl: document.getElementById("canvas-payload-image").value.trim(),
    actionType,
    actionValue,
    spanCols: normalizeTileSpan(document.getElementById("canvas-payload-cols").value, 2),
    spanRows: normalizeTileSpan(document.getElementById("canvas-payload-rows").value, 1),
  };
}

function renderCanvasPayloadPanel(forceOpen = false) {
  const panel = document.getElementById("canvas-payload-panel");
  const hint = document.getElementById("canvas-payload-hint");
  const fields = document.getElementById("canvas-payload-fields");
  const tile = selectedTile();

  if (forceOpen) {
    mirrorPayloadPanelClosed = false;
  }

  if (!tile) {
    panel.classList.remove("visible");
    hint.textContent = "Select a tile in the handset mirror canvas to edit payload fields here.";
    fields.style.display = "none";
    return;
  }

  fields.style.display = "block";
  hint.textContent = "Editing " + tile.label + " (" + tile.id + ")";
  document.getElementById("canvas-payload-label").value = tile.label || "";
  document.getElementById("canvas-payload-icon").value = tile.icon || "⭐";
  document.getElementById("canvas-payload-image").value = tile.imageUrl || "";
  document.getElementById("canvas-payload-image-file").value = "";
  document.getElementById("canvas-payload-action").value = tile.actionType || "open_url";
  document.getElementById("canvas-payload-target").value = tile.actionValue || "";
  document.getElementById("canvas-payload-cols").value = String(normalizeTileSpan(tile.spanCols, 2));
  document.getElementById("canvas-payload-rows").value = String(normalizeTileSpan(tile.spanRows, 1));
  syncCanvasPayloadTargetUi();
  renderCanvasImagePreview();
  if (mirrorPayloadPanelClosed) {
    panel.classList.remove("visible");
  } else {
    panel.classList.add("visible");
  }
}

async function applyCanvasPayloadUpdate() {
  const tile = selectedTile();
  if (!tile) {
    setMessage("Select a tile in canvas first.");
    return;
  }

  const body = readCanvasPayloadForm();
  await patchTile(tile.id, body, "Updated tile from mirror payload editor.");
  renderCanvasPayloadPanel(true);
}

async function createTileFromCanvasPanel() {
  const body = readCanvasPayloadForm();
  const resp = await fetch("/dashboard/tiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await resp.json();
  if (resp.status >= 400) {
    throw new Error(payload.reason || String(resp.status));
  }
  dashboard = payload.dashboard;
  selectedTileId = payload.tile.id;
  setMessage("Created tile from mirror payload editor.");
  renderTileList();
  renderLayoutCanvas();
  renderCanvasPayloadPanel(true);
  await refreshPreview();
}

function selectTile(id) {
  selectedTileId = id;
  const tile = selectedTile();
  setForm(tile);
  setMessage(tile ? "Editing " + tile.label + " (" + tile.id + ")" : "Tile not found.");
  renderTileList();
  renderLayoutCanvas();
  renderCanvasPayloadPanel(true);
}

async function refreshDashboard() {
  const next = await fetch("/dashboard").then((r) => r.json());
  dashboard = next;
  if (selectedTileId && !selectedTile()) {
    selectedTileId = null;
  }
  renderTileList();
  renderLayoutCanvas();
  renderCanvasPayloadPanel();
}

async function refreshPreview() {
  const payload = await fetch("/preview").then((r) => r.json());
  renderPreview(payload);
}

async function refreshHistory() {
  const history = await fetch("/history").then((r) => r.json());
  renderHistory(history.items || []);
}

function readForm() {
  const actionType = document.getElementById("tile-action").value;
  const actionValue = document.getElementById("tile-target").value.trim();
  const spanCols = Number(document.getElementById("tile-cols").value || 2);
  const spanRows = Number(document.getElementById("tile-rows").value || 1);
  return {
    label: document.getElementById("tile-label").value.trim() || "Untitled Tile",
    icon: document.getElementById("tile-icon").value.trim() || "⭐",
    imageUrl: document.getElementById("tile-image").value.trim(),
    actionType,
    actionValue,
    spanCols,
    spanRows,
  };
}

async function createTile() {
  const body = readForm();
  const resp = await fetch("/dashboard/tiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await resp.json();
  dashboard = payload.dashboard;
  selectedTileId = payload.tile.id;
  setForm(payload.tile);
  setMessage("Created tile: " + payload.tile.label);
  renderTileList();
  renderLayoutCanvas();
  renderCanvasPayloadPanel();
  await refreshPreview();
}

async function updateSelectedTile() {
  const tile = selectedTile();
  if (!tile) {
    setMessage("Select a tile first.");
    return;
  }
  const body = readForm();
  const resp = await fetch("/dashboard/tiles/" + tile.id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (resp.status >= 400) {
    const fail = await resp.json();
    setMessage("Update failed: " + (fail.reason || resp.status));
    return;
  }
  const payload = await resp.json();
  dashboard = payload.dashboard;
  selectedTileId = payload.tile.id;
  setMessage("Updated tile: " + payload.tile.label);
  renderTileList();
  renderLayoutCanvas();
  renderCanvasPayloadPanel();
  await refreshPreview();
}

async function deleteSelectedTile() {
  const tile = selectedTile();
  if (!tile) {
    setMessage("Select a tile first.");
    return;
  }
  await fetch("/dashboard/tiles/" + tile.id, { method: "DELETE" });
  selectedTileId = null;
  setForm(null);
  setMessage("Deleted tile: " + tile.label);
  await refreshDashboard();
  renderCanvasPayloadPanel();
  await refreshPreview();
}

async function reverseOrder() {
  const ids = dashboard.tiles.slice().sort((a, b) => a.order - b.order).map((t) => t.id).reverse();
  await fetch("/dashboard/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  setMessage("Reordered tiles in reverse.");
  await refreshDashboard();
  await refreshPreview();
}

async function saveLayout() {
  await fetch("/dashboard/save", { method: "POST" });
  setMessage("Layout saved.");
  await refreshDashboard();
  await refreshPreview();
}

async function manualRefresh() {
  await refreshDashboard();
  await refreshPreview();
  await refreshHistory();
  setMessage("Refreshed dashboard, preview, and history.");
}

async function hydrate() {
  document.getElementById("conn").textContent = "${state.connection}";
  renderCanvasThemeOptions();
  renderTileList();
  renderLayoutCanvas();
  renderIconPicker();
  renderHistory(BOOT_HISTORY);
  await refreshDashboard();
  await refreshPreview();
  await refreshHistory();
  setForm(null);
  renderCanvasPayloadPanel();
  document.getElementById("canvas-theme").addEventListener("change", (event) => {
    const next = event.target.value;
    if (!TILE_THEMES[next]) {
      return;
    }
    activeCanvasThemeId = next;
    localStorage.setItem(BUILDER_THEME_KEY, next);
    setMessage("Preview theme: " + TILE_THEMES[next].name);
    renderLayoutCanvas();
  });
  document.getElementById("tile-action").addEventListener("change", syncTargetUi);
  document.getElementById("tile-icon").addEventListener("input", renderIconPicker);
  document.getElementById("canvas-payload-action").addEventListener("change", syncCanvasPayloadTargetUi);
  document.getElementById("canvas-payload-image").addEventListener("input", renderCanvasImagePreview);
  document.getElementById("canvas-payload-image-file").addEventListener("change", (event) => {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) {
      return;
    }
    readImageFileAsDataUrl(file)
      .then((dataUrl) => {
        document.getElementById("canvas-payload-image").value = dataUrl;
        renderCanvasImagePreview();
      })
      .catch((error) => {
        setMessage("Image load failed: " + error.message);
      });
  });
  document.getElementById("canvas-payload-apply").addEventListener("click", () => {
    applyCanvasPayloadUpdate().catch((error) => {
      setMessage("Canvas payload update failed: " + error.message);
    });
  });
  document.getElementById("canvas-payload-reset").addEventListener("click", () => {
    renderCanvasPayloadPanel(true);
  });
  document.getElementById("canvas-payload-close").addEventListener("click", () => {
    mirrorPayloadPanelClosed = true;
    document.getElementById("canvas-payload-panel").classList.remove("visible");
  });
  document.getElementById("canvas-create-tile").addEventListener("click", () => {
    createTileFromCanvasPanel().catch((error) => {
      setMessage("Create failed: " + error.message);
    });
  });
  document.getElementById("canvas-delete-tile").addEventListener("click", () => {
    deleteSelectedTile().catch((error) => {
      setMessage("Delete failed: " + error.message);
    });
  });
  document.getElementById("canvas-save-layout").addEventListener("click", () => {
    saveLayout().catch((error) => {
      setMessage("Save failed: " + error.message);
    });
  });
  window.addEventListener("mousemove", onResizeMove);
  window.addEventListener("mouseup", () => {
    onResizeEnd().catch((error) => {
      setMessage("Resize failed: " + error.message);
    });
  });
  setInterval(() => {
    refreshHistory().catch(() => {});
  }, 2000);
}

hydrate().catch((err) => {
  setMessage("Failed to load builder: " + err.message);
});
</script>
</body></html>`;
      sendHtml(res, html);
      return;
    }

    sendJson(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error.message || error) });
  }
});

function startServer() {
  server.listen(PORT, "0.0.0.0", () => {
    const network = networkSnapshot();
    logEvent("server", `Desktop runtime listening on ${PORT}`);
    console.log(`[desktop-runtime] listening on http://0.0.0.0:${PORT}`);
    for (const url of network.lanUrls) {
      console.log(`[desktop-runtime] lan url ${url}`);
    }
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  ACCESSIBILITY_VERIFICATION_ROUTE,
  BUILDER_SURFACE_CONTROL_IDS,
  getAccessibilityVerificationPrerequisite,
  startServer,
  server,
};
