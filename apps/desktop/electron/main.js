const { app, BrowserWindow, Menu, Tray, nativeImage, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");

const SERVER_URL = process.env.DESKTOP_SERVER_URL || "http://127.0.0.1:8787";
const SERVER_ENTRY = "/verify/builder-accessibility";
const SERVER_HEALTH = "/health";
const HEALTH_RETRY_MS = 250;
const HEALTH_TIMEOUT_MS = 15_000;

let embeddedServer = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;

function pingServer() {
  return new Promise((resolve) => {
    const url = new URL(SERVER_HEALTH, SERVER_URL);
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(1200, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForServerReady() {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= HEALTH_TIMEOUT_MS) {
    if (await pingServer()) {
      return true;
    }
    await wait(HEALTH_RETRY_MS);
  }

  return false;
}

function spawnEmbeddedServer() {
  if (embeddedServer) {
    return;
  }

  const serverScript = path.resolve(__dirname, "..", "server.js");
  embeddedServer = spawn(process.execPath, [serverScript], {
    cwd: path.resolve(__dirname, "..", "..", ".."),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
    windowsHide: true,
  });

  embeddedServer.once("exit", () => {
    embeddedServer = null;
  });
}

function stopEmbeddedServer() {
  if (!embeddedServer) {
    return;
  }

  const child = embeddedServer;
  embeddedServer = null;
  child.kill();
}

function createTrayIcon() {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAPElEQVR4AWNgoBAwUqifgYGBkYHhP4NQIwMDA8P///8YGBgY/oeJQYJkYGBg+P//PwMDA8P///8ZGBhGAAAtNQ1fylh4ZwAAAABJRU5ErkJggg=="
  );
  return icon;
}

function showMainWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
}

function hideMainWindow() {
  if (!mainWindow) {
    return;
  }
  mainWindow.hide();
}

function createTray() {
  if (tray) {
    return;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("PC Remote Control Studio");

  const menu = Menu.buildFromTemplate([
    {
      label: "Open PC Remote",
      click: () => showMainWindow(),
    },
    {
      label: "Hide Window",
      click: () => hideMainWindow(),
    },
    {
      label: "Reload",
      click: () => {
        if (mainWindow) {
          mainWindow.reload();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isVisible()) {
      mainWindow.hide();
      return;
    }
    showMainWindow();
  });
}

function destroyTray() {
  if (!tray) {
    return;
  }
  tray.destroy();
  tray = null;
}

async function ensureServerReady() {
  if (await pingServer()) {
    return;
  }

  spawnEmbeddedServer();

  const ready = await waitForServerReady();
  if (!ready) {
    throw new Error("Desktop runtime failed to start within timeout");
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    title: "PC Remote Control Studio",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.resolve(__dirname, "preload.js"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const entryUrl = new URL(SERVER_ENTRY, SERVER_URL).toString();
  mainWindow.loadURL(entryUrl);
}

app.whenReady().then(async () => {
  try {
    await ensureServerReady();
  } catch (error) {
    console.error(String(error));
    app.quit();
    return;
  }

  createMainWindow();
  createTray();

  app.on("activate", () => {
    if (!mainWindow) {
      createMainWindow();
      return;
    }

    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  // Keep app alive in tray.
});

app.on("before-quit", () => {
  isQuitting = true;
  destroyTray();
  stopEmbeddedServer();
});
