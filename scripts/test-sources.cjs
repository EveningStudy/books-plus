// Real Electron acceptance for multi-folder libraries; all files are synthetic.
const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const { atomicJson, json } = require("../desktop/library.cjs");

function pagePng(color) {
  const zlib = require("node:zlib"),
    crc32 = require("jszip/lib/crc32");
  const width = 180,
    height = 280;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * (1 + width * 3) + 1 + x * 3;
      const border = x < 8 || x >= width - 8 || y < 8 || y >= height - 8;
      rows[at] = border ? 35 : color[0];
      rows[at + 1] = border ? 35 : color[1];
      rows[at + 2] = border ? 35 : color[2];
    }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]),
      size = Buffer.alloc(4),
      crc = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    crc.writeInt32BE(crc32(body));
    return Buffer.concat([size, body, crc]);
  };
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
(async () => {
  await fs.mkdir(path.resolve(".qa"), { recursive: true });
  const base = await fs.mkdtemp(path.resolve(".qa/sources-ui-")),
    root = path.join(base, "Apple Library"),
    comics = path.join(base, "Cloud Comics"),
    local = path.join(base, "Local Notes"),
    user = path.join(base, "profile");
  for (const dir of [root, comics, local]) await fs.mkdir(dir);
  await atomicJson(path.join(user, "config.json"), {
    root,
    settings: {
      language: "en",
      mac: { mode: "reader", login: false, writeback: false },
      reading: { pageTurn: "none" },
      updates: { autoCheck: false },
    },
  });
  await atomicJson(path.join(root, "catalog.json"), {
    version: 2,
    libraryId: "sources-ui-fixture",
    books: [],
  });
  const zip = new JSZip();
  zip.file("10.png", pagePng([80, 140, 210]));
  zip.file("2.png", pagePng([110, 180, 140]));
  zip.file("1.png", pagePng([220, 170, 100]));
  const comicFile = path.join(comics, "Synthetic Comic.cbz");
  await fs.writeFile(
    comicFile,
    await zip.generateAsync({ type: "nodebuffer" }),
  );
  await fs.writeFile(
    path.join(local, "Local Notebook.md"),
    "# Private local notes\n\nSynthetic local text.\n\n" +
      "A reading paragraph.\n\n".repeat(80),
  );
  const importedFile = path.join(base, "Imported.txt");
  await fs.writeFile(importedFile, "Imported only into the chosen source.");
  let app, page;
  const errors = [];
  const launch = async () => {
    app = await electron.launch({
      ...(process.env.BOOKSPLUS_TEST_APP
        ? { executablePath: path.resolve(process.env.BOOKSPLUS_TEST_APP) }
        : { args: ["."] }),
      env: { ...process.env, READER_USER_DATA: user, READER_LIBRARY_ROOT: "" },
      timeout: 30000,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector(".library-header");
  };
  const picker = (folder) =>
    app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, folder);
  const settings = () =>
    page.getByRole("button", { name: "Settings", exact: true }).click();
  const closeSettings = () =>
    page.getByRole("button", { name: "Close settings", exact: true }).click();
  const shot = (name) =>
    page.screenshot({ path: path.join(base, name + ".png") });
  const data = () => page.evaluate(() => window.reader.load());
  try {
    await launch();
    await settings();
    for (const folder of [comics, local]) {
      await picker(folder);
      await page
        .getByRole("button", { name: "Add folder…", exact: true })
        .click();
      await page
        .locator(".source-card")
        .filter({ hasText: path.basename(folder) })
        .waitFor();
    }
    assert.equal(await page.locator(".source-card").count(), 3);
    let loaded = await data();
    const originalBridge = loaded.sources.find((s) => s.appleBooks).id,
      comicSource = loaded.sources.find((s) => s.root === comics).id,
      localSource = loaded.sources.find((s) => s.root === local).id;
    assert.equal(loaded.root, root);
    await page
      .getByLabel("Default destination for added books", { exact: true })
      .selectOption(comicSource);
    await page.waitForFunction(
      (id) => window.reader.load().then((d) => d.importSourceId === id),
      comicSource,
    );
    await shot("folders-settings");
    await closeSettings();
    await page
      .getByRole("button", { name: "Read Synthetic Comic", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Read Local Notebook", exact: true })
      .waitFor();
    await page
      .getByLabel("Library source", { exact: true })
      .selectOption(localSource);
    assert.equal(await page.locator(".book-card").count(), 1);
    await page
      .getByRole("button", { name: "Read Local Notebook", exact: true })
      .waitFor();
    await page
      .getByLabel("Library source", { exact: true })
      .selectOption(comicSource);
    await picker(importedFile);
    await page.getByRole("button", { name: "Add books", exact: true }).click();
    await page
      .getByRole("button", { name: "Read Imported", exact: true })
      .waitFor();
    assert.equal((await fs.readdir(root)).includes("content"), false);
    assert.ok((await fs.readdir(comics)).includes("content"));
    await page.getByLabel("Library source", { exact: true }).selectOption("");
    await shot("unified-shelf");
    await page
      .getByRole("button", { name: "Read Synthetic Comic", exact: true })
      .click();
    await page.waitForSelector(".epub-container iframe");
    const frame = page.locator(".epub-container iframe").first().contentFrame();
    await frame.locator("img").waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".epub-container iframe")].some((f) =>
        [...f.contentDocument.querySelectorAll("img")].some(
          (i) => i.complete && i.naturalWidth === 180,
        ),
      ),
    );
    await shot("comic-reading");
    const before = await page
      .getByRole("slider", { name: "Reading progress", exact: true })
      .inputValue();
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page.waitForFunction(
      (before) =>
        document.querySelector('input[aria-label="Reading progress"]').value !==
        before,
      before,
    );
    await page
      .getByRole("button", { name: "Add bookmark", exact: true })
      .click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Books", exact: true }).click();
    loaded = await data();
    const comic = loaded.books.find((b) => b.title === "Synthetic Comic");
    assert.ok(comic.state.reading?.progress > 0);
    assert.ok(Object.keys(comic.state.marks || {}).length > 0);
    const progress = comic.state.reading.progress;
    await settings();
    const localCard = page
      .locator(".source-card")
      .filter({ hasText: "Local Notes" });
    await localCard
      .getByRole("button", { name: "Remove folder…", exact: true })
      .click();
    await localCard
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    assert.equal(await page.locator(".source-card").count(), 3);
    await localCard
      .getByRole("button", { name: "Remove folder…", exact: true })
      .click();
    await localCard
      .getByRole("button", { name: "Confirm folder removal", exact: true })
      .click();
    await page.waitForFunction(() =>
      window.reader.load().then((d) => d.sources.length === 2),
    );
    assert.ok(await fs.stat(path.join(local, "Local Notebook.md")));
    await picker(local);
    await page
      .getByRole("button", { name: "Add folder…", exact: true })
      .click();
    await page
      .locator(".source-card")
      .filter({ hasText: "Local Notes" })
      .waitFor();
    await page
      .getByLabel("Apple Books sync folder", { exact: true })
      .selectOption(localSource);
    await page.waitForFunction(
      (id) =>
        window.reader
          .load()
          .then((d) => d.sources.find((s) => s.appleBooks).id === id),
      localSource,
    );
    loaded = await data();
    assert.equal(loaded.root, local);
    assert.equal(loaded.sources.length, 3);
    await page
      .getByLabel("Apple Books sync folder", { exact: true })
      .selectOption(originalBridge);
    await page.waitForFunction(
      (id) =>
        window.reader
          .load()
          .then((d) => d.sources.find((s) => s.appleBooks).id === id),
      originalBridge,
    );
    await closeSettings();
    await app.close();
    app = null;
    await launch();
    loaded = await data();
    assert.equal(loaded.sources.length, 3);
    assert.equal(loaded.root, root);
    assert.equal(loaded.importSourceId, comicSource);
    assert.equal(
      loaded.books.find((b) => b.title === "Synthetic Comic").state.reading
        .progress,
      progress,
    );
    assert.ok(
      Object.keys(
        loaded.books.find((b) => b.title === "Synthetic Comic").state.marks ||
          {},
      ).length > 0,
    );
    await page
      .getByRole("button", { name: "Read Synthetic Comic", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add bookmark", exact: true })
      .waitFor({ state: "visible" });
    await page.waitForFunction(
      (progress) =>
        Number(
          document.querySelector('input[aria-label="Reading progress"]').value,
        ) === Math.round(progress * 1000),
      progress,
    );
    await page
      .getByRole("slider", { name: "Reading progress", exact: true })
      .focus();
    await page.keyboard.press("End");
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="Reading progress"]').value ===
        "1000",
    );
    await page.getByRole("button", { name: "Books", exact: true }).click();
    assert.equal(
      (await json(path.join(root, "catalog.json"))).books.length,
      0,
      "independent source books never enter Apple catalog",
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          platform: process.platform,
          base,
          passed: [
            "three-folder unified shelf and source filter",
            "real CBZ rendering, page turn and bookmark",
            "chosen import destination",
            "remove/cancel/re-add without deleting originals",
            "single Apple bridge selection independent of other folders",
            "restart retains sources, progress and bookmarks",
          ],
        },
        null,
        2,
      ),
    );
  } catch (e) {
    if (page) await shot("failure").catch(() => {});
    throw e;
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
