// Packaged acceptance test. Uses synthetic data and replaces Books snapshots before enabling sync.
const { _electron: electron } = require("playwright"),
  path = require("node:path"),
  fs = require("node:fs/promises");
const assert = require("node:assert/strict");
(async () => {
  await fs.mkdir(path.resolve(".qa"), { recursive: true });
  const base = await fs.mkdtemp(path.resolve(".qa/mac-acceptance-"));
  const user = path.join(base, "user"),
    root = path.join(base, "cloud");
  await fs.mkdir(user, { recursive: true });
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(user, "config.json"),
    JSON.stringify({
      settings: { mac: { mode: "reader", login: false, writeback: false } },
    }),
  );
  const app = await electron.launch({
    executablePath: path.resolve(
      process.env.BOOKSPLUS_TEST_APP ||
        `release/mac-${process.arch}/Books+.app/Contents/MacOS/Books+`,
    ),
    env: {
      ...process.env,
      READER_USER_DATA: user,
      READER_LIBRARY_ROOT: root,
      READER_MODELS_DIR: path.resolve(".qa/mac-models"),
    },
    timeout: 30000,
  });
  try {
    const win = await app.firstWindow();
    await win.waitForFunction(() => !!window.reader);
    const status = await win.evaluate(() => window.reader.macStatus());
    console.log({ packaged: status.packaged, settings: status.settings });
    // Confine the integration fixture to an empty synthetic Books library; never export real personal books.
    await app.evaluate(({ app }) => {
      const { NativeBooks } = process
        .getBuiltinModule("module")
        .createRequire(app.getAppPath() + "/package.json")(
        "./desktop/apple-books.cjs",
      );
      NativeBooks.prototype.snapshot = async () => ({
        libraryAvailable: true,
        tables: { ZBKLIBRARYASSET: [], ZAEANNOTATION: [] },
        errors: [],
      });
    });
    await win.evaluate(() =>
      window.reader.macSettings({
        mode: "sync",
        login: false,
        writeback: true,
      }),
    );
    await win.waitForFunction(() =>
      document.body.textContent.includes("关闭此窗口后继续在菜单栏同步"),
    );
    assert.equal(await app.evaluate(({ app }) => app.dock.isVisible()), false);
    console.log("sync-only Dock hidden");
    const installed = await win.evaluate(() => window.reader.models());
    let neural = null;
    if (
      installed.some(
        (model) => model.id === "kitten-mini-en" && model.installed,
      )
    )
      neural = await win.evaluate(async () => {
        const v = (await window.reader.voices()).voices.find(
          (v) => v.engine === "neural" && v.modelId === "kitten-mini-en",
        );
        return window.reader.synthesize({
          engine: "neural",
          modelId: v.modelId,
          voice: v.id,
          text: "Books Plus is running as a Mac application.",
          rate: 1,
          pitch: 0,
          threads: 2,
          quality: "balanced",
        });
      });
    console.log(
      neural
        ? { packagedNeuralURL: neural.url, timing: neural.timing }
        : "Optional Kitten model not installed; neural smoke skipped",
    );
    const audio = await win.evaluate(async () => {
      const voices = (await window.reader.voices()).voices;
      const voice = voices.find(
        (v) => v.engine === "native" && v.lang.startsWith("en"),
      );
      const result = await window.reader.synthesize({
        engine: "native",
        voice: voice.id,
        text: "Books Plus on Mac.",
        rate: 1,
        pitch: 0,
      });
      const player = new Audio(result.url);
      player.volume = 0;
      await player.play();
      await new Promise((resolve, reject) => {
        player.onended = resolve;
        player.onerror = () => reject(Error("Audio playback failed"));
        setTimeout(() => reject(Error("Audio playback timed out")), 10000);
      });
      return true;
    });
    assert.equal(audio, true);
    console.log("Native speech played through reader-media (muted)");
    await win.evaluate(async () => {
      await window.reader.showOverlay(true);
      await window.reader.publish({
        text: "Mac subtitle smoke",
        start: 0,
        length: 3,
        playing: true,
        settings: {
          size: 30,
          color: "#ffffff",
          activeColor: "#ffaf50",
          background: 0.12,
          lines: 2,
          font: "sans-serif",
          outline: 2,
          align: "center",
          alwaysOnTop: true,
        },
      });
    });
    console.log("Subtitle overlay created");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.close()),
    );
    for (let i = 0; i < 30; i++) {
      if (
        (await app.evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
        )) === 0
      )
        break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
      0,
    );
    console.log("all windows closed; main process remains alive");
    const devices = path.join(root, "reader-state/v1/devices");
    let names = await fs.readdir(devices);
    assert.equal(names.length, 1);
    const snapshot = path.join(devices, names[0]);
    // A new remote device snapshot must be processed after the reader window has closed.
    await fs.writeFile(
      path.join(devices, "synthetic-remote.json"),
      JSON.stringify({ version: 1, deviceId: "synthetic-remote", books: {} }),
    );
    await fs.unlink(snapshot);
    for (let i = 0; i < 70; i++) {
      if (await fs.stat(snapshot).catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(await fs.stat(snapshot));
    console.log("FSEvents resynchronized cloud with zero windows");
    await app.evaluate(({ app }) => app.emit("second-instance"));
    const reopened = await app.firstWindow();
    await reopened.waitForFunction(() =>
      document.body.textContent.includes("Mac 运行模式"),
    );
    console.log("menu-only dashboard reopened");
    await reopened.evaluate(() =>
      window.reader.macSettings({
        mode: "reader",
        login: false,
        writeback: false,
      }),
    );
    assert.equal(await app.evaluate(({ app }) => app.dock.isVisible()), true);
    console.log("reader mode restores Dock and stops sync");
    if (process.env.BOOKSPLUS_TEST_LOGIN === "1") {
      const login = await app.evaluate(({ app }) => {
        const before = app.getLoginItemSettings();
        app.setLoginItemSettings({ openAtLogin: true, type: "mainAppService" });
        const enabled = app.getLoginItemSettings();
        app.setLoginItemSettings({
          openAtLogin: before.openAtLogin,
          type: "mainAppService",
        });
        return { before, enabled, restored: app.getLoginItemSettings() };
      });
      console.log("login item registration probe", login);
    }
    await fs.writeFile(
      ".qa/packaged-lifecycle-result.json",
      JSON.stringify(
        {
          packaged: true,
          dockHidden: true,
          windowlessSync: true,
          neural: !!neural,
          nativeAudio: audio,
          readerModeRestored: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
