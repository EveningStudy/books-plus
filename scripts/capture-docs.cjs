// Documentation images: real packaged UI, isolated library, original sample books.
// Browser plugin not available; Playwright controls Electron and renders SVG covers.
// Windows: node scripts/capture-docs.cjs
// Mac: BOOKSPLUS_DOCS_APP=/path/to/Books+.app/Contents/MacOS/Books+ node scripts/capture-docs.cjs --mac
const { _electron: electron, chromium } = require("playwright");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");
const { Library, atomicJson, json } = require("../desktop/library.cjs");
const mac = process.argv.includes("--mac");
const out = path.resolve("docs/assets/screenshots");
const samples = [
  [
    "沿着海岸慢慢走",
    "林间编辑部",
    "COASTAL NOTES",
    "#163b47",
    "#8dbfc0",
    "散文",
  ],
  [
    "一座城市的四季",
    "方知",
    "THE CITY IN SEASONS",
    "#b86442",
    "#f3cf86",
    "散文",
  ],
  ["月亮与远行", "许星河", "MOON / JOURNEYS", "#282b51", "#d3c2a1", "小说"],
  [
    "植物观察手记",
    "青禾工作室",
    "A FIELD JOURNAL",
    "#315442",
    "#bfc99a",
    "自然",
  ],
  [
    "The Quiet Observatory",
    "River Lane",
    "ESSAYS ON ATTENTION",
    "#ded3b8",
    "#354d61",
    "随笔",
  ],
  [
    "把时间留给阅读",
    "Books+ 示例",
    "MAKE ROOM TO READ",
    "#803f49",
    "#f3bf9c",
    "随笔",
  ],
  [
    "旅行中的小发现",
    "Books+ 示例",
    "TRAVEL FIELD NOTES",
    "#ceae77",
    "#384f5a",
    "自然",
  ],
  [
    "山间来信",
    "Books+ 示例",
    "LETTERS FROM THE HILLS",
    "#566451",
    "#e3d7bc",
    "散文",
  ],
  [
    "雨天的咖啡馆",
    "Books+ 示例",
    "A RAINY AFTERNOON",
    "#6d5144",
    "#e6caaa",
    "小说",
  ],
  ["山野之间", "Books+ 示例", "INTO THE GREEN", "#203e37", "#c3d5b0", "自然"],
  [
    "纸上的小宇宙",
    "Books+ 示例",
    "A PAPER UNIVERSE",
    "#404660",
    "#c3cde1",
    "随笔",
  ],
  ["日常里的光", "Books+ 示例", "EVERYDAY LIGHT", "#d0b27c", "#3a494a", "散文"],
  ["远方的蓝色", "Books+ 示例", "A DISTANT BLUE", "#315c73", "#bfd8dd", "小说"],
  ["在春天重逢", "Books+ 示例", "SPRING, AGAIN", "#706d49", "#ebe1af", "散文"],
];
const paragraphs = [
  "清晨的海岸还没有醒来。风从远处经过，带着盐的气味，也带着一整夜的凉意。我们沿着堤岸向前走，把脚步放慢，才听见浪花落在石头上的声音。",
  "旅行不一定需要很远的目的地。有时，一条每天经过的小路，也能在新的光线里显出不同的样子。路边的树影、窗台上的花盆，以及刚刚开门的面包店，都值得停留一会儿。",
  "我在笔记本上写下今天看见的颜色：浅灰的天空，蓝绿色的水面，还有旧灯塔墙壁上柔和的白。文字留下来的，常常是照片之外的部分——空气的温度，等待的心情，以及同行的人说过的一句话。",
  "阅读也像散步。我们不必急着抵达最后一页，可以在喜欢的一句话旁边做一个记号，留下一点想法，再从容地继续。下次打开这本书时，那条小路仍然在那里。",
  "午后的云渐渐散开，码头上的船一只接一只地离岸。我们坐在树荫下读书，偶尔抬头，确认光线已经移到了另一边。时间没有停下，但这一天似乎比平时更宽了一些。",
];
const chapters = [
  "第一章 · 海风经过的地方",
  "第二章 · 慢下来的午后",
  "第三章 · 把风景带回家",
];
async function epub(title) {
  const z = new JSZip();
  z.file("mimetype", "application/epub+zip");
  z.file(
    "META-INF/container.xml",
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  z.file(
    "OPS/book.opf",
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:booksplus:docs:${title}</dc:identifier><dc:title>${title}</dc:title><dc:language>zh</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map((_, i) => `<item id="c${i + 1}" href="c${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join("")}</manifest><spine>${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join("")}</spine></package>`,
  );
  z.file(
    "OPS/nav.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>${chapters.map((c, i) => `<li><a href="c${i + 1}.xhtml">${c}</a></li>`).join("")}</ol></nav></body></html>`,
  );
  for (let i = 0; i < 3; i++)
    z.file(
      `OPS/c${i + 1}.xhtml`,
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${chapters[i]}</title></head><body><h1>${chapters[i]}</h1>${Array.from({ length: 12 }, () => paragraphs.map((p) => `<p>${p}</p>`).join("")).join("")}</body></html>`,
    );
  return z.generateAsync({ type: "nodebuffer" });
}
function pdf() {
  const stream =
    "0.96 0.95 0.91 rg 0 0 612 792 re f 0.18 0.29 0.35 rg 55 520 502 220 re f BT /F1 12 Tf 1 1 1 rg 80 700 Td (BOOKS+ / FIELD NOTES) Tj /F1 32 Tf 0 -65 Td (Small discoveries) Tj 0 -40 Td (on the road) Tj ET BT /F1 15 Tf 0.18 0.29 0.35 rg 70 460 Td (01  Look closely. Walk slowly.) Tj 0 -40 Td (02  Keep a notebook for the ordinary.) Tj 0 -40 Td (03  Leave a little time to read.) Tj /F1 11 Tf 0 -90 Td (Original demonstration document / Books+ documentation) Tj ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let s = "%PDF-1.4\n",
    offsets = [0];
  for (const [i, o] of objs.entries()) {
    offsets.push(Buffer.byteLength(s));
    s += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const start = Buffer.byteLength(s);
  return Buffer.from(
    s +
      `xref\n0 ${offsets.length}\n0000000000 65535 f \n` +
      offsets
        .slice(1)
        .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
        .join("") +
      `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`,
  );
}
async function main() {
  await fs.mkdir(out, { recursive: true });
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "booksplus-docs-"));
  // Never reuse or modify an existing folder, even a previous demo.
  const root = mac
    ? path.join(base, "BooksPlus Demo")
    : await fs.mkdtemp("D:/BooksPlus Demo ");
  await fs.mkdir(root, { recursive: true });
  const user = path.join(base, "profile");
  await atomicJson(path.join(user, "config.json"), {
    settings: {
      mac: { mode: "reader", login: false, writeback: false },
      updates: { autoCheck: false, autoDownload: false },
      reading: { pageTurn: "none" },
      voice: { engine: "native", presetVersion: 2 },
    },
  });
  const lib = await new Library(path.join(base, "seed")).init();
  await lib.configure(root);
  const source = path.join(base, "sources");
  await fs.mkdir(source);
  const files = [];
  for (const [i, b] of samples.entries()) {
    const f = path.join(source, b[0] + (i === 6 ? ".pdf" : ".epub"));
    await fs.writeFile(f, i === 6 ? pdf() : await epub(b[0]));
    files.push(f);
  }
  const { imported } = await lib.import(files);
  // Code-authored SVGs rendered as PNG cover assets, no third-party book art.
  const browser = await chromium.launch({
    channel: mac ? "chrome" : "msedge",
    headless: true,
  });
  const coverPage = await browser.newPage({
    viewport: { width: 480, height: 720 },
    deviceScaleFactor: 1,
  });
  await fs.mkdir(path.join(root, "covers"), { recursive: true });
  for (const [i, id] of imported.entries()) {
    const [title, author, en, bg, fg, category] = samples[i];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720" viewBox="0 0 480 720"><rect width="480" height="720" fill="${bg}"/><circle cx="${i % 2 ? 400 : 100}" cy="520" r="200" fill="${fg}" opacity=".28"/><path d="M-80 590 Q150 350 560 500 L560 800H-80Z" fill="${fg}" opacity=".4"/><path d="M-40 680 Q220 410 540 610" fill="none" stroke="${fg}" stroke-width="2"/><rect x="34" y="35" width="412" height="650" fill="none" stroke="${fg}" opacity=".45"/><text x="62" y="95" fill="${fg}" font-family="Segoe UI, sans-serif" font-size="14" letter-spacing="3">BOOKS+ · SAMPLE ${String(i + 1).padStart(2, "0")}</text><text x="60" y="190" fill="${fg}" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="${title.length > 12 ? 28 : 36}" font-weight="600">${title}</text><text x="62" y="235" fill="${fg}" font-family="Segoe UI, sans-serif" font-size="14" letter-spacing="2">${en}</text><text x="62" y="300" fill="${fg}" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="19">${author}</text><text x="62" y="651" fill="${fg}" font-family="Segoe UI, sans-serif" font-size="13" letter-spacing="3">ORIGINAL DEMO EDITION</text></svg>`;
    await coverPage.setContent(`<style>body{margin:0}</style>${svg}`);
    await coverPage.screenshot({
      path: path.join(root, "covers", id + ".png"),
    });
    const side = path.join(root, "catalog/extra", id + ".json");
    const record = await json(side);
    Object.assign(record.book, {
      author,
      collections: [category],
      cover: { path: `covers/${id}.png` },
    });
    await atomicJson(side, record);
    if (i !== 0 && i !== 6)
      await lib.save(id, {
        reading: {
          progress: [0, 0.28, 0.62, 0.15, 0.42, 0.85, 0, 0.09][i % 8],
        },
        status: { favorite: i < 3, want: i === 3, finished: i === 5 },
      });
  }
  await browser.close();
  lib.close();
  const app = await electron.launch({
    executablePath:
      process.env.BOOKSPLUS_DOCS_APP ||
      path.resolve("release/win-unpacked/Books+.exe"),
    env: {
      ...process.env,
      READER_USER_DATA: user,
      READER_LIBRARY_ROOT: root,
      READER_MODELS_DIR: path.join(base, "models"),
    },
    timeout: 30000,
  });
  const errors = [];
  const captured = [];
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => {
      errors.push(e.stack);
      console.error(e.stack);
    });
    const win = await app.browserWindow(page);
    await win.evaluate((w) => w.setContentSize(1440, 960));
    await page.waitForSelector(".library-header");
    await page.waitForTimeout(1600);
    const shot = async (name) => {
      if (
        await page
          .getByRole("button", { name: "关闭提示", exact: true })
          .isVisible()
      )
        await page
          .getByRole("button", { name: "关闭提示", exact: true })
          .click();
      // epub.js currently responds to native window resizing after drawer layout changes.
      // Use a real window resize, leaving the final capture at the intended dimensions.
      if (await page.locator(".reader-drawer").isVisible()) {
        await win.evaluate((w) => w.setContentSize(1441, 960));
        await page.waitForTimeout(200);
        await win.evaluate((w) => w.setContentSize(1440, 960));
      }
      await page.waitForTimeout(650);
      const target =
        name.startsWith("settings-") ||
        ["mac-sync", "mac-updates", "delete-confirm"].includes(name)
          ? page.locator(".dialog")
          : page;
      await target.screenshot({
        path: path.join(out, name + ".png"),
        scale: "css",
      });
      captured.push(name);
      console.log(name);
    };
    const settings = () =>
      page.getByRole("button", { name: "设置", exact: true }).click();
    const tab = (n) =>
      page
        .locator(".settings-tabs")
        .getByRole("button", { name: n, exact: true })
        .click();
    const close = () =>
      page.getByRole("button", { name: "关闭设置", exact: true }).click();
    const captureOverlay = async () => {
      const created = app.waitForEvent("window");
      await page.evaluate(() => window.reader.showOverlay(true));
      const overlay = await created;
      await overlay.waitForSelector(".desktop-subtitle");
      const overlayWindow = await app.browserWindow(overlay);
      await overlayWindow.evaluate((w) => w.setContentSize(920, 180));
      // Explicit style demo, no synthesized speech or invented timing evidence.
      await page.evaluate(() =>
        window.reader.publish({
          text: "阅读也像散步。放慢脚步，留意身边的风景。",
          start: 7,
          length: 4,
          playing: false,
          settings: {
            size: 30,
            color: "#ffffff",
            activeColor: "#ffaf50",
            background: 0.72,
            lines: 2,
            font: "sans-serif",
            outline: 2,
            align: "center",
            alwaysOnTop: true,
          },
        }),
      );
      await overlay.waitForTimeout(500);
      await overlay.screenshot({
        path: path.join(out, "desktop-subtitles.png"),
        scale: "css",
        omitBackground: true,
      });
      captured.push("desktop-subtitles");
      await page.evaluate(() => window.reader.showOverlay(false));
    };
    await page
      .locator(".sidebar")
      .getByRole("button", { name: /^全部图书/ })
      .click();
    if (mac) {
      await shot("mac-library");
      await settings();
      await tab("Mac 同步");
      await shot("mac-sync");
      await tab("软件更新");
      await shot("mac-updates");
    } else if (process.argv.includes("--overlay-only")) {
      await captureOverlay();
    } else {
      await shot("library-grid");
      await page.getByRole("button", { name: "列表视图", exact: true }).click();
      await shot("library-list");
      await page.getByRole("button", { name: "网格视图", exact: true }).click();
      await page.getByRole("textbox", { name: "搜索图书或作者" }).fill("林间");
      await shot("library-search");
      await page.getByRole("button", { name: "清除搜索" }).click();
      await page.locator(".book-menu summary").first().click();
      await shot("book-menu");
      await page.locator(".book-menu summary").first().click();
      await page
        .getByRole("button", { name: "阅读 " + samples[0][0], exact: true })
        .click();
      await page.waitForSelector(".epub-container iframe");
      await page
        .getByRole("button", { name: "添加书签", exact: true })
        .waitFor({ state: "visible" });
      await page.waitForTimeout(1800);
      await shot("reader-light");
      // Single page keeps all text visible beside an open drawer.
      await page
        .getByRole("button", { name: "主题与设置", exact: true })
        .click();
      await page
        .getByRole("switch", { name: "允许双页显示", exact: true })
        .click();
      await page
        .getByRole("button", { name: "主题与设置", exact: true })
        .click();
      await page.waitForTimeout(500);
      await page
        .getByRole("button", { name: "目录与批注", exact: true })
        .click();
      await shot("reader-contents");
      await page.getByRole("button", { name: "关闭侧栏", exact: true }).click();
      await page
        .getByRole("button", { name: "主题与设置", exact: true })
        .click();
      await shot("reader-themes");
      await page.getByRole("button", { name: "专注主题", exact: true }).click();
      await page
        .getByRole("button", { name: "主题与设置", exact: true })
        .click();
      await page.waitForTimeout(700);
      await shot("reader-dark");
      await page
        .getByRole("button", { name: "主题与设置", exact: true })
        .click();
      await page.getByRole("button", { name: "安静主题", exact: true }).click();
      await page
        .getByRole("button", { name: "主题与设置", exact: true })
        .click();
      await page.getByRole("button", { name: "添加书签", exact: true }).click();
      // Select actual EPUB text with the same DOM selection event used by epub.js.
      const frame = page
        .frames()
        .find((f) => f !== page.mainFrame() && f.url() !== "about:blank");
      if (frame) {
        await frame.evaluate(() => {
          const p = document.querySelector("p");
          if (!p) return;
          const r = document.createRange();
          r.setStart(p.firstChild, 0);
          r.setEnd(p.firstChild, Math.min(32, p.firstChild.length));
          const s = getSelection();
          s.removeAllRanges();
          s.addRange(r);
          document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        });
      }
      await page.getByRole("textbox", { name: "标注笔记" }).waitFor();
      await page
        .getByRole("textbox", { name: "标注笔记" })
        .fill("慢下来，留意平常看不见的细节。");
      await shot("reader-highlight");
      await page.getByRole("button", { name: "标注", exact: true }).click();
      await frame.evaluate(() => getSelection()?.removeAllRanges());
      await page.waitForTimeout(350);
      await page
        .getByRole("button", { name: "目录与批注", exact: true })
        .click();
      await page
        .getByRole("button", { name: "书签与批注", exact: true })
        .click();
      await shot("reader-bookmarks");
      await page.getByRole("button", { name: "关闭侧栏", exact: true }).click();
      await page
        .getByRole("button", { name: "搜索书中内容", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "搜索书中内容", exact: true })
        .fill("灯塔");
      await page.waitForTimeout(1000);
      await shot("reader-search");
      await page.getByRole("button", { name: "关闭侧栏", exact: true }).click();
      const peer = await new Library(path.join(base, "peer")).init();
      await peer.configure(root);
      await peer.save(imported[0], {
        reading: { cfi: "epubcfi(/6/4[c2]!/4/2/1:0)", progress: 0.34 },
      });
      await page
        .getByRole("button", { name: "接着读", exact: true })
        .waitFor({ timeout: 15000 });
      await shot("reader-resume");
      await page.getByRole("button", { name: "接着读", exact: true }).click();
      await page.waitForFunction(() =>
        [...document.querySelectorAll("iframe")].some((f) =>
          f.contentDocument?.body?.textContent.includes(
            "第二章 · 慢下来的午后",
          ),
        ),
      );
      await page.waitForTimeout(1200);
      peer.close();
      await page.getByRole("button", { name: "图书", exact: true }).click();
      await page
        .getByRole("button", { name: "阅读 " + samples[6][0], exact: true })
        .click();
      await page.waitForSelector('canvas[aria-label="PDF 第 1 页"]');
      await page.waitForTimeout(800);
      await shot("reader-pdf");
      await page.getByRole("button", { name: "图书", exact: true }).click();
      const target = page.locator(".book-card").filter({
        has: page.getByRole("button", {
          name: "阅读 " + samples[0][0],
          exact: true,
        }),
      });
      await target.locator("summary").click();
      await target
        .getByRole("button", { name: "删除图书…", exact: true })
        .click();
      await shot("delete-confirm");
      await page
        .getByRole("button", { name: "移到最近删除", exact: true })
        .click();
      await page
        .locator(".sidebar")
        .getByRole("button", { name: "最近删除", exact: true })
        .click();
      await shot("recently-deleted");
      await page.locator(".book-menu summary").first().click();
      await shot("restore-book");
      await page.getByRole("button", { name: "恢复图书", exact: true }).click();
      await page
        .locator(".sidebar")
        .getByRole("button", { name: /^全部图书/ })
        .click();
      await settings();
      await tab("书库");
      await shot("settings-library");
      await tab("格式支持");
      await shot("settings-formats");
      await tab("朗读");
      await shot("settings-voice");
      await page.getByRole("button", { name: "神经离线", exact: true }).click();
      await shot("settings-models");
      await page
        .locator(".settings-content")
        .evaluate((e) => (e.scrollTop = e.scrollHeight));
      await shot("settings-model-downloads");
      await tab("桌面字幕");
      await page
        .locator(".settings-content")
        .evaluate((e) => (e.scrollTop = 0));
      await shot("settings-subtitles");
      await tab("软件更新");
      await shot("settings-updates");
      await close();
      await captureOverlay();
    }
    await fs.writeFile(
      path.join(base, "capture-result.json"),
      JSON.stringify(
        { platform: process.platform, root, out, captured, errors },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ base, captured: captured.length, errors }));
    if (errors.length) throw Error(errors.join("\n"));
  } finally {
    await app.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
