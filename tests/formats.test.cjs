const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");
const { Formats, decode, copyCompanions } = require("../desktop/formats.cjs");
const item = { asset_id: "test", title: "测试书", author: "Example" };
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "booksplus-format-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return { dir, formats: new Formats(path.join(dir, "cache")) };
}
test("TXT detects Unicode and GB18030, produces stable EPUB chapters", async (t) => {
  const { dir, formats } = await fixture(t);
  assert.equal(decode(Buffer.from([0xd6, 0xd0, 0xce, 0xc4])), "中文");
  assert.equal(decode(Buffer.from([255, 254, 0x2d, 0x4e])), "中");
  const file = path.join(dir, "test.txt"),
    bytes = Buffer.from("第一章 开始\n中文内容。\n第二章 后来\n继续阅读。");
  const out = await formats.prepare(file, bytes, item),
    zip = await JSZip.loadAsync(out);
  assert.match(await zip.file("OPS/nav.xhtml").async("string"), /第二章/);
  assert.match(
    await zip.file("OPS/chapter0.xhtml").async("string"),
    /中文内容/,
  );
  assert.deepEqual(out, await formats.prepare(file, bytes, item));
});
test("HTML removes executable markup and embeds safe local images; import preserves companions", async (t) => {
  const { dir, formats } = await fixture(t);
  const file = path.join(dir, "book.html");
  await fs.mkdir(path.join(dir, "images"));
  await fs.writeFile(path.join(dir, "images/1.png"), Buffer.from("image"));
  const bytes = Buffer.from(
    '<h1>Read</h1><script>alert(1)</script><img src="images/1.png" onerror="alert(2)"/><img src="../secret.png"/><p>Text</p>',
  );
  await fs.writeFile(file, bytes);
  const dest = path.join(dir, "cloud/content/book.html");
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, bytes);
  await copyCompanions(file, dest, bytes, "html");
  assert.equal(
    (
      await fs.readFile(path.join(path.dirname(dest), "images/1.png"))
    ).toString(),
    "image",
  );
  const zip = await JSZip.loadAsync(await formats.prepare(dest, bytes, item));
  const html = await zip.file("OPS/chapter0.xhtml").async("string");
  assert.doesNotMatch(html, /script|onerror|alert/);
  assert.match(html, /data:image\/png;base64/);
  assert.match(html, /<p>Text<\/p>/);
});
test("Markdown and FB2 retain headings, emphasis and embedded images", async (t) => {
  const { dir, formats } = await fixture(t);
  let zip = await JSZip.loadAsync(
    await formats.prepare(
      path.join(dir, "book.md"),
      Buffer.from("# Title\n\nHello **world**."),
      item,
    ),
  );
  assert.match(
    await zip.file("OPS/chapter0.xhtml").async("string"),
    /<strong>world<\/strong>/,
  );
  const xml =
    '<FictionBook xmlns:l="http://www.w3.org/1999/xlink"><body><section><title><p>章节</p></title><p>这段<emphasis>文字</emphasis></p><image l:href="#cover"/></section></body><binary id="cover" content-type="image/png">aW1hZ2U=</binary></FictionBook>';
  zip = await JSZip.loadAsync(
    await formats.prepare(path.join(dir, "book.fb2"), Buffer.from(xml), item),
  );
  assert.match(
    await zip.file("OPS/chapter0.xhtml").async("string"),
    /<em>文字<\/em>/,
  );
  assert.equal(await zip.file("OPS/image0.png").async("string"), "image");
  await assert.rejects(
    formats.prepare(
      path.join(dir, "bad.fb2"),
      Buffer.from('<!DOCTYPE a [<!ENTITY b "bad">]><FictionBook/>'),
      item,
    ),
    /实体/,
  );
});
test("CBZ and CBT natural page order, fixed layout and expanded size guard", async (t) => {
  const { dir, formats } = await fixture(t);
  const input = new JSZip();
  input.file("10.png", "ten");
  input.file("2.png", "two");
  input.file("1.png", "one");
  const zip = await JSZip.loadAsync(
    await formats.prepare(
      path.join(dir, "test.cbz"),
      await input.generateAsync({ type: "nodebuffer" }),
      item,
    ),
  );
  assert.equal(await zip.file("OPS/image1.png").async("string"), "two");
  assert.match(await zip.file("OPS/book.opf").async("string"), /pre-paginated/);
  const tar = require("tar");
  await fs.writeFile(path.join(dir, "10.png"), "ten");
  await fs.writeFile(path.join(dir, "2.png"), "two");
  const chunks = [];
  for await (const b of tar.c({ cwd: dir }, ["10.png", "2.png"]))
    chunks.push(b);
  const cbt = await JSZip.loadAsync(
    await formats.prepare(
      path.join(dir, "test.cbt"),
      Buffer.concat(chunks),
      item,
    ),
  );
  assert.equal(await cbt.file("OPS/image0.png").async("string"), "two");
});
test("unknown formats and missing Calibre return useful errors without changing source", async (t) => {
  const { dir, formats } = await fixture(t);
  formats.converter = async () => null;
  await assert.rejects(
    formats.prepare(path.join(dir, "book.mobi"), Buffer.from("original"), item),
    /Calibre/,
  );
  await assert.rejects(
    formats.prepare(path.join(dir, "book.exe"), Buffer.from("original"), item),
    /尚不支持/,
  );
});
