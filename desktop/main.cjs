const { translate, translateMessage } = require("./i18n.mjs");
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
  Tray,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const { Library } = require("./library.cjs");
const { Speech } = require("./speech.cjs");
const { Models } = require("./models.cjs");
const { CloudFiles } = require("./cloud-files.cjs");
const { Updates, updateMode, RELEASES } = require("./updates.cjs");
const {
  AppleBooksSync,
  NativeBooks,
  validateCloudRoot,
} = require("./apple-books.cjs");

app.setName("Books+");
app.setPath(
  "userData",
  process.env.READER_USER_DATA ||
    path.join(app.getPath("appData"), "icloud-books-reader"),
);
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
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
let appleSync,
  updates,
  tray,
  quitting = false,
  quitReady = false;
const isMac = process.platform === "darwin";
const language = () =>
  library?.config.settings?.language === "en" ? "en" : "zh";
const t = (key, values = []) => translate(language(), key, values);
const tm = (message) => translateMessage(language(), message);
function showMain(settings = false) {
  if (!library || quitting) return;
  if (!main) createMain(settings ? "mac" : undefined);
  else {
    main.show();
    main.focus();
  }
  if (settings && !main.webContents.isLoading())
    main.webContents.send("app:settings", "mac");
}
app.on("second-instance", () => showMain());
function updateApplicationMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      {
        label: t("图书"),
        submenu: [
          {
            label: t("打开书库文件夹…"),
            click: () => main?.webContents.send("app:choose"),
          },
          { type: "separator" },
          { role: "quit", label: t("退出") },
        ],
      },
      {
        label: t("编辑"),
        submenu: [
          { role: "undo", label: t("撤销") },
          { role: "redo", label: t("重做") },
          { type: "separator" },
          { role: "cut", label: t("剪切") },
          { role: "copy", label: t("复制") },
          { role: "paste", label: t("粘贴") },
          { role: "selectAll", label: t("全选") },
        ],
      },
      {
        label: t("显示"),
        submenu: [
          { role: "togglefullscreen", label: t("全屏") },
          {
            label: t("桌面字幕"),
            accelerator: "CommandOrControl+Shift+D",
            click: () => showOverlay(!overlay?.isVisible()),
          },
          {
            label: t("锁定 / 解锁字幕"),
            accelerator: "CommandOrControl+Shift+L",
            click: () => setLocked(!locked),
          },
          ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
        ],
      },
    ]),
  );
}
function updateTray() {
  if (!tray) return;
  const status = appleSync?.getStatus();
  tray.setToolTip(
    `Books+ · ${status?.running ? t("正在同步") : status?.error ? t("同步需要处理") : status?.enabled ? t("Apple Books 同步") : t("阅读器")}`,
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label:
          (status?.error && tm(status.error)) ||
          (status?.running
            ? t("正在同步…")
            : status?.enabled
              ? t("Apple Books · {0} 本已映射", [status?.mappings?.length || 0])
              : t("Apple Books 同步已停用")),
        enabled: false,
      },
      { label: t("打开 Books+"), click: () => showMain() },
      { label: t("设置与同步状态…"), click: () => showMain(true) },
      {
        label: t("选择云盘书库…"),
        click: () => chooseLibrary().catch(showNativeError),
      },
      {
        label: t("立即同步"),
        enabled: !!status?.enabled,
        click: () => appleSync.sync(),
      },
      { type: "separator" },
      {
        label: t("退出 Books+"),
        accelerator: "Command+Q",
        click: () => app.quit(),
      },
    ]),
  );
}
function showNativeError(error) {
  dialog.showErrorBox("Books+", tm(error.message));
}
async function chooseLibrary() {
  const result = await dialog.showOpenDialog({
    title: t("选择云端书库文件夹"),
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled) return null;
  if (isMac) await validateCloudRoot(result.filePaths[0]);
  appleSync?.stop();
  await appleSync?.idle();
  try {
    return await library.configure(result.filePaths[0]);
  } finally {
    appleSync?.start();
    updateTray();
  }
}
async function setMacSettings(patch) {
  if (!isMac) throw Error(t("此设置仅适用于 macOS"));
  if (!patch || !["sync", "reader", "both"].includes(patch.mode))
    throw Error(t("请选择运行模式"));
  const mac = {
    mode: patch.mode,
    login: !!patch.login,
    writeback: !!patch.writeback,
  };
  appleSync.stop();
  await appleSync.idle();
  await library.settings({ mac });
  if (app.isPackaged)
    app.setLoginItemSettings({
      openAtLogin: mac.login && mac.mode !== "reader",
      type: "mainAppService",
    });
  app.setActivationPolicy(mac.mode === "sync" ? "accessory" : "regular");
  appleSync.start();
  updateTray();
  return macStatus();
}
function macStatus() {
  return {
    ...appleSync?.getStatus(),
    platform: process.platform,
    packaged: app.isPackaged,
    settings: library.config.settings?.mac || {
      mode: "reader",
      login: false,
      writeback: false,
    },
    login: isMac ? app.getLoginItemSettings() : null,
  };
}
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
function createMain(settingsTab) {
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
  if (settingsTab)
    main.webContents.once("did-finish-load", () =>
      main?.webContents.send("app:settings", settingsTab),
    );
  let closeAllowed = false;
  let closeTimer;
  main.on("close", (event) => {
    if (closeAllowed || quitReady) return;
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
      throw Error(t("不允许此窗口执行该操作"));
    return fn(...args);
  });
}
app
  .whenReady()
  .then(async () => {
    if (!primaryInstance) return;
    const userDir = app.getPath("userData");
    await fs.mkdir(userDir, { recursive: true });
    const cloudScript = path.join(userDir, "cloud-files.ps1");
    await fs.copyFile(path.join(__dirname, "cloud-files.ps1"), cloudScript);
    library = await new Library(userDir, {
      cloud: new CloudFiles(cloudScript),
    }).init();
    if (isMac && !app.isPackaged)
      library.cloud.macBinary = path.join(
        __dirname,
        "../build/native/booksplus-bridge",
      );
    if (process.env.READER_LIBRARY_ROOT)
      await library.configure(process.env.READER_LIBRARY_ROOT);
    if (isMac && !library.config.settings?.mac?.mode) {
      const result = await dialog.showMessageBox({
        type: "question",
        title: t("欢迎使用 Books+"),
        message: t("你想怎样使用 Books+？"),
        detail: t(
          "只同步：登录后在菜单栏同步 Apple Books，不显示 Dock 图标。\n只阅读：使用阅读器、朗读与字幕。\n两者都用：阅读器与后台同步同时运行。\n同步模式会自动导入新的云端 EPUB/PDF；同修订 EPUB 的新进度会通过深链接回写，可能打开 Books。可在设置中关闭自动位置回写。",
        ),
        buttons: [t("只同步"), t("只阅读"), t("两者都用"), t("稍后")],
        cancelId: 3,
        defaultId: 2,
      });
      if (result.response === 3) {
        app.quit();
        return;
      }
      const mode = ["sync", "reader", "both"][result.response];
      await library.settings({
        mac: { mode, login: mode !== "reader", writeback: mode !== "reader" },
      });
      if (mode !== "reader") {
        await library.configure(library.config.root);
        if (app.isPackaged)
          app.setLoginItemSettings({
            openAtLogin: true,
            type: "mainAppService",
          });
      }
    }
    if (isMac) {
      const binary = app.isPackaged
        ? path.join(process.resourcesPath, "booksplus-bridge")
        : path.join(__dirname, "../build/native/booksplus-bridge");
      appleSync = new AppleBooksSync(
        library,
        new NativeBooks(binary),
        (status) => {
          updateTray();
          main?.webContents.send("mac:status", { ...status, ...macStatus() });
        },
      );
      const icon = nativeImage.createFromPath(
        path.join(__dirname, "trayTemplate.png"),
      );
      icon.setTemplateImage(true);
      tray = new Tray(icon);
      tray.on("click", () =>
        showMain(library.config.settings.mac.mode === "sync"),
      );
      app.setActivationPolicy(
        library.config.settings.mac.mode === "sync" ? "accessory" : "regular",
      );
      appleSync.start();
      updateTray();
    }
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
        ? net.fetch(pathToFileURL(file).toString(), {
            headers: request.headers,
          })
        : new Response("Not found", { status: 404 });
    });
    handle("library:load", () => library.load());
    const mode = await updateMode(app);
    updates = new Updates({
      updater: ["automatic", "migration"].includes(mode)
        ? require("electron-updater").autoUpdater
        : null,
      version: app.getVersion(),
      mode,
      preferences: () => library.config.settings?.updates || {},
      notify: (status) => main?.webContents.send("updates:status", status),
    });
    handle("updates:status", () => updates.status());
    handle("updates:check", () => updates.check());
    handle("updates:download", () => updates.download());
    handle("updates:install", () => {
      updates.requestInstall();
      app.quit();
    });
    handle("updates:page", () => shell.openExternal(RELEASES));
    updates.start();
    handle("library:choose", chooseLibrary);
    handle("mac:status", macStatus);
    handle("mac:settings", setMacSettings);
    handle("mac:sync", () => appleSync?.sync().then(macStatus));
    handle("mac:action", (action, id, assetId) =>
      appleSync?.action(action, id, assetId).then(macStatus),
    );
    handle("mac:permissions", () =>
      shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
      ),
    );
    handle("book:read", (id) => library.read(id));
    handle("library:import", async () => {
      const { BUILTIN, CALIBRE } = require("./formats.cjs");
      const result = await dialog.showOpenDialog(main, {
        title: t("加入图书到云端书库"),
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: t("电子书与文档"), extensions: [...BUILTIN, ...CALIBRE] },
        ],
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
        title: t("选择 Calibre ebook-convert 程序"),
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
    handle("book:delete", async (id, deleted) => {
      const sync = await library.setDeleted(id, deleted);
      appleSync?.sync().catch(() => {});
      return { data: await library.load(), sync };
    });
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
        throw Error(t("未知模型页面"));
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
        throw Error(t("无效的阅读区域"));
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
    handle("locale:get", () => language(), true);
    handle("locale:set", async (value) => {
      if (value !== "zh" && value !== "en") throw Error(t("语言设置无效"));
      await library.settings({ language: value });
      updateApplicationMenu();
      updateTray();
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send("locale:changed", value);
      return value;
    });
    handle("settings:save", (patch) => {
      if (patch?.mac) throw Error(t("请使用 Mac 模式设置接口"));
      return library.settings(patch);
    });
    handle("speech:voices", () => speech.voices());
    handle("speech:generate", async (request) => {
      const result = await speech.generate(request);
      const { file, ...metadata } = result;
      return { ...metadata, url: media(file) };
    });
    handle("speech:pick", async (kind) => {
      const result = await dialog.showOpenDialog(main, {
        title:
          kind === "model"
            ? t("选择 Piper ONNX 音色模型")
            : t("选择 Piper 程序"),
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
    updateApplicationMenu();
    globalShortcut.register("CommandOrControl+Shift+L", () =>
      setLocked(!locked),
    );
    globalShortcut.register("CommandOrControl+Shift+D", () =>
      showOverlay(!overlay?.isVisible()),
    );
    globalShortcut.register("CommandOrControl+Shift+Space", () =>
      main?.webContents.send("speech:control", "toggle"),
    );
    if (
      !isMac ||
      (library.config.settings.mac.mode !== "sync" &&
        !app.getLoginItemSettings().wasOpenedAtLogin)
    )
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
  })
  .catch((error) => {
    showNativeError(error);
    app.quit();
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (library && !quitting && library.config.settings?.mac?.mode !== "sync")
    showMain();
});
app.on("before-quit", (event) => {
  if (quitReady) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  updates?.stop();
  appleSync?.stop();
  (async () => {
    if (main && !main.isDestroyed()) {
      const closed = new Promise((resolve) => main.once("closed", resolve));
      main.close();
      await closed;
    }
    const pending = Promise.all([
      appleSync?.idle(),
      library?.queue,
      library?.importQueue,
      library?.downloadQueue,
      library?.settingsQueue,
    ]);
    if (updates?.installRequested) await pending;
    else
      await Promise.race([
        pending,
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    if (library?.stateFile && library.device.updatedAt)
      await library.flush().catch(() => {});
    speech?.close();
    library?.close();
    globalShortcut.unregisterAll();
    tray?.destroy();
    quitReady = true;
    if (!updates?.applyInstall()) app.quit();
  })().catch(() => {
    quitReady = true;
    app.quit();
  });
});
