const http = require("node:http");

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
      },
      {
        id: "tile-2",
        order: 1,
        label: "Music",
        icon: "music_note",
        actionType: "media_play_pause",
      },
    ],
  },
};

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
      const id = `tile-${Date.now()}`;
      const tile = {
        id,
        order: state.dashboard.tiles.length,
        label: String(body.label || `Tile ${state.dashboard.tiles.length + 1}`),
        icon: String(body.icon || "apps"),
        actionType: String(body.actionType || "open_url"),
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
      const actionType = String(body.actionType || "");

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

      const success = logAction(deviceId, actionType, "success", "executed_in_test_runtime");
      state.lastReason = `action:${actionType}`;
      logEvent("action", `Action executed: ${actionType}`);
      sendJson(res, 200, {
        ok: true,
        lifecycle: ["received", "running", "success"],
        action: success,
      });
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/panel" || url.pathname === ACCESSIBILITY_VERIFICATION_ROUTE)
    ) {
      const prerequisite = getAccessibilityVerificationPrerequisite();
      const tilesMarkup = dashboardSnapshot()
        .tiles.map((t) => `<li>${t.order + 1}. ${t.label} (${t.actionType}) [${t.id}]</li>`)
        .join("");
      const rows = state.actionHistory
        .map(
          (h) =>
            `<tr><td>${h.ts}</td><td>${h.deviceId}</td><td>${h.actionType}</td><td>${h.status}</td><td>${h.detail}</td></tr>`,
        )
        .join("");
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>Desktop Control Panel</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}th{background:#f4f4f4;text-align:left}.meta{margin-bottom:16px}.controls button{margin-right:8px;margin-bottom:8px}code{background:#f4f4f4;padding:2px 4px;border-radius:3px}</style>
</head><body>
<h2>Desktop Control Panel (Test)</h2>
<div class="meta"><b>Accessibility verification route:</b> <code>${prerequisite.route}</code></div>
<div class="meta">${prerequisite.guidance}</div>
<div class="meta">Connection: <b>${state.connection}</b> | Active Host: <b>${state.lastHost}</b> | Trusted: <b>${state.paired ? "yes" : "no"}</b></div>
<h3>Dashboard Builder</h3>
<div class="meta">Dirty: <b>${state.dashboard.isDirty ? "yes" : "no"}</b> | Last Saved: <b>${state.dashboard.lastSavedAt || "never"}</b></div>
<div class="controls">
  <button id="create-tile" data-builder-control="create" onclick="createTile()">Create Tile</button>
  <button id="edit-first-tile" data-builder-control="edit" onclick="editFirstTile()">Edit First Tile</button>
  <button id="reorder-tiles" data-builder-control="reorder" onclick="reverseOrder()">Reorder Reverse</button>
  <button id="delete-last-tile" data-builder-control="delete" onclick="deleteLastTile()">Delete Last Tile</button>
  <button id="save-layout" data-builder-control="save" onclick="saveLayout()">Save Layout</button>
  <button onclick="refreshPanel()">Refresh</button>
</div>
<ul>${tilesMarkup || "<li>No tiles</li>"}</ul>

<h3>Live Preview Payload</h3>
<div class="meta">GET <code>/preview</code> reflects current tile order for mobile.</div>

<h3>Action History</h3>
<table>
<thead><tr><th>Timestamp</th><th>Device</th><th>Action</th><th>Status</th><th>Detail</th></tr></thead>
<tbody>${rows || "<tr><td colspan='5'>No action history yet</td></tr>"}</tbody>
</table>
<script>
async function createTile() {
  await fetch('/dashboard/tiles', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ label:'New Tile', icon:'bolt', actionType:'open_url' }) });
  location.reload();
}
async function editFirstTile() {
  const dash = await fetch('/dashboard').then(r => r.json());
  if (!dash.tiles.length) return;
  const first = dash.tiles[0];
  await fetch('/dashboard/tiles/' + first.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ label: first.label + ' *' }) });
  location.reload();
}
async function reverseOrder() {
  const dash = await fetch('/dashboard').then(r => r.json());
  const ids = dash.tiles.map(t => t.id).reverse();
  await fetch('/dashboard/reorder', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids }) });
  location.reload();
}
async function deleteLastTile() {
  const dash = await fetch('/dashboard').then(r => r.json());
  if (!dash.tiles.length) return;
  const last = dash.tiles[dash.tiles.length - 1];
  await fetch('/dashboard/tiles/' + last.id, { method:'DELETE' });
  location.reload();
}
async function saveLayout() {
  await fetch('/dashboard/save', { method:'POST' });
  location.reload();
}
function refreshPanel() { location.reload(); }
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
