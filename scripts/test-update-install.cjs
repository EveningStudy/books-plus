// Opt-in Windows installer acceptance, using a local HTTP feed and an isolated test profile.
// Build/install the QA baseline 0.4.99 first. No public feed or production configuration is changed.
const { _electron: electron } = require("playwright"),
  http = require("node:http"),
  fs = require("node:fs/promises"),
  streams = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const { Library, atomicJson } = require("../desktop/library.cjs");
(async () => {
  assert.equal(process.platform, "win32");
  const installed = path.resolve(process.argv[2]);
  assert.ok(installed.startsWith(path.resolve(".qa") + path.sep));
  const base = await fs.mkdtemp(path.resolve(".qa/update-install-")),
    user = path.join(base, "user"),
    root = path.join(base, "cloud");
  await atomicJson(path.join(user, "config.json"), {
    settings: {
      updates: { autoCheck: false, autoDownload: false },
      reading: { pageTurn: "none" },
    },
  });
  const lib = await new Library(user).init();
  await fs.mkdir(root);
  await lib.configure(root);
  const input = path.join(base, "Upgrade retention.txt");
  await fs.writeFile(
    input,
    "Chapter one\n\n" +
      "Synthetic upgrade retention paragraph. 中文测试。\n\n".repeat(500),
  );
  const id = (await lib.import([input])).imported[0];
  await lib.save(id, {
    reading: { progress: 0.42 },
    mark: { id: "keep", type: "bookmark", text: "Preserve through upgrade" },
  });
  lib.close();
  const installer = path.resolve("release/BooksPlus-Setup-0.5.0-x64.exe"),
    bytes = await fs.readFile(installer),
    good = crypto.createHash("sha512").update(bytes).digest("base64");
  let corrupt = true,
    requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url.startsWith("/latest.yml")) {
      const sha512 = corrupt ? Buffer.alloc(64).toString("base64") : good;
      res.end(
        `version: 0.5.0\nfiles:\n  - url: BooksPlus-Setup-0.5.0-x64.exe\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: BooksPlus-Setup-0.5.0-x64.exe\nsha512: ${sha512}\nreleaseDate: '2026-10-25T00:00:00.000Z'\n`,
      );
    } else if (req.url.startsWith("/BooksPlus-Setup-0.5.0-x64.exe")) {
      res.setHeader("content-length", bytes.length);
      streams.createReadStream(installer).pipe(res);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let app;
  const launch = () =>
    electron.launch({
      executablePath: path.join(installed, "Books+.exe"),
      env: {
        ...process.env,
        READER_USER_DATA: user,
        READER_LIBRARY_ROOT: root,
      },
      timeout: 30000,
    });
  try {
    app = await launch();
    const page = await app.firstWindow();
    await page.waitForSelector(".library-header");
    assert.equal(
      (await page.evaluate(() => window.reader.updateStatus())).currentVersion,
      "0.4.99",
    );
    await app.evaluate(
      ({ app }, { url, installed, base }) => {
        const require = process
          .getBuiltinModule("module")
          .createRequire(app.getAppPath() + "/package.json");
        const updater = require("electron-updater").autoUpdater;
        updater.setFeedURL({ provider: "generic", url });
        updater.disableDifferentialDownload = true;
        updater.installDirectory = installed;
        // Keep downloader cache isolated too. Real HTTP, hashing and NSIS install remain in use.
        updater.app.baseCachePath;
        updater._appUpdateConfigPath = require("node:path").join(
          base,
          "app-update.yml",
        );
        require("node:fs").writeFileSync(
          updater._appUpdateConfigPath,
          "updaterCacheDirName: booksplus-qa-update-cache\n",
        );
        const install = updater.quitAndInstall.bind(updater);
        updater.quitAndInstall = () => install(true, false); // Unattended QA: same installer, silent flags.
      },
      { url, installed, base },
    );
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "软件更新", exact: true }).click();
    await page.getByRole("button", { name: "检查更新", exact: true }).click();
    await page.waitForFunction(
      async () =>
        !["idle", "checking"].includes(
          (await window.reader.updateStatus()).phase,
        ),
    );
    console.log(
      "check status",
      await page.evaluate(() => window.reader.updateStatus()),
      "requests",
      requests,
    );
    await page.getByText("发现新版本 0.5.0", { exact: true }).waitFor();
    await page.getByRole("button", { name: "下载更新", exact: true }).click();
    await page
      .getByText("更新失败，可重试", { exact: true })
      .waitFor({ timeout: 60000 });
    const failed = await page.evaluate(() => window.reader.updateStatus());
    assert.match(failed.error, /校验/);
    assert.equal(
      await page.getByRole("button", { name: "保存并重启安装" }).count(),
      0,
    );
    console.log("Real SHA512 mismatch blocked install");
    await page.screenshot({ path: path.join(base, "checksum-rejected.png") });
    corrupt = false;
    await page.getByRole("button", { name: "检查更新", exact: true }).click();
    await page.getByText("发现新版本 0.5.0", { exact: true }).waitFor();
    await page.getByRole("button", { name: "下载更新", exact: true }).click();
    await page
      .getByText("版本 0.5.0 已就绪", { exact: true })
      .waitFor({ timeout: 60000 });
    await page.screenshot({ path: path.join(base, "update-ready.png") });
    await page.getByRole("button", { name: "关闭设置", exact: true }).click();
    await page
      .getByRole("button", { name: "阅读 Upgrade retention", exact: true })
      .click();
    await page.waitForSelector(".epub-container iframe");
    await page.waitForTimeout(1400);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "朗读设置", exact: true }).click();
    await page.getByRole("button", { name: "软件更新", exact: true }).click();
    const exited = new Promise((r) => app.process().once("exit", r));
    await page
      .getByRole("button", { name: "保存并重启安装", exact: true })
      .click();
    await exited;
    app = null;
    console.log(
      "Old app exited after renderer save handshake; waiting for NSIS",
    );
    let upgraded = false;
    for (let n = 0; n < 40; n++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const asar = require("@electron/asar");
        asar.uncacheAll();
        const pkg = JSON.parse(
          asar
            .extractFile(
              path.join(installed, "resources/app.asar"),
              "package.json",
            )
            .toString(),
        );
        if (pkg.version === "0.5.0") {
          upgraded = true;
          break;
        }
      } catch {}
    }
    assert.equal(
      upgraded,
      true,
      "NSIS installed newer version into isolated install directory",
    );
    await new Promise((r) => setTimeout(r, 3000));
    app = await launch();
    const next = await app.firstWindow();
    await next.waitForSelector(".library-header");
    assert.equal(
      (await next.evaluate(() => window.reader.updateStatus())).currentVersion,
      "0.5.0",
    );
    const data = await next.evaluate(() => window.reader.load()),
      book = data.books.find((b) => b.id === id);
    assert.equal(book.state.marks.keep.text, "Preserve through upgrade");
    assert.ok(
      book.state.reading.cfi,
      "pending renderer position was flushed before install",
    );
    const settings = JSON.parse(
      await fs.readFile(path.join(user, "config.json"), "utf8"),
    ).settings;
    assert.equal(settings.updates.autoDownload, false);
    await next.screenshot({ path: path.join(base, "upgraded.png") });
    await atomicJson(path.join(base, "result.json"), {
      baseline: "0.4.99",
      target: "0.5.0",
      transport: "localhost HTTP",
      checksumRejected: true,
      nativeInstaller: true,
      preservedBookId: id,
      progress: book.state.reading,
      bookmark: true,
      preferences: true,
      requests,
    });
    console.log(
      "PASS native 0.4.99 -> 0.5.0 upgrade with book, progress, bookmark and preferences retained",
      base,
    );
  } finally {
    if (app) await app.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
