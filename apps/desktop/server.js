const http = require("node:http");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.PORT || 8787);
const ACCESSIBILITY_VERIFICATION_ROUTE = "/verify/builder-accessibility";
const BUILDER_SURFACE_CONTROL_IDS = [
  "create-tile",
  "edit-first-tile",
  "reorder-tiles",
  "delete-last-tile",
  "save-layout",
];

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
        icon: "language",
        actionType: "open_url",
        actionValue: "https://example.com",
      },
      {
        id: "tile-2",
        order: 1,
        label: "Music",
        icon: "music_note",
        actionType: "media_play_pause",
        actionValue: "",
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
    .map((tile, index) => ({ ...tile, order: index }));
}

function dashboardSnapshot() {
  normalizeTiles();
  return {
    isDirty: state.dashboard.isDirty,
    lastSavedAt: state.dashboard.lastSavedAt,
    tiles: state.dashboard.tiles,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Payload too large"));
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

async function executeDesktopAction(actionType, actionValue) {
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
    const target = String(actionValue || "").trim();
    if (!target) {
      return { ok: false, detail: "missing_app_target" };
    }
    return launchDetached(target, []);
  }

  if (actionType === "media_play_pause") {
    if (process.platform !== "win32") {
      return { ok: false, detail: "unsupported_platform" };
    }
    return launchDetached("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('{MEDIA_PLAY_PAUSE}')",
    ]);
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
        icon: String(body.icon || "apps"),
        actionType,
        actionValue: String(body.actionValue || defaultActionValue(actionType)),
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
      tile.actionType = String(body.actionType || tile.actionType);
      tile.actionValue = String(
        body.actionValue === undefined ? tile.actionValue : body.actionValue,
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

      if (!["media_play_pause", "open_url", "open_app"].includes(actionType)) {
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
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/panel" || url.pathname === ACCESSIBILITY_VERIFICATION_ROUTE)
    ) {
      const prerequisite = getAccessibilityVerificationPrerequisite();
      const bootDashboard = JSON.stringify(dashboardSnapshot());
      const bootHistory = JSON.stringify(state.actionHistory);
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>PC Remote Builder</title>
<style>
:root{--bg:#f4f6fb;--panel:#ffffff;--text:#0f172a;--muted:#475569;--line:#dbe2ea;--accent:#0ea5e9;--accent-soft:#e0f2fe;--danger:#dc2626;--ok:#16a34a;--shadow:0 10px 30px rgba(15,23,42,.08)}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",Arial,sans-serif;background:linear-gradient(180deg,#f8fbff,#f4f6fb);color:var(--text)}
.shell{max-width:1200px;margin:0 auto;padding:24px}
.top{display:flex;gap:16px;align-items:center;justify-content:space-between;margin-bottom:20px}
.title h1{font-size:26px;margin:0 0 6px}
.title p{margin:0;color:var(--muted)}
.badge{display:inline-block;background:var(--accent-soft);color:#0369a1;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600}
.status{display:flex;gap:10px;flex-wrap:wrap}
.pill{background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:13px}
.grid{display:grid;grid-template-columns:1.1fr 1.3fr;gap:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:16px}
.card h2{margin:0 0 14px;font-size:18px}
.muted{color:var(--muted);font-size:13px}
.list{display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto}
.tile-item{display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;border:1px solid var(--line);border-radius:10px;background:#fff;padding:10px 12px;cursor:pointer}
.tile-item:hover{border-color:#bae6fd;background:#f8fcff}
.tile-item.active{border-color:var(--accent);background:#f0f9ff}
.tile-main{font-weight:600}
.tile-sub{font-size:12px;color:var(--muted)}
label{display:block;font-size:13px;color:var(--muted);margin-bottom:6px}
input,select{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14px}
input:focus,select:focus,button:focus{outline:3px solid rgba(14,165,233,.2);outline-offset:1px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
button{border:0;border-radius:10px;padding:10px 12px;font-weight:600;cursor:pointer;background:#e2e8f0;color:#0f172a}
button.primary{background:var(--accent);color:#fff}
button.danger{background:#fee2e2;color:#991b1b}
button.ghost{background:#f8fafc;border:1px solid var(--line)}
.meta{margin-top:10px;font-size:13px;color:var(--muted)}
pre{background:#0b1220;color:#e2e8f0;border-radius:10px;padding:12px;overflow:auto;font-size:12px;max-height:250px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left}
th{color:var(--muted);font-weight:600}
@media (max-width: 900px){.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
</style>
</head><body>
<div class="shell">
  <div class="top">
    <div class="title">
      <span class="badge">Builder Surface</span>
      <h1>Desktop Dashboard Builder</h1>
      <p>Create, edit, reorder, and save mobile control tiles with live preview.</p>
    </div>
    <div class="status">
      <div class="pill">Connection: <b id="conn">${state.connection}</b></div>
      <div class="pill">Host: <b>${state.lastHost}</b></div>
      <div class="pill">Trusted: <b>${state.paired ? "yes" : "no"}</b></div>
    </div>
  </div>

  <div class="grid">
    <section class="card">
      <h2>Tiles</h2>
      <div class="muted">Select a tile to edit. Keyboard: Tab to controls, Enter to activate.</div>
      <div id="tile-list" class="list" aria-label="tile list"></div>
      <div class="actions" style="margin-top:12px">
        <button id="reorder-tiles" data-builder-control="reorder" onclick="reverseOrder()">Reverse Order</button>
        <button class="ghost" onclick="refreshDashboard()">Refresh</button>
      </div>
      <div class="meta">Dirty: <b id="dirty">no</b> | Last Saved: <b id="saved">never</b></div>
    </section>

    <section class="card">
      <h2>Tile Editor</h2>
      <div class="row">
        <div>
          <label for="tile-label">Label</label>
          <input id="tile-label" type="text" placeholder="e.g. Spotify"/>
        </div>
        <div>
          <label for="tile-icon">Icon</label>
          <input id="tile-icon" type="text" placeholder="e.g. music_note"/>
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

      <div class="actions">
        <button id="create-tile" data-builder-control="create" class="primary" onclick="createTile()">Create Tile</button>
        <button id="edit-first-tile" data-builder-control="edit" onclick="updateSelectedTile()">Update Selected</button>
        <button id="delete-last-tile" data-builder-control="delete" class="danger" onclick="deleteSelectedTile()">Delete Selected</button>
        <button id="save-layout" data-builder-control="save" class="primary" onclick="saveLayout()">Save Layout</button>
      </div>

      <div class="meta" id="editor-message">No tile selected yet. Select one from the left or create a new tile.</div>
    </section>

    <section class="card" style="grid-column:1 / -1">
      <h2>Live Preview Payload</h2>
      <div class="muted">What the mobile app reads from <code>/preview</code>.</div>
      <pre id="preview-json"></pre>
    </section>

    <section class="card" style="grid-column:1 / -1">
      <h2>Action History</h2>
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
const BOOT_DASHBOARD = ${bootDashboard};
const BOOT_HISTORY = ${bootHistory};

let dashboard = BOOT_DASHBOARD;
let selectedTileId = null;

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

function selectedTile() {
  return dashboard.tiles.find((t) => t.id === selectedTileId) || null;
}

function renderTileList() {
  const list = document.getElementById("tile-list");
  const items = dashboard.tiles
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((tile) => {
      const active = tile.id === selectedTileId ? " active" : "";
      return '<button class="tile-item' + active + '" data-tile-id="' + escapeHtml(tile.id) + '">' +
        '<span><div class="tile-main">' + escapeHtml(tile.label) + '</div><div class="tile-sub">' + escapeHtml(tile.icon) + ' • ' + escapeHtml(tile.actionType) + (tile.actionValue ? (' • ' + escapeHtml(tile.actionValue)) : '') + '</div></span>' +
        '<span class="tile-sub">#' + (tile.order + 1) + '</span>' +
      '</button>';
    })
    .join("");
  list.innerHTML = items || '<div class="muted">No tiles yet. Create your first tile.</div>';
  list.querySelectorAll("[data-tile-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-tile-id");
      if (id) {
        selectTile(id);
      }
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
  const actionType = tile ? tile.actionType : "open_url";
  document.getElementById("tile-action").value = actionType;
  document.getElementById("tile-target").value = tile ? (tile.actionValue || "") : defaultTargetForAction(actionType);
  syncTargetUi();
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

function selectTile(id) {
  selectedTileId = id;
  const tile = selectedTile();
  setForm(tile);
  setMessage(tile ? "Editing " + tile.label + " (" + tile.id + ")" : "Tile not found.");
  renderTileList();
}

async function refreshDashboard() {
  const next = await fetch("/dashboard").then((r) => r.json());
  dashboard = next;
  if (selectedTileId && !selectedTile()) {
    selectedTileId = null;
  }
  renderTileList();
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
  return {
    label: document.getElementById("tile-label").value.trim() || "Untitled Tile",
    icon: document.getElementById("tile-icon").value.trim() || "apps",
    actionType,
    actionValue,
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
  renderTileList();
  renderHistory(BOOT_HISTORY);
  await refreshDashboard();
  await refreshPreview();
  await refreshHistory();
  if (dashboard.tiles.length) {
    selectTile(dashboard.tiles[0].id);
  } else {
    setForm(null);
  }
  document.getElementById("tile-action").addEventListener("change", syncTargetUi);
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
    logEvent("server", `Desktop runtime listening on ${PORT}`);
    console.log(`[desktop-runtime] listening on http://0.0.0.0:${PORT}`);
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
