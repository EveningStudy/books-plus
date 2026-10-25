// Simulated user acceptance. Synthetic books only; no Apple Books access or personal library.
const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const JSZip = require("jszip");
const { Library, atomicJson, json } = require("../desktop/library.cjs");
async function fixture() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  zip.file(
    "OPS/book.opf",
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:booksplus:acceptance</dc:identifier><dc:title>Handoff Fixture</dc:title><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
      [1, 2, 3]
        .map(
          (i) =>
            `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`,
        )
        .join("") +
      "</manifest><spine>" +
      [1, 2, 3].map((i) => `<itemref idref="c${i}"/>`).join("") +
      "</spine></package>",
  );
  zip.file(
    "OPS/nav.xhtml",
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>' +
      [1, 2, 3]
        .map((i) => `<li><a href="c${i}.xhtml">Chapter ${i}</a></li>`)
        .join("") +
      "</ol></nav></body></html>",
  );
  for (const i of [1, 2, 3])
    zip.file(
      `OPS/c${i}.xhtml`,
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${i}</title></head><body><h1>CHAPTER_${i}_HANDOFF</h1>` +
        Array.from(
          { length: 80 },
          (_, n) =>
            `<p>Chapter ${i} paragraph ${n}. A synthetic book for testing cross device reading. We turn a page and continue the story, keeping the position and bookmarks safe. 中文阅读测试。</p>`,
        ).join("") +
        "</body></html>",
    );
  return zip.generateAsync({ type: "nodebuffer" });
}
function pdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>",
  ];
  for (let i = 1; i <= 3; i++) {
    const stream = `BT /F1 24 Tf 70 700 Td (Synthetic page ${i}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents ${objects.length + 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let text = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = Buffer.byteLength(text);
  text +=
    `xref\n0 ${offsets.length}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}
(async () => {
  await fs.mkdir(path.resolve(".qa"), { recursive: true });
  const base = await fs.mkdtemp(path.resolve(".qa/handoff-ui-")),
    root = path.join(base, "CloudDrive 中文 Library"),
    user = path.join(base, "reader");
  await atomicJson(path.join(user, "config.json"), {
    settings: {
      mac: { mode: "reader", login: false, writeback: false },
      reading: { pageTurn: "none" },
    },
  });
  await fs.mkdir(root, { recursive: true });
  const files = [
    ["Handoff Fixture.epub", await fixture()],
    ["PDF Fixture.pdf", pdf()],
    [
      "Text Fixture.txt",
      "第一章\n\n用于测试的纯文本。\nThis is a synthetic plain text book.",
    ],
    ["Markdown Fixture.md", "# Markdown sample\n\nA **synthetic** paragraph."],
    [
      "FB2 Fixture.fb2",
      '<?xml version="1.0"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>FB2</book-title><lang>en</lang></title-info></description><body><section><title><p>FB2 Sample</p></title><p>Synthetic FB2 paragraph.</p></section></body></FictionBook>',
    ],
  ];
  for (const [name, bytes] of files)
    await fs.writeFile(path.join(base, name), bytes);
  const remote = await new Library(path.join(base, "remote-windows")).init();
  await remote.configure(root);
  const app = await electron.launch({
    ...(process.env.BOOKSPLUS_TEST_APP
      ? { executablePath: path.resolve(process.env.BOOKSPLUS_TEST_APP) }
      : { args: ["."] }),
    env: { ...process.env, READER_USER_DATA: user, READER_LIBRARY_ROOT: root },
    timeout: 30000,
  });
  const results = [];
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.setDefaultTimeout(15000);
    console.log("launched", base);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector(".library-header");
    // Exercise the real import command; only replace the native file picker response.
    await app.evaluate(
      ({ dialog }, paths) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: paths,
        });
      },
      files.map(([n]) => path.join(base, n)),
    );
    console.log("importing");
    await page.getByRole("button", { name: "加入图书", exact: false }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".book-card").length === 5,
    );
    const data = await page.evaluate(() => window.reader.load());
    const id = data.books.find((b) => b.format === "epub").id;
    const card = (title) =>
      page.getByRole("button", { name: "阅读 " + title, exact: true });
    console.log("opening EPUB");
    await card("Handoff Fixture").click();
    await page.waitForSelector(".epub-container iframe");
    await page.waitForTimeout(1800);
    const own = () =>
      json(path.join(user, "libraries", remote.libraryKey, "state-v1.json"), {
        books: {},
      });
    assert.equal(
      (await own()).books[id]?.reading,
      undefined,
      "restoring/indexing must not create progress",
    );
    results.push("EPUB import/render and restore without a progress echo");
    await remote.load();
    await remote.save(id, {
      reading: { cfi: "epubcfi(/6/4[c2]!/4/2/1:0)", progress: 0.4 },
    });
    await page
      .getByRole("button", { name: "接着读", exact: true })
      .waitFor({ timeout: 12000 });
    await page.getByRole("button", { name: "接着读", exact: true }).click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("iframe")].some((f) =>
        f.contentDocument?.body?.textContent.includes("CHAPTER_2_HANDOFF"),
      ),
    );
    await page.waitForTimeout(1200);
    assert.equal(
      (await own()).books[id]?.reading,
      undefined,
      "accepting remote position must not republish its page-aligned CFI",
    );
    results.push(
      "active remote handoff reaches Chapter 2 without republishing navigation",
    );
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1200);
    let saved = (await own()).books[id].reading;
    assert.ok(saved.cfi.includes("/6/4"));
    const before = saved.updatedAt;
    await page.waitForTimeout(5500);
    assert.equal(
      await page.locator(".remote-reading").count(),
      0,
      "own saves must not show a remote handoff prompt",
    );
    await page.getByRole("button", { name: "添加书签", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "图书", exact: true }).click();
    await page.waitForSelector(".library-header");
    await page.waitForTimeout(600);
    assert.equal(
      (await own()).books[id].reading.updatedAt,
      before,
      "closing an idle reader must not overwrite newer remote progress",
    );
    assert.equal(Object.values((await own()).books[id].marks).length, 1);
    await remote.load();
    await remote.save(id, {
      reading: { cfi: "epubcfi(/6/6[c3]!/4/2/1:0)", progress: 0.75 },
    });
    await card("Handoff Fixture").click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("iframe")].some((f) =>
        f.contentDocument?.body?.textContent.includes("CHAPTER_3_HANDOFF"),
      ),
    );
    await page.waitForTimeout(1000);
    assert.equal((await own()).books[id].reading.updatedAt, before);
    results.push(
      "page turn, bookmark, close and fresh remote restore on reopening",
    );
    await page.getByRole("button", { name: "图书", exact: true }).click();
    await card("PDF Fixture").click();
    await page.waitForSelector('canvas[aria-label="PDF 第 1 页"]');
    await page.keyboard.press("ArrowRight");
    await page.waitForSelector('canvas[aria-label="PDF 第 2 页"]');
    await page.waitForTimeout(1000);
    const pdfId = data.books.find((b) => b.format === "pdf").id;
    assert.equal((await own()).books[pdfId].reading.page, 2);
    await page.getByRole("button", { name: "图书", exact: true }).click();
    for (const name of ["Text Fixture", "Markdown Fixture", "FB2 Fixture"]) {
      await card(name).click();
      await page.waitForSelector(".epub-container iframe");
      await page.waitForFunction(() =>
        [...document.querySelectorAll("iframe")].some(
          (f) =>
            (f.contentDocument?.body?.textContent || "").trim().length > 10,
        ),
      );
      await page.getByRole("button", { name: "图书", exact: true }).click();
    }
    results.push("PDF turn/persistence and TXT, Markdown, FB2 real rendering");
    const epubCard = page
      .locator(".book-card")
      .filter({ has: card("Handoff Fixture") });
    await epubCard.locator("summary").click();
    await epubCard
      .getByRole("button", { name: "删除图书…", exact: true })
      .click();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await card("Handoff Fixture").count(), 1);
    await epubCard
      .getByRole("button", { name: "删除图书…", exact: true })
      .click();
    await page
      .getByRole("button", { name: "移到最近删除", exact: true })
      .click();
    await card("Handoff Fixture").waitFor({ state: "detached" });
    assert.equal((await remote.load()).trash[0].id, id);
    await page.getByRole("button", { name: "最近删除", exact: true }).click();
    await page.screenshot({ path: path.join(base, "trash.png") });
    await page.locator(".book-menu summary").click();
    await page.getByRole("button", { name: "恢复图书", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".book-card").length === 0,
    );
    assert.equal(
      Object.values(
        (await remote.load()).books.find((b) => b.id === id).state.marks,
      ).filter((m) => !m.deleted).length,
      1,
    );
    await page
      .locator(".sidebar")
      .getByRole("button", { name: /^全部图书/ })
      .click();
    await card("Handoff Fixture").waitFor();
    results.push(
      "delete confirmation/cancel, remote tombstone, trash and restore with marks",
    );
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "软件更新", exact: true }).click();
    assert.equal(
      await page
        .getByRole("heading", { name: "桌面字幕", exact: true })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "桌面字幕", exact: true }).click();
    await page
      .getByRole("heading", { name: "桌面字幕", exact: true })
      .waitFor();
    assert.equal(await page.locator(".update-settings").count(), 0);
    await page.getByRole("button", { name: "软件更新", exact: true }).click();
    await page.getByRole("button", { name: "检查更新", exact: true }).click();
    await page
      .getByText(/当前已是最新版本|更新失败，可重试/)
      .waitFor({ timeout: 25000 });
    await page.screenshot({ path: path.join(base, "updates.png") });
    results.push(
      "update settings renders and live release check finishes without runtime errors",
    );
    await page.getByRole("button", { name: "关闭设置", exact: true }).click();
    await page.screenshot({ path: path.join(base, "library.png") });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        { platform: process.platform, base, passed: results },
        null,
        2,
      ),
    );
    await atomicJson(path.join(base, "result.json"), {
      platform: process.platform,
      passed: results,
    });
  } finally {
    await app.close();
    remote.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
