const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  protocol,
  net,
  screen,
  Menu,
  nativeImage,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const { Library } = require("./library.cjs");
const { Speech } = require("./speech.cjs");
const { Models } = require("./models.cjs");
const { CloudFiles } = require("./cloud-files.cjs");

app.setName("Books+");
app.setPath(
  "userData",
  process.env.READER_USER_DATA ||
    path.join(app.getPath("appData"), "icloud-books-reader"),
);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "reader-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let main,
  overlay,
  library,
  speech,
  overlayState = {},
  locked = false;
const files = new Map();
function media(file) {
  const token = crypto.createHash("sha256").update(file).digest("hex");
  files.set(token, file);
  return `reader-media://audio/${token}`;
}
function load(win, hash = "") {
  if (process.env.READER_DEV_URL)
    win.loadURL(process.env.READER_DEV_URL + (hash ? "/#" + hash : ""));
  else win.loadFile(path.join(__dirname, "../dist/index.html"), { hash });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (url.split("#")[0] !== win.webContents.getURL().split("#")[0])
      event.preventDefault();
  });
}
function createMain() {
  main = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 780,
    minHeight: 560,
    title: "Books+",
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#ffffff",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  load(main);
  let closeAllowed = false;
  let closeTimer;
  main.on("close", (event) => {
    if (closeAllowed) return;
    event.preventDefault();
    main.webContents.send("app:flush");
    if (!closeTimer)
      closeTimer = setTimeout(() => {
        closeAllowed = true;
        main?.close();
      }, 2000);
  });
  main.finishClose = () => {
    clearTimeout(closeTimer);
    closeAllowed = true;
    main?.close();
  };
  main.once("ready-to-show", () => main.show());
  main.on("closed", () => {
    main = null;
    overlay?.close();
  });
}
function setLocked(value) {
  locked = !!value;
  overlay?.setIgnoreMouseEvents(locked, { forward: true });
  overlay?.webContents.send("overlay:locked", locked);
  main?.webContents.send("overlay:locked", locked);
}
function showOverlay(show = true) {
  if (!show) {
    overlay?.hide();
    main?.webContents.send("overlay:visibility", false);
    return false;
  }
  if (!overlay || overlay.isDestroyed()) {
    const area = screen.getPrimaryDisplay().workArea;
    const saved = library.config.settings?.overlayBounds;
    const bounds =
      saved &&
      screen
        .getAllDisplays()
        .some(
          (d) =>
            saved.x + saved.width > d.workArea.x &&
            saved.x < d.workArea.x + d.workArea.width &&
            saved.y + saved.height > d.workArea.y &&
            saved.y < d.workArea.y + d.workArea.height,
        )
        ? saved
        : {
            x: Math.round(area.x + (area.width - 860) / 2),
            y: area.y + area.height - 220,
            width: 860,
            height: 170,
          };
    overlay = new BrowserWindow({
      ...bounds,
      minWidth: 360,
      minHeight: 100,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    overlay.setAlwaysOnTop(true, "screen-saver");
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    load(overlay, "overlay");
    overlay.once("ready-to-show", () => {
      overlay.showInactive();
      setLocked(locked);
      overlay.webContents.send("overlay:update", overlayState);
    });
    let timer;
    const remember = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (overlay && !overlay.isDestroyed())
          library
            .settings({ overlayBounds: overlay.getBounds() })
            .catch(() => {});
      }, 500);
    };
    overlay.on("move", remember);
    overlay.on("resize", remember);
    overlay.on("closed", () => {
      clearTimeout(timer);
      overlay = null;
      main?.webContents.send("overlay:visibility", false);
    });
  } else overlay.showInactive();
  main?.webContents.send("overlay:visibility", true);
  return true;
}
function handle(channel, fn, overlayAllowed = false) {
  ipcMain.handle(channel, (event, ...args) => {
    if (
      event.sender !== main?.webContents &&
      !(overlayAllowed && event.sender === overlay?.webContents)
    )
      throw Error("不允许此窗口执行该操作");
    return fn(...args);
  });
}
app.whenReady().then(async () => {
  const userDir = app.getPath("userData");
  await fs.mkdir(userDir, { recursive: true });
  const cloudScript = path.join(userDir, "cloud-files.ps1");
  await fs.copyFile(path.join(__dirname, "cloud-files.ps1"), cloudScript);
  library = await new Library(userDir, {
    cloud: new CloudFiles(cloudScript),
  }).init();
  if (process.env.READER_LIBRARY_ROOT)
    await library.configure(process.env.READER_LIBRARY_ROOT);
  const workerFile = path.join(app.getPath("userData"), "native-speech.ps1");
  await fs.writeFile(
    workerFile,
    await fs.readFile(path.join(__dirname, "native-speech.ps1")),
  );
  const models = new Models(
    process.env.READER_MODELS_DIR ||
      path.join(
        process.platform === "win32"
          ? process.env.LOCALAPPDATA || app.getPath("userData")
          : app.getPath("userData"),
        "BooksReader",
        "models",
      ),
    (progress) => main?.webContents.send("models:progress", progress),
  );
  speech = new Speech(
    path.join(app.getPath("userData"), "speech-cache"),
    workerFile,
    models,
  );
  speech.prune().catch(() => {});
  protocol.handle("reader-media", (request) => {
    const file = files.get(new URL(request.url).pathname.slice(1));
    return file
      ? net.fetch(pathToFileURL(file).toString(), { headers: request.headers })
      : new Response("Not found", { status: 404 });
  });
  handle("library:load", () => library.load());
  handle("library:choose", async () => {
    const result = await dialog.showOpenDialog(main, {
      title: "选择云端书库文件夹（Books Export 或新文件夹）",
      properties: ["openDirectory"],
    });
    return result.canceled ? null : library.configure(result.filePaths[0]);
  });
  handle("book:read", (id) => library.read(id));
  handle("library:import", async () => {
    const { BUILTIN, CALIBRE } = require("./formats.cjs");
    const result = await dialog.showOpenDialog(main, {
      title: "加入图书到云端书库",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "电子书与文档", extensions: [...BUILTIN, ...CALIBRE] }],
    });
    return result.canceled ? null : library.import(result.filePaths);
  });
  handle(
    "formats:info",
    () =>
      library.formats?.info(library.config.settings?.formats?.calibrePath) ||
      new (require("./formats.cjs").Formats)("").info(),
  );
  handle("formats:pick", async () => {
    const result = await dialog.showOpenDialog(main, {
      title: "选择 Calibre ebook-convert 程序",
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle("formats:download", () =>
    shell.openExternal("https://calibre-ebook.com/download"),
  );
  handle("book:closed", (id) => library.closed(id));
  handle("book:offline", (id, keep) => library.offline(id, !!keep));
  handle("book:release", (id) => library.release(id));
  handle("storage:sweep", () => library.sweep());
  handle("models:list", () => models.list());
  handle("models:install", (id) => models.install(id));
  handle("models:cancel", (id) => models.cancel(id));
  handle("models:remove", (id) => models.remove(id));
  handle("models:page", (id, kind) => {
    const model = require("./model-catalog.cjs").MODELS.find(
      (m) => m.id === id,
    );
    if (!model || !["source", "license"].includes(kind))
      throw Error("未知模型页面");
    return shell.openExternal(
      kind === "source" ? model.source : model.licenseUrl,
    );
  });
  handle("reader:capture", async (rect) => {
    const bounds = main.getContentBounds();
    const { x, y, width, height } = rect || {};
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width < 1 ||
      height < 1 ||
      x + width > bounds.width + 1 ||
      y + height > bounds.height + 1
    )
      throw Error("无效的阅读区域");
    return (
      await main.webContents.capturePage({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      })
    ).toDataURL();
  });
  handle("book:cover", async (id) => {
    const url = await library.cover(id);
    if (!url) return null;
    const image = nativeImage.createFromDataURL(url);
    if (image.isEmpty()) return null;
    return image.getSize().width > 320
      ? image.resize({ width: 320, quality: "good" }).toDataURL()
      : url;
  });
  handle("book:save", (id, patch) => library.save(id, patch));
  handle("settings:save", (patch) => library.settings(patch));
  handle("speech:voices", () => speech.voices());
  handle("speech:generate", async (request) => {
    const result = await speech.generate(request);
    const { file, ...metadata } = result;
    return { ...metadata, url: media(file) };
  });
  handle("speech:pick", async (kind) => {
    const result = await dialog.showOpenDialog(main, {
      title: kind === "model" ? "选择 Piper ONNX 音色模型" : "选择 Piper 程序",
      properties: ["openFile"],
      ...(kind === "model"
        ? { filters: [{ name: "ONNX", extensions: ["onnx"] }] }
        : {}),
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle("overlay:show", (show) => showOverlay(show), true);
  handle("overlay:publish", (state) => {
    overlayState = state;
    overlay?.webContents.send("overlay:update", state);
  });
  handle("overlay:get", () => ({ ...overlayState, locked }), true);
  handle("overlay:lock", (value) => setLocked(value), true);
  handle(
    "overlay:control",
    (command) => {
      if (["toggle", "next", "previous", "settings"].includes(command))
        main?.webContents.send("speech:control", command);
      if (command === "settings") {
        main?.show();
        main?.focus();
      }
    },
    true,
  );
  handle("window:fullscreen", () => {
    main.setFullScreen(!main.isFullScreen());
    return main.isFullScreen();
  });
  handle("window:finish-close", () => main?.finishClose());
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      {
        label: "图书",
        submenu: [
          {
            label: "打开书库文件夹…",
            click: () => main?.webContents.send("app:choose"),
          },
          { type: "separator" },
          { role: "quit", label: "退出" },
        ],
      },
      {
        label: "编辑",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "显示",
        submenu: [
          { role: "togglefullscreen", label: "全屏" },
          {
            label: "桌面字幕",
            accelerator: "CommandOrControl+Shift+D",
            click: () => showOverlay(!overlay?.isVisible()),
          },
          {
            label: "锁定 / 解锁字幕",
            accelerator: "CommandOrControl+Shift+L",
            click: () => setLocked(!locked),
          },
          ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
        ],
      },
    ]),
  );
  globalShortcut.register("CommandOrControl+Shift+L", () => setLocked(!locked));
  globalShortcut.register("CommandOrControl+Shift+D", () =>
    showOverlay(!overlay?.isVisible()),
  );
  globalShortcut.register("CommandOrControl+Shift+Space", () =>
    main?.webContents.send("speech:control", "toggle"),
  );
  createMain();
  const timer = setInterval(() => {
    if (library.device.updatedAt)
      library.queue = library.queue
        .then(() => library.flush())
        .then((result) => main?.webContents.send("sync:status", result))
        .catch(() => {});
  }, 30000);
  timer.unref();
  const sweepTimer = setInterval(
    () => library.sweep().catch(() => {}),
    3600000,
  );
  sweepTimer.unref();
  setTimeout(() => library.sweep().catch(() => {}), 10000).unref();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (!main) createMain();
});
app.on("before-quit", () => {
  speech?.close();
  library?.close();
  globalShortcut.unregisterAll();
});
