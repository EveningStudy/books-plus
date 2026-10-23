const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const JSZip = require("jszip");
const { marked } = require("marked");
const sanitize = require("sanitize-html");
const { DOMParser } = require("@xmldom/xmldom");
const { Parser } = require("tar");
const { Readable } = require("node:stream");
const exec = promisify(execFile);
const BUILTIN = [
  "epub",
  "kepub",
  "pdf",
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "xhtml",
  "fb2",
  "cbz",
  "cbt",
];
const CALIBRE = [
  "mobi",
  "azw",
  "azw3",
  "azw4",
  "prc",
  "docx",
  "odt",
  "rtf",
  "lit",
  "lrf",
  "pdb",
  "djvu",
  "chm",
  "cbr",
  "cb7",
  "cbc",
  "fbz",
  "htmlz",
  "pml",
  "snb",
  "tcr",
  "txtz",
];
const escape = (s) =>
  String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
function imageRefs(source, format) {
  const html = ["md", "markdown"].includes(format)
    ? marked.parse(source, { async: false })
    : source;
  return [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(
    (m) => m[1],
  );
}
async function localImage(file, ref) {
  if (/^[a-z]+:|^\/|^\\|^\/\//i.test(ref)) return null;
  let relative;
  try {
    relative = decodeURIComponent(ref.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  const root = await fs.realpath(path.dirname(file)),
    target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) return null;
  const real = await fs.realpath(target).catch(() => null);
  if (!real || !real.startsWith(root + path.sep)) return null;
  const mime = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  }[path.extname(real).toLowerCase()];
  if (!mime || (await fs.stat(real)).size > 15 * 1048576) return null;
  return { relative, mime, bytes: await fs.readFile(real) };
}
async function copyCompanions(source, destination, bytes, format) {
  if (!["html", "htm", "xhtml", "md", "markdown"].includes(format)) return;
  let total = 0;
  for (const ref of new Set(imageRefs(decode(bytes), format))) {
    const image = await localImage(source, ref);
    if (!image) continue;
    total += image.bytes.length;
    if (total > 80 * 1048576) throw Error("文档附属图片超过 80 MB");
    const dest = path.resolve(path.dirname(destination), image.relative);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, image.bytes, { flag: "wx" });
  }
}
function decode(bytes, encoding = "auto") {
  if (encoding !== "auto") return new TextDecoder(encoding).decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}
function xmlDocument(source) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw Error("此文档包含不支持的 XML 实体声明");
  return new DOMParser({ onError: () => {} }).parseFromString(
    source,
    "application/xml",
  );
}
function safeMarkup(source) {
  return sanitize(source, {
    allowedTags: [
      ...sanitize.defaults.allowedTags,
      "img",
      "h1",
      "h2",
      "figure",
      "figcaption",
      "ruby",
      "rt",
      "rp",
      "s",
      "sup",
      "sub",
    ],
    allowedAttributes: {
      "*": ["id", "class"],
      a: ["href", "title"],
      img: ["src", "alt", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["data"],
    allowedSchemesByTag: { img: ["data"] },
    allowProtocolRelative: false,
  })
    .replace(
      /<(img|br|hr|wbr)(\s[^<>]*?)?\s*\/?\s*>/gi,
      (_, tag, attrs) => `<${tag}${attrs || ""}/>`,
    )
    .replace(/&nbsp;/g, "&#160;");
}
async function epub(item, sections, assets = [], fixed = false) {
  const zip = new JSZip(),
    opts = { date: new Date("2020-01-01T00:00:00Z") };
  zip.file("mimetype", "application/epub+zip", {
    ...opts,
    compression: "STORE",
  });
  zip.file(
    "META-INF/container.xml",
    '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    opts,
  );
  const page = (s) =>
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escape(s.title)}</title>${fixed ? '<meta name="viewport" content="width=1200,height=1600"/>' : ""}<style>body{font-family:serif;line-height:1.7}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:.3em}pre{white-space:pre-wrap}${fixed ? "html,body{margin:0!important;padding:0!important;width:100%;height:100%;overflow:hidden}img{width:100%;height:100%;object-fit:contain}" : ""}</style></head><body>${s.html}</body></html>`;
  for (const [i, s] of sections.entries())
    zip.file(`OPS/chapter${i}.xhtml`, page(s), opts);
  for (const a of assets) zip.file("OPS/" + a.name, a.bytes, opts);
  zip.file(
    "OPS/nav.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>${sections.map((s, i) => `<li><a href="chapter${i}.xhtml">${escape(s.title)}</a></li>`).join("")}</ol></nav></body></html>`,
    opts,
  );
  zip.file(
    "OPS/book.opf",
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${escape(item.asset_id)}</dc:identifier><dc:title>${escape(item.title)}</dc:title><dc:creator>${escape(item.author)}</dc:creator><dc:language>zh</dc:language><meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>${fixed ? '<meta property="rendition:layout">pre-paginated</meta>' : ""}</metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${sections.map((_, i) => `<item id="c${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`).join("")}${assets.map((a, i) => `<item id="a${i}" href="${a.name}" media-type="${a.mime}"/>`).join("")}</manifest><spine>${sections.map((_, i) => `<itemref idref="c${i}"/>`).join("")}</spine></package>`,
    opts,
  );
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 4 },
  });
}
async function comic(bytes, format, item) {
  const images = [],
    valid = (name) =>
      /\.(png|jpe?g|webp|gif)$/i.test(name) && !name.startsWith("__MACOSX/");
  let total = 0;
  const add = (name, data) => {
    total += data.length;
    if (total > 400 * 1048576 || images.length >= 3000)
      throw Error("漫画归档过大，请拆分后阅读");
    images.push({ name, bytes: data });
  };
  if (format === "cbz") {
    const zip = await JSZip.loadAsync(bytes);
    for (const entry of Object.values(zip.files))
      if (!entry.dir && valid(entry.name)) {
        const size = entry._data?.uncompressedSize || 0;
        if (size > 30 * 1048576 || total + size > 400 * 1048576)
          throw Error("漫画图片过大");
        add(entry.name, await entry.async("nodebuffer"));
      }
  } else
    await new Promise((resolve, reject) => {
      const parser = new Parser({
        onReadEntry: (entry) => {
          const chunks = [];
          if (entry.type === "File" && valid(entry.path)) {
            if (entry.size > 30 * 1048576) {
              parser.destroy(Error("漫画图片过大"));
              return;
            }
            entry.on("data", (b) => chunks.push(b));
            entry.on("end", () => {
              try {
                add(entry.path, Buffer.concat(chunks));
              } catch (e) {
                parser.destroy(e);
              }
            });
          } else entry.resume();
        },
      });
      parser.on("error", reject);
      parser.on("end", resolve);
      Readable.from(bytes).pipe(parser);
    });
  images.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  if (!images.length) throw Error("漫画中没有可阅读的 PNG/JPEG/WebP/GIF 图片");
  const assets = images.map((a, i) => ({
    name: `image${i}${path.extname(a.name).toLowerCase()}`,
    bytes: a.bytes,
    mime: /\.png$/i.test(a.name)
      ? "image/png"
      : /\.webp$/i.test(a.name)
        ? "image/webp"
        : /\.gif$/i.test(a.name)
          ? "image/gif"
          : "image/jpeg",
  }));
  return epub(
    item,
    assets.map((a, i) => ({
      title: `第 ${i + 1} 页`,
      html: `<img src="${a.name}" alt="第 ${i + 1} 页"/>`,
    })),
    assets,
    true,
  );
}
class Formats {
  constructor(dir) {
    this.dir = dir;
    this.pending = new Map();
    this.keys = new Map();
  }
  async converter(configured) {
    const candidates = [
      configured,
      ...(process.platform === "win32"
        ? [
            "C:\\Program Files\\Calibre2\\ebook-convert.exe",
            "C:\\Program Files (x86)\\Calibre2\\ebook-convert.exe",
          ]
        : [
            "/Applications/calibre.app/Contents/MacOS/ebook-convert",
            "/usr/bin/ebook-convert",
            "/usr/local/bin/ebook-convert",
          ]),
    ].filter(Boolean);
    for (const candidate of candidates)
      if (
        path.isAbsolute(candidate) &&
        (await fs
          .stat(candidate)
          .then((s) => s.isFile())
          .catch(() => false))
      )
        return candidate;
    return null;
  }
  async info(configured) {
    const file = await this.converter(configured);
    return { builtin: BUILTIN, calibre: CALIBRE, converter: file };
  }
  async prepare(file, bytes, item, settings = {}) {
    const format = path.extname(file).slice(1).toLowerCase();
    if (["pdf", "epub", "kepub"].includes(format)) return bytes;
    const key = crypto
      .createHash("sha256")
      .update(bytes)
      .update(
        ":booksplus-convert-v1:" +
          format +
          ":" +
          (settings.textEncoding || "auto") +
          ":" +
          item.asset_id +
          ":" +
          item.title +
          ":" +
          item.author,
      )
      .digest("hex");
    this.keys.set(item.asset_id, key);
    const output = path.join(this.dir, key + ".epub");
    const cached = await fs.readFile(output).catch(() => null);
    if (cached) {
      await fs.utimes(output, new Date(), new Date()).catch(() => {});
      return cached;
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const run = this.convert(file, bytes, item, settings, output).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, run);
    return run;
  }
  async convert(file, bytes, item, settings, output) {
    const format = path.extname(file).slice(1).toLowerCase();
    let result;
    if (["txt", "md", "markdown", "html", "htm", "xhtml"].includes(format)) {
      const text = decode(bytes, settings.textEncoding || "auto").replace(
        /^\ufeff/,
        "",
      );
      let sections;
      if (format === "txt") {
        sections = [];
        let lines = [],
          title = item.title,
          length = 0;
        const flush = () => {
          if (lines.length)
            sections.push({
              title,
              html: lines
                .map((l) => (l.trim() ? `<p>${escape(l)}</p>` : "<p><br/></p>"))
                .join(""),
            });
          lines = [];
          length = 0;
        };
        for (const line of text.split(/\r?\n/)) {
          if (
            lines.length &&
            (/^(第.{1,20}[章节卷回部]|chapter\s+\d+)/i.test(line.trim()) ||
              length > 30000)
          ) {
            flush();
            title = line.trim().slice(0, 80) || `第 ${sections.length + 1} 节`;
          }
          lines.push(line);
          length += line.length;
        }
        flush();
      } else {
        let html =
            format === "md" || format === "markdown"
              ? marked.parse(text, { async: false })
              : text,
          total = 0;
        for (const ref of new Set(imageRefs(html, "html"))) {
          const image = await localImage(file, ref);
          if (image) {
            total += image.bytes.length;
            if (total > 80 * 1048576) throw Error("文档附属图片超过 80 MB");
            html = html
              .split('"' + ref + '"')
              .join(
                '"data:' +
                  image.mime +
                  ";base64," +
                  image.bytes.toString("base64") +
                  '"',
              )
              .split("'" + ref + "'")
              .join(
                '"data:' +
                  image.mime +
                  ";base64," +
                  image.bytes.toString("base64") +
                  '"',
              );
          }
        }
        sections = [{ title: item.title, html: safeMarkup(html) }];
      }
      result = await epub(
        item,
        sections.length
          ? sections
          : [{ title: item.title, html: "<p>空白文档</p>" }],
      );
    } else if (format === "fb2") {
      const doc = xmlDocument(decode(bytes, settings.textEncoding || "auto")),
        assets = [];
      const binaries = new Map();
      for (const node of Array.from(doc.getElementsByTagName("binary"))) {
        const mime = node.getAttribute("content-type");
        if (["image/jpeg", "image/png", "image/webp"].includes(mime)) {
          const data = Buffer.from(
            node.textContent.replace(/\s/g, ""),
            "base64",
          );
          if (data.length > 15 * 1048576) throw Error("FB2 图片过大");
          const name =
            "image" +
            assets.length +
            (mime === "image/png"
              ? ".png"
              : mime === "image/webp"
                ? ".webp"
                : ".jpg");
          assets.push({ name, mime, bytes: data });
          binaries.set(node.getAttribute("id"), name);
        }
      }
      const render = (node) => {
        if (node.nodeType === 3) return escape(node.textContent);
        if (node.nodeType !== 1) return "";
        const tag = node.localName,
          children = Array.from(node.childNodes).map(render).join("");
        if (tag === "image") {
          const name = binaries.get(
            (
              node.getAttribute("l:href") ||
              node.getAttribute("xlink:href") ||
              node.getAttribute("href") ||
              ""
            ).replace(/^#/, ""),
          );
          return name ? `<img src="${name}"/>` : "";
        }
        const map = {
          section: "section",
          title: "h2",
          subtitle: "h3",
          p: "p",
          emphasis: "em",
          strong: "strong",
          strikethrough: "s",
          poem: "blockquote",
          stanza: "section",
          v: "p",
          "empty-line": "br",
          table: "table",
          tr: "tr",
          td: "td",
          th: "th",
          sup: "sup",
          sub: "sub",
        };
        return map[tag]
          ? map[tag] === "br"
            ? "<br/>"
            : `<${map[tag]}>${children}</${map[tag]}>`
          : children;
      };
      const sections = Array.from(doc.getElementsByTagName("body")).map(
        (node, i) => ({
          title:
            node.getAttribute("name") || `${item.title}${i ? " · 附注" : ""}`,
          html: render(node),
        }),
      );
      if (!sections.length) throw Error("FB2 缺少正文");
      result = await epub(item, sections, assets);
    } else if (["cbz", "cbt"].includes(format))
      result = await comic(bytes, format, item);
    else if (CALIBRE.includes(format)) {
      const converter = await this.converter(settings.calibrePath);
      if (!converter)
        throw Error(
          `${format.toUpperCase()} 需要 Calibre 转换组件。请在设置 → 格式支持中选择 ebook-convert 程序`,
        );
      const temp = await fs.mkdtemp(
        path.join(os.tmpdir(), "booksplus-convert-"),
      );
      try {
        const source = path.join(temp, "source." + format),
          dest = path.join(temp, "book.epub");
        await fs.writeFile(source, bytes);
        await exec(
          converter,
          [
            source,
            dest,
            "--title",
            item.title || "Untitled",
            "--authors",
            item.author || "Unknown",
          ],
          { timeout: 180000, maxBuffer: 2 * 1048576, windowsHide: true },
        );
        result = await fs.readFile(dest);
        const zip = await JSZip.loadAsync(result);
        if (!zip.file("META-INF/container.xml"))
          throw Error("转换结果不是有效 EPUB");
      } catch (e) {
        throw Error("转换失败：" + String(e.stderr || e.message).slice(-1200));
      } finally {
        await fs.rm(temp, { recursive: true, force: true });
      }
    } else throw Error("尚不支持此文件格式：" + format);
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = output + "." + crypto.randomUUID() + ".tmp";
    await fs.writeFile(tmp, result);
    await fs.rename(tmp, output);
    return result;
  }
  async prune(days) {
    if (!days) return;
    const cutoff = Date.now() - days * 86400000;
    for (const name of await fs.readdir(this.dir).catch(() => [])) {
      if (!/^[a-f0-9]{64}\.epub$/.test(name)) continue;
      const file = path.join(this.dir, name);
      if ((await fs.stat(file)).mtimeMs < cutoff) await fs.rm(file);
    }
  }
  async remove(key) {
    if (/^[a-f0-9]{64}$/.test(key || ""))
      await fs.rm(path.join(this.dir, key + ".epub"), { force: true });
  }
}
module.exports = { Formats, BUILTIN, CALIBRE, decode, epub, copyCompanions };
