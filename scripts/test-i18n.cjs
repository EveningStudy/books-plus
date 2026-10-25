// End-to-end language acceptance with an isolated profile and synthetic books.
const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { atomicJson } = require("../desktop/library.cjs");

(async () => {
  await fs.mkdir(path.resolve(".qa"), { recursive: true });
  const base = await fs.mkdtemp(path.resolve(".qa/i18n-ui-"));
  const root = path.join(base, "cloud"),
    user = path.join(base, "profile");
  await fs.mkdir(root);
  await atomicJson(path.join(user, "config.json"), {
    settings: {
      mac: { mode: "reader", login: false, writeback: false },
      reading: { pageTurn: "none" },
    },
  });
  const source = path.join(base, "中文书名.md");
  await fs.writeFile(
    source,
    "# 中文章节\n\n正文保持中文。English body stays unchanged.\n\n" +
      "Synthetic reading paragraph. 中文正文。\n\n".repeat(100),
  );
  let app, page;
  const errors = [],
    results = [];
  const launch = async () => {
    app = await electron.launch({
      ...(process.env.BOOKSPLUS_TEST_APP
        ? { executablePath: path.resolve(process.env.BOOKSPLUS_TEST_APP) }
        : { args: ["."] }),
      env: {
        ...process.env,
        READER_USER_DATA: user,
        READER_LIBRARY_ROOT: root,
      },
      timeout: 30000,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector(".library-header");
  };
  const lang = async (value) => {
    await page
      .locator(".language-switcher:visible")
      .last()
      .getByRole("button", {
        name: value === "en" ? "EN" : "中文",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      (value) => document.documentElement.lang === value,
      value === "en" ? "en" : "zh-CN",
    );
    await page.waitForFunction(
      (value) => window.reader.getLocale().then((locale) => locale === value),
      value,
    );
  };
  const screenshot = (name) =>
    page.screenshot({ path: path.join(base, name + ".png") });
  const untranslated = async () =>
    page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      const found = [];
      while (walker.nextNode()) {
        const node = walker.currentNode,
          text = node.textContent.trim();
        if (
          !/[\u3400-\u9fff]/.test(text) ||
          text === "中文" ||
          text.includes("中文书名")
        )
          continue;
        const parent = node.parentElement;
        if (
          !parent?.getClientRects().length ||
          parent.closest(".epub-container,.reader-title,.toast")
        )
          continue;
        found.push(text);
      }
      return [...new Set(found)];
    });
  try {
    await launch();
    assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
    await app.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [source],
      });
    }, source);
    await page.getByRole("button", { name: "加入图书", exact: false }).click();
    await page.waitForSelector(".book-card");
    await lang("en");
    await page
      .getByRole("heading", { name: "All Books", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Read 中文书名", exact: true })
      .waitFor();
    assert.deepEqual(await untranslated(), []);
    const labels = await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu().items.map((item) => ({
        label: item.label,
        children: item.submenu?.items.map((child) => child.label),
      })),
    );
    assert.ok(
      labels.some(
        (item) => item.label === "Edit" && item.children.includes("Undo"),
      ),
    );
    await screenshot("library-en");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    for (const tab of [
      "Cloud Library",
      "Mac Sync",
      "Formats",
      "Read Aloud",
      "Desktop Subtitles",
      "Software Update",
    ]) {
      // Tab names are taken from the same public UI used by readers.
      const tabs = page.locator(".settings-tabs button");
      const names = await tabs.allTextContents();
      const index = [
        "Cloud Library",
        "Mac Sync",
        "Formats",
        "Read Aloud",
        "Desktop Subtitles",
        "Software Update",
      ].indexOf(tab);
      await tabs.nth(index).click();
      await page.waitForTimeout(200);
      assert.deepEqual(
        await untranslated(),
        [],
        `${tab}: untranslated visible UI; tabs=${names}`,
      );
      if (index === 3) {
        for (const engine of [
          "Neural offline",
          "System offline",
          "Piper local",
          "Edge · Default",
        ]) {
          await page
            .locator(".engine-tabs")
            .getByRole("button", { name: engine, exact: true })
            .click();
          await page.waitForTimeout(150);
          assert.deepEqual(await untranslated(), [], engine);
        }
      }
      await screenshot("settings-en-" + index);
    }
    await lang("zh");
    await page.getByRole("dialog", { name: "设置", exact: true }).waitFor();
    await lang("en");
    await page
      .getByRole("button", { name: "Close settings", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Read 中文书名", exact: true })
      .click();
    await page.waitForSelector(".epub-container iframe");
    await page.waitForTimeout(1200);
    const body = () =>
      page
        .locator(".epub-container iframe")
        .first()
        .contentFrame()
        .locator("body")
        .innerText();
    const before = await body();
    const readingBefore = await page.evaluate(() =>
      window.reader.load().then((data) => data.books[0].state.reading),
    );
    assert.ok(before.includes("正文保持中文。"));
    await lang("zh");
    await page.getByRole("button", { name: "全屏阅读", exact: true }).waitFor();
    assert.equal(await body(), before);
    assert.deepEqual(
      await page.evaluate(() =>
        window.reader.load().then((data) => data.books[0].state.reading),
      ),
      readingBefore,
    );
    await lang("en");
    await page
      .getByRole("button", { name: "Read in full screen", exact: true })
      .waitFor();
    assert.equal(await body(), before);
    await screenshot("reader-en");
    for (const width of [800, 1280]) {
      await app.evaluate(
        ({ BrowserWindow }, width) =>
          BrowserWindow.getAllWindows()[0].setContentSize(width, 800),
        width,
      );
      const boxes = await page
        .locator(".reader-toolbar > *")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const b = node.getBoundingClientRect();
            return { x: b.x, right: b.right, width: b.width };
          }),
        );
      for (let i = 1; i < boxes.length; i++)
        assert.ok(
          boxes[i].x >= boxes[i - 1].right - 1,
          "toolbar controls overlap",
        );
      assert.ok(boxes.at(-1).right <= width, "toolbar overflows");
      await screenshot("reader-en-" + width);
    }
    const created =
      app.windows().length < 2
        ? app.waitForEvent("window")
        : Promise.resolve(null);
    await page.evaluate(() => window.reader.showOverlay(true));
    const subtitle = (await created) || app.windows().find((p) => p !== page);
    assert.ok(subtitle);
    await subtitle
      .getByRole("button", { name: "Hide subtitles", exact: true })
      .waitFor();
    await page.evaluate(() =>
      window.reader.publish({
        text: "原文字幕 unchanged",
        playing: false,
        start: 0,
        length: 0,
      }),
    );
    await lang("zh");
    await subtitle
      .getByRole("button", { name: "隐藏字幕", exact: true })
      .waitFor();
    assert.ok(
      (await subtitle.locator(".subtitle-text").innerText()).includes(
        "原文字幕 unchanged",
      ),
    );
    await lang("en");
    await subtitle
      .getByRole("button", { name: "Hide subtitles", exact: true })
      .waitFor();
    await page.evaluate(() => window.reader.showOverlay(false));
    await page.getByRole("button", { name: "Books", exact: true }).click();
    await page.locator("summary").first().click();
    await page
      .getByRole("button", { name: "Delete book…", exact: true })
      .click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator(".book-card").count(), 1);
    if (
      (await page.locator("details.book-menu").first().getAttribute("open")) ===
      null
    )
      await page.locator("summary").first().click();
    await page
      .getByRole("button", { name: "Delete book…", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Move to Recently Deleted", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Recently Deleted", exact: true })
      .click();
    await page.locator("summary").first().click();
    await page
      .getByRole("button", { name: "Restore book", exact: true })
      .click();
    await page.getByRole("button", { name: /^All Books/ }).click();
    await page
      .getByRole("button", { name: "Read 中文书名", exact: true })
      .waitFor();
    const rejected = await page.evaluate(() =>
      window.reader.setLocale("fr").then(
        () => false,
        () => true,
      ),
    );
    assert.equal(rejected, true);
    assert.equal(await page.evaluate(() => window.reader.getLocale()), "en");
    await app.close();
    app = null;
    await launch();
    await page
      .getByRole("heading", { name: "All Books", exact: true })
      .waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal(
      JSON.parse(await fs.readFile(path.join(user, "config.json"), "utf8"))
        .settings.language,
      "en",
    );
    assert.deepEqual(errors, []);
    results.push(
      "Chinese default; live bilingual UI and native menus; all settings tabs; unchanged book content; 800/1280px layouts; overlay locale broadcast; English delete/cancel/restore; invalid locale rejected; persistence after restart",
    );
    console.log(JSON.stringify({ base, results }, null, 2));
  } catch (error) {
    if (page) await screenshot("failure").catch(() => {});
    throw error;
  } finally {
    if (app) await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
