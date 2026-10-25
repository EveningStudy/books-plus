const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const JSZip = require("jszip");
const crc32 = require("jszip/lib/crc32");
const { XMLParser } = require("fast-xml-parser");
const {
  atomicJson,
  json,
  within,
  mergeDevices,
  readDevices,
} = require("./library.cjs");
const exec = promisify(execFile);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
});
const array = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const appleTime = (value) =>
  Number(value) > 0
    ? new Date((Number(value) + 978307200) * 1000).toISOString()
    : null;
const safeId = (value) =>
  typeof value === "string" &&
  /^[a-zA-Z0-9_-]{1,200}$/.test(value) &&
  !["__proto__", "constructor", "prototype"].includes(value);
async function publishJson(file, value) {
  const previous = await json(file, null);
  if (previous && JSON.stringify(previous) === JSON.stringify(value)) return;
  await atomicJson(file, value);
}
function pointCFI(cfi) {
  if (
    typeof cfi !== "string" ||
    cfi.length > 8192 ||
    !/^epubcfi\([\s\S]+\)$/.test(cfi) ||
    /[\x00-\x1f\x7f#]/.test(cfi)
  )
    return null;
  // epub.js range CFI => its start point; honor escaped commas and assertions.
  const body = cfi.slice(8, -1),
    parts = [];
  let part = "",
    depth = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "^") {
      part += c + (body[++i] || "");
      continue;
    }
    if (c === "[") depth++;
    if (c === "]") depth--;
    if (depth < 0) return null;
    if (c === "," && depth === 0) {
      parts.push(part);
      part = "";
    } else part += c;
  }
  parts.push(part);
  if (depth || ![1, 3].includes(parts.length)) return null;
  const point = parts.length === 3 ? parts[0] + parts[1] : body;
  if (!/^\/\d+/.test(point) || !point.includes("!")) return null;
  return `epubcfi(${point})`;
}
function cfiKey(cfi) {
  return pointCFI(cfi)?.replace(/\[(?:\^.|[^\]])*\]/g, "") || null;
}
function deepLink(assetId, cfi) {
  if (!safeId(assetId) || !pointCFI(cfi))
    throw Error("Apple asset ID 或 EPUB CFI 无效");
  // Keep CFI grammar; encode URL delimiters that can occur inside CFI assertions.
  return `ibooks://assetid/${assetId}#${pointCFI(cfi).replace(/[%?\s"<>`\u0080-\u{10ffff}]/gu, (c) => encodeURIComponent(c))}`;
}
async function epubInfo(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter(
      (n) =>
        !zip.files[n].dir &&
        path.posix.basename(n) !== ".DS_Store" &&
        !(!n.includes("/") && (/\.plist$/i.test(n) || /^bookmarks/i.test(n))),
    )
    .sort();
  if (
    names.some(
      (n) =>
        n.startsWith("/") || n.split("/").includes("..") || n.includes("\\"),
    )
  )
    throw Error("EPUB 含越界路径");
  let total = 0;
  for (const name of names) {
    total += zip.files[name]._data?.uncompressedSize || 0;
    if (total > 512 * 1048576) throw Error("EPUB 解压后超过 512 MB");
  }
  if (
    (await zip.file("mimetype")?.async("string"))?.trim() !==
    "application/epub+zip"
  )
    throw Error("EPUB mimetype 无效");
  const container = xml.parse(
    (await zip.file("META-INF/container.xml")?.async("string")) || "",
  );
  const opfPath = array(container.container?.rootfiles?.rootfile)[0]?.[
    "full-path"
  ];
  const opfFile = opfPath && zip.file(opfPath);
  if (!opfFile) throw Error("EPUB 缺少 OPF");
  const pkg = xml.parse(await opfFile.async("string")).package;
  const manifest = array(pkg?.manifest?.item);
  if (!array(pkg?.spine?.itemref).length) throw Error("EPUB 缺少阅读顺序");
  for (const ref of array(pkg.spine.itemref)) {
    const item = manifest.find((i) => i.id === ref.idref);
    if (
      !item ||
      !zip.file(
        path.posix.normalize(
          path.posix.join(
            path.posix.dirname(opfPath),
            decodeURIComponent(item.href),
          ),
        ),
      )
    )
      throw Error("EPUB 缺少章节正文");
  }
  const encryption = zip.file("META-INF/encryption.xml");
  if (encryption) {
    const source = await encryption.async("string");
    const algorithms = [
      ...source.matchAll(/Algorithm\s*=\s*["']([^"']+)["']/g),
    ].map((m) => m[1]);
    if (
      !algorithms.length ||
      algorithms.some(
        (a) =>
          ![
            "http://www.idpf.org/2008/embedding",
            "http://ns.adobe.com/pdf/enc#RC",
          ].includes(a),
      )
    )
      throw Error("受 DRM 保护的 EPUB 无法同步到阅读器");
  }
  const h = crypto.createHash("sha256");
  for (const name of names) {
    const content = await zip.file(name).async("nodebuffer");
    if (crc32(content) !== zip.file(name)._data.crc32)
      throw Error("EPUB CRC 校验失败");
    h.update(name + "\0" + content.length + "\0");
    h.update(content);
  }
  const ids = array(pkg.metadata?.identifier);
  const identifier =
    ids.find((i) => i?.id === pkg["unique-identifier"]) || ids[0];
  return {
    fingerprint: h.digest("hex"),
    identifier:
      typeof identifier === "object" ? identifier["#text"] : identifier,
    title: pkg.metadata?.title,
    author: pkg.metadata?.creator,
  };
}
class NativeBooks {
  constructor(binary) {
    this.binary = binary;
  }
  async run(command, ...args) {
    const { stdout } = await exec(this.binary, [command, ...args], {
      timeout: 45000,
      maxBuffer: 32 * 1048576,
    });
    return JSON.parse(stdout);
  }
  snapshot() {
    return this.run("snapshot");
  }
  source(file) {
    return this.run("source", file);
  }
  open(file) {
    return exec("/usr/bin/open", ["-a", "Books", file], { timeout: 15000 });
  }
  jump(asset, cfi) {
    return exec("/usr/bin/open", [deepLink(asset, cfi)], { timeout: 15000 });
  }
  watch(root, changed, failed) {
    const home = os.homedir();
    const paths = [
      root,
      path.join(home, "Library/Containers/com.apple.iBooksX/Data/Documents"),
      path.join(home, "Library/Group Containers/group.com.apple.iBooks"),
      path.join(
        home,
        "Library/Mobile Documents/iCloud~com~apple~iBooks/Documents",
      ),
      path.join(
        home,
        "Library/Containers/com.apple.BKAgentService/Data/Documents/iBooks/Books",
      ),
    ];
    const child = spawn(this.binary, ["watch", ...paths], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "",
      errors = "",
      stopped = false;
    child.stdout.on("data", (bytes) => {
      buffer += bytes;
      for (let end; (end = buffer.indexOf("\n")) >= 0;) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          if (JSON.parse(line).changed) changed();
        } catch {}
      }
    });
    child.stderr.on("data", (b) => {
      errors = (errors + b).slice(-1500);
    });
    child.on("error", (e) => {
      if (!stopped) failed(e);
    });
    child.on("exit", (code) => {
      if (!stopped) failed(Error(errors || `FSEvents helper exited ${code}`));
    });
    return () => {
      stopped = true;
      child.kill();
    };
  }
}
async function sourceBook(native, asset, previous) {
  let file = asset.ZPATH;
  if (!file) throw Error("Apple Books 尚未下载正文");
  if (file.startsWith("file:")) file = require("node:url").fileURLToPath(file);
  const description = await native.source(file);
  const signature = hash(JSON.stringify(description));
  if (previous?.sourceSignature === signature && previous.fingerprint)
    return { ...previous, unchanged: true };
  const ext = path.extname(file).toLowerCase();
  if (![".epub", ".pdf"].includes(ext))
    throw Error(`Apple Books 导出暂不支持 ${ext || "此格式"}`);
  let bytes;
  if (description.directory) {
    if (ext !== ".epub") throw Error("只支持 EPUB 文件包");
    const zip = new JSZip();
    const options = {
      date: new Date("2000-01-01T00:00:00Z"),
      createFolders: false,
    };
    zip.file("mimetype", "application/epub+zip", {
      ...options,
      compression: "STORE",
    });
    for (const entry of description.entries)
      if (entry.name !== "mimetype")
        zip.file(entry.name, await fs.readFile(entry.path), options);
    bytes = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  } else bytes = await fs.readFile(file);
  // Never publish a package changed halfway through reading.
  if (signature !== hash(JSON.stringify(await native.source(file))))
    throw Error("Apple Books 正文正在变化，等待下次同步");
  const info =
    ext === ".epub" ? await epubInfo(bytes) : { fingerprint: hash(bytes) };
  if (ext === ".pdf" && bytes.subarray(0, 5).toString() !== "%PDF-")
    throw Error("PDF 文件无效");
  return { ...info, bytes, ext, sourceSignature: signature };
}
function readingFor(asset, tables, revision) {
  const candidates = [
    ...array(tables.ZAEANNOTATION)
      .filter(
        (r) =>
          r.ZANNOTATIONASSETID === asset.ZASSETID &&
          r.ZANNOTATIONTYPE === 3 &&
          !r.ZANNOTATIONDELETED,
      )
      .map((r) => ({
        cfi: r.ZANNOTATIONLOCATION,
        time: r.ZANNOTATIONMODIFICATIONDATE || r.ZANNOTATIONCREATIONDATE,
      })),
    ...array(tables.ZBCASSETDETAIL)
      .filter((r) => r.ZASSETID === asset.ZASSETID && !r.ZDELETEDFLAG)
      .map((r) => ({
        cfi: r.ZREADINGPOSITIONCFISTRING,
        time: r.ZREADINGPOSITIONLOCATIONUPDATEDATE,
      })),
  ]
    .filter((r) => pointCFI(r.cfi))
    .sort((a, b) => (b.time || 0) - (a.time || 0));
  // Opening a book is not proof that an old position annotation changed.
  const time =
    candidates[0]?.time ||
    Math.max(asset.ZLASTENGAGEDDATE || 0, asset.ZLASTOPENDATE || 0);
  return {
    contentRevision: revision,
    ...(candidates[0] ? { cfi: pointCFI(candidates[0].cfi) } : {}),
    progress: Math.max(0, Math.min(1, asset.ZREADINGPROGRESS || 0)),
    updatedAt:
      appleTime(time) ||
      appleTime(asset.ZCREATIONDATE) ||
      "2001-01-01T00:00:00.000Z",
  };
}
const readingKey = (reading) =>
  hash(
    JSON.stringify([
      reading.contentRevision,
      cfiKey(reading.cfi),
      Math.round((reading.progress || 0) * 100000),
    ]),
  );
async function safeCloudPath(root, relative) {
  const file = within(root, relative),
    real = await fs.realpath(file),
    base = await fs.realpath(root);
  if (!real.startsWith(base + path.sep)) throw Error("云盘文件链接超出书库");
  return real;
}
async function writeContent(root, relative, bytes) {
  const dest = within(root, relative);
  await ensureCloudDir(root, path.posix.dirname(relative));
  const realParent = await fs.realpath(path.dirname(dest));
  if (!realParent.startsWith((await fs.realpath(root)) + path.sep))
    throw Error("输出链接超出书库");
  try {
    const stat = await fs.lstat(dest);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw Error("正文目标不是普通文件");
    if (hash(await fs.readFile(dest)) !== hash(bytes))
      throw Error("不可变正文校验失败");
    return;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const temporary = `${dest}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    await fs.rename(temporary, dest);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}
async function validateCloudRoot(root) {
  const realRoot = await fs.realpath(root);
  for (const rel of [
    "Library/Containers/com.apple.iBooksX",
    "Library/Containers/com.apple.BKAgentService",
    "Library/Group Containers/group.com.apple.iBooks",
    "Library/Mobile Documents/iCloud~com~apple~iBooks",
  ]) {
    const source = path.join(os.homedir(), rel);
    if (
      realRoot === source ||
      realRoot.startsWith(source + path.sep) ||
      source.startsWith(realRoot + path.sep)
    )
      throw Error("云端书库必须与 Apple Books 原始容器分开");
  }
}
async function ensureCloudDir(root, relative) {
  let current = root;
  for (const component of relative.split("/")) {
    if (!/^[a-zA-Z0-9_-]+$/.test(component)) throw Error("无效的云盘目录");
    current = path.join(current, component);
    try {
      await fs.mkdir(current);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw Error("云盘目录包含链接或不是文件夹");
  }
}
class AppleBooksSync {
  constructor(library, native, notify = () => {}) {
    this.library = library;
    this.native = native;
    this.notify = notify;
    this.queue = Promise.resolve();
    this.status = {
      enabled: false,
      running: false,
      issues: [],
      mappings: [],
      pending: 0,
    };
  }
  enabled() {
    const m = this.library.config.settings?.mac?.mode;
    return process.platform === "darwin" && ["sync", "both"].includes(m);
  }
  start() {
    this.stop();
    if (!this.enabled()) {
      this.status.enabled = false;
      return;
    }
    this.stopped = false;
    this.status.enabled = true;
    this.observe();
    this.timer = setInterval(() => this.sync(), 30000);
    this.timer.unref();
    this.sync();
  }
  schedule() {
    // Bound the delay even if File Provider keeps emitting metadata events.
    if (this.debounce) return;
    this.debounce = setTimeout(() => {
      this.debounce = null;
      this.sync();
    }, 1500);
    this.debounce.unref();
  }
  observe() {
    if (this.stopped) return;
    this.unwatch?.();
    this.status.watchError = null;
    this.unwatch = this.native.watch(
      this.library.config.root,
      () => this.schedule(),
      (e) => {
        this.status.watchError = e.message;
        this.publish();
        clearTimeout(this.watchRetry);
        if (!this.stopped) {
          this.watchRetry = setTimeout(() => this.observe(), 5000);
          this.watchRetry.unref();
        }
      },
    );
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    clearTimeout(this.debounce);
    this.debounce = null;
    this.resyncRequested = false;
    clearTimeout(this.watchRetry);
    this.unwatch?.();
    this.unwatch = null;
  }
  idle() {
    return Promise.all([this.queue, this.actionQueue]);
  }
  publish() {
    this.notify(this.getStatus());
  }
  getStatus() {
    return { ...this.status, loginSupported: process.platform === "darwin" };
  }
  sync() {
    if (!this.enabled() || this.stopped) return this.queue;
    if (this.queued || this.actionBusy) {
      this.resyncRequested = true;
      return this.queue;
    }
    this.queued = true;
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        this.status.running = true;
        this.publish();
        try {
          await this.cycle();
          this.status.error = null;
          this.status.lastSyncedAt = new Date().toISOString();
        } catch (e) {
          this.status.error = e.message;
        } finally {
          this.queued = false;
          this.status.running = false;
          this.publish();
          if (this.resyncRequested && !this.stopped) {
            this.resyncRequested = false;
            this.schedule();
          }
        }
        return this.getStatus();
      });
    return this.queue;
  }
  async cycle() {
    const root = this.library.config.root;
    if (this.boundRoot !== root) {
      this.boundRoot = root;
      this.state = null;
      this.stateFile = null;
      this.status.mappings = [];
      this.status.imports = [];
      this.status.assets = [];
      this.status.pending = 0;
    }
    await validateCloudRoot(root);
    await ensureCloudDir(root, "catalog/extra");
    await ensureCloudDir(root, "reader-state/v1/devices");
    const catalog = await this.library.catalog(root);
    const key = hash(
      catalog.libraryId
        ? `catalog:${catalog.libraryId}`
        : `folder:${path.resolve(root)}`,
    ).slice(0, 32);
    const local = path.join(
      this.library.userDir,
      "libraries",
      key,
      "apple-books",
    );
    this.stateFile = path.join(local, "sync.json");
    const identityFile = path.join(
      this.library.userDir,
      "apple-books-device.json",
    );
    let identity = await json(identityFile, null);
    if (!identity) {
      identity = { deviceId: crypto.randomUUID() };
      await atomicJson(identityFile, identity);
    }
    this.state = await json(this.stateFile, {
      version: 1,
      deviceId: identity.deviceId,
      mappings: {},
      sources: {},
      imports: {},
      device: { version: 1, books: {} },
    });
    const state = this.state;
    state.device.deviceId = state.deviceId;
    state.device.deviceName = "Apple Books";
    state.device.deviceType = "apple-books";
    const previousBooks = JSON.stringify(state.device.books);
    const persist = () => publishJson(this.stateFile, state);
    const snapshot = await this.native.snapshot();
    if (!snapshot.libraryAvailable)
      throw Error(
        "无法读取 Apple Books 书库。请在系统设置 → 隐私与安全性 → 完全磁盘访问中允许 Books+，然后重启应用。",
      );
    const tables = snapshot.tables;
    const assets = new Map(
      array(tables.ZBKLIBRARYASSET)
        .filter((a) => safeId(a.ZASSETID))
        .map((a) => [a.ZASSETID, a]),
    );
    this.status.issues = snapshot.errors.map((error) => ({ error }));
    const lifecycleDevices = await readDevices(root);
    const lifecycleState = mergeDevices([
      { version: 1, books: this.library.merged },
      ...lifecycleDevices.devices,
      this.library.device,
    ]);
    const deletedIds = new Set(
      Object.entries(lifecycleState)
        .filter(([, b]) => b.lifecycle?.deleted)
        .map(([id]) => id),
    );
    const cloudBooks = new Map(
      catalog.raw
        .filter((b) => !deletedIds.has(b.asset_id))
        .map((b) => [b.asset_id, b]),
    );
    for (const book of cloudBooks.values()) {
      if (book.file && !book.revision && !book.sha256) {
        try {
          const stat = await fs.stat(await safeCloudPath(root, book.file));
          book.revision = `${stat.size}:${stat.mtimeMs}`;
        } catch {}
      }
    }
    const used = new Map(
      Object.entries(state.mappings).map(([id, m]) => [m.assetId, id]),
    );
    // Verify and cache source revisions. EPUB content fingerprint ignores ZIP timestamps.
    const sourceInfo = new Map();
    const reservedSources = new Set();
    for (const id of deletedIds)
      reservedSources.add(state.mappings[id]?.assetId || id);
    for (const [assetId, asset] of assets) {
      try {
        const source = await sourceBook(
          this.native,
          asset,
          state.sources[assetId],
        );
        sourceInfo.set(assetId, source);
        state.sources[assetId] = {
          sourceSignature: source.sourceSignature,
          fingerprint: source.fingerprint,
          identifier: source.identifier,
          ext: source.ext,
        };
      } catch (e) {
        this.status.issues.push({
          assetId,
          title: asset.ZTITLE,
          error: e.message,
        });
      }
    }
    // Cloud -> Books: match exact content, confirm imports from subsequent read-only snapshots.
    for (const [id, book] of cloudBooks) {
      if (
        state.mappings[id] ||
        !book.file ||
        !/\.(epub|pdf)$/i.test(book.file) ||
        book.file.startsWith("unvalidated-books/")
      )
        continue;
      try {
        const file = await safeCloudPath(root, book.file),
          bytes = await fs.readFile(file);
        if (book.sha256 && hash(bytes) !== book.sha256)
          throw Error("云盘正文 SHA-256 校验失败");
        const info = /\.epub$/i.test(file)
          ? await epubInfo(bytes)
          : { fingerprint: hash(bytes) };
        const allCandidates = [...sourceInfo].filter(
          ([, source]) => source.fingerprint === info.fingerprint,
        );
        for (const [assetId] of allCandidates) reservedSources.add(assetId);
        const candidates = allCandidates.filter(
          ([assetId]) => !used.has(assetId),
        );
        if (allCandidates.length && !candidates.length)
          throw Error(
            "相同正文的 Apple asset 已映射到另一云书，请检查重复书目",
          );
        if (candidates.length > 1)
          throw Error("多个 Apple asset 内容相同，请手动选择映射");
        if (candidates.length === 1) {
          const [assetId, source] = candidates[0];
          state.mappings[id] = {
            assetId,
            revision: book.revision || book.sha256,
            fingerprint: source.fingerprint,
            identifier: source.identifier,
          };
          used.set(assetId, id);
          delete state.imports[id];
          await persist();
          continue;
        }
        if (state.imports[id]) {
          if (Date.now() - state.imports[id].at > 120000)
            this.status.issues.push({
              id,
              title: book.title,
              error:
                "已提交导入，尚未确认 Apple asset。请检查 Books 或重试导入。",
            });
          continue;
        }
        // Journal before opening: a crash must not repeatedly import the same file.
        state.imports[id] = { at: Date.now(), fingerprint: info.fingerprint };
        await persist();
        await this.native.open(file);
      } catch (e) {
        this.status.issues.push({ id, title: book.title, error: e.message });
      }
    }
    // Books -> Cloud: publish immutable bodies first, then one sidecar per asset.
    for (const [assetId, asset] of assets) {
      const source = sourceInfo.get(assetId);
      if (!source || used.has(assetId) || reservedSources.has(assetId))
        continue;
      try {
        if (
          state.imports &&
          Object.values(state.imports).some(
            (i) => i.fingerprint === source.fingerprint,
          )
        )
          continue;
        const existing = cloudBooks.get(assetId);
        if (existing) throw Error("Apple asset ID 与已有云书冲突，请手动映射");
        const full = source.bytes
          ? source
          : await sourceBook(this.native, asset, null);
        const sha256 = hash(full.bytes),
          relative = `content/${assetId}/${sha256}${source.ext}`;
        await writeContent(root, relative, full.bytes);
        const names = new Map(
          array(tables.ZBKCOLLECTION)
            .filter((c) => !c.ZDELETEDFLAG)
            .map((c) => [c.Z_PK, c.ZTITLE]),
        );
        const book = {
          id: assetId,
          title: asset.ZTITLE || "未命名图书",
          author: asset.ZAUTHOR || "未知作者",
          addedAt: appleTime(asset.ZCREATIONDATE) || new Date().toISOString(),
          collections: array(tables.ZBKCOLLECTIONMEMBER)
            .filter((m) => m.ZASSETID === assetId)
            .map((m) => names.get(m.ZCOLLECTION))
            .filter(Boolean),
          content: { path: relative, revision: sha256, sha256 },
          appleBooks: {
            assetId,
            epubIdentifier: source.identifier,
            publisherDeviceId: state.deviceId,
          },
        };
        await atomicJson(path.join(root, "catalog/extra", assetId + ".json"), {
          version: 2,
          book,
        });
        state.mappings[assetId] = {
          assetId,
          revision: sha256,
          fingerprint: source.fingerprint,
          identifier: source.identifier,
          published: true,
        };
        used.set(assetId, assetId);
        cloudBooks.set(assetId, {
          asset_id: assetId,
          file: relative,
          revision: sha256,
          sha256,
          title: book.title,
        });
        await persist();
      } catch (e) {
        this.status.issues.push({
          assetId,
          title: asset.ZTITLE,
          error: e.message,
        });
      }
    }
    const devices = [state.device];
    const folder = path.join(root, "reader-state/v1/devices");
    for (const name of await fs.readdir(folder).catch((e) => {
      if (e.code === "ENOENT") return [];
      throw e;
    })) {
      if (
        !/^[a-zA-Z0-9_-]+\.json$/.test(name) ||
        name === state.deviceId + ".json"
      )
        continue;
      try {
        devices.push(await json(path.join(folder, name)));
      } catch (e) {
        this.status.issues.push({ error: `同步快照 ${name}: ${e.message}` });
      }
    }
    const remote = mergeDevices(devices);
    for (const [id, mapping] of Object.entries(state.mappings)) {
      const asset = assets.get(mapping.assetId),
        source = sourceInfo.get(mapping.assetId),
        book = cloudBooks.get(id);
      if (!asset || !source || !book) continue;
      try {
        if (mapping.published) {
          const file = path.join(root, "catalog/extra", id + ".json"),
            sidecar = await json(file);
          if (sidecar.book?.appleBooks?.publisherDeviceId !== state.deviceId)
            throw Error("书目发布者已改变，已暂停此映射；请重新核对书目所有权");
          sidecar.book.title = asset.ZTITLE || "未命名图书";
          sidecar.book.author = asset.ZAUTHOR || "未知作者";
          const names = new Map(
            array(tables.ZBKCOLLECTION)
              .filter((c) => !c.ZDELETEDFLAG)
              .map((c) => [c.Z_PK, c.ZTITLE]),
          );
          sidecar.book.collections = array(tables.ZBKCOLLECTIONMEMBER)
            .filter((m) => m.ZASSETID === mapping.assetId)
            .map((m) => names.get(m.ZCOLLECTION))
            .filter(Boolean);
          await publishJson(file, sidecar);
        }
        const revision = book.revision || book.sha256;
        if (
          source.fingerprint !== mapping.fingerprint ||
          revision !== mapping.revision
        ) {
          // Auto-publish a new Apple revision only for the sidecar we own.
          if (!mapping.published || revision !== mapping.revision)
            throw Error("正文修订已改变，已停止位置回写；请重新核对映射");
          const full = source.bytes
              ? source
              : await sourceBook(this.native, asset, null),
            sha256 = hash(full.bytes);
          const relative = `content/${id}/${sha256}${full.ext}`;
          await writeContent(root, relative, full.bytes);
          const sidecarPath = path.join(root, "catalog/extra", id + ".json"),
            sidecar = await json(sidecarPath);
          sidecar.book.content = { path: relative, revision: sha256, sha256 };
          await atomicJson(sidecarPath, sidecar);
          mapping.revision = sha256;
          mapping.fingerprint = source.fingerprint;
          delete mapping.observed;
          delete mapping.pending;
          await persist();
          continue;
        }
        const observed = readingFor(asset, tables, revision),
          observedKey = readingKey(observed);
        const current = (state.device.books[id] ||= { marks: {} });
        const statusAt = appleTime(asset.ZDATEFINISHED) || observed.updatedAt;
        if (
          asset.ZISFINISHED != null &&
          mapping.finished !== !!asset.ZISFINISHED
        ) {
          if (
            mapping.finished !== undefined ||
            !remote[id]?.status ||
            statusAt > remote[id].status.updatedAt
          )
            current.status = {
              ...(remote[id]?.status || current.status || {}),
              finished: !!asset.ZISFINISHED,
              updatedAt: statusAt,
            };
          mapping.finished = !!asset.ZISFINISHED;
        }
        for (const annotation of array(tables.ZAEANNOTATION).filter(
          (a) =>
            a.ZANNOTATIONASSETID === mapping.assetId &&
            a.ZANNOTATIONTYPE !== 3 &&
            a.ZANNOTATIONUUID,
        )) {
          const markId = `apple-${annotation.ZANNOTATIONUUID}`;
          current.marks[markId] = {
            id: markId,
            type: annotation.ZANNOTATIONTYPE === 1 ? "bookmark" : "highlight",
            cfi: annotation.ZANNOTATIONLOCATION,
            text:
              annotation.ZANNOTATIONSELECTEDTEXT ||
              annotation.ZANNOTATIONREPRESENTATIVETEXT ||
              "",
            note: annotation.ZANNOTATIONNOTE || "",
            deleted: !!annotation.ZANNOTATIONDELETED,
            updatedAt:
              appleTime(
                annotation.ZANNOTATIONMODIFICATIONDATE ||
                  annotation.ZANNOTATIONCREATIONDATE,
              ) || observed.updatedAt,
          };
        }
        if (mapping.pending) {
          const incoming = remote[id]?.reading;
          // A later remote session supersedes a previous unconfirmed navigation.
          if (
            incoming?.updatedAt > mapping.pending.reading.updatedAt &&
            incoming.contentRevision === revision &&
            pointCFI(incoming.cfi) &&
            this.library.config.settings?.mac?.writeback &&
            !snapshot.booksFrontmost
          ) {
            mapping.pending = {
              reading: incoming,
              at: Date.now(),
              beforeAt: observed.updatedAt,
            };
            await persist();
            await this.native.jump(mapping.assetId, incoming.cfi);
            continue;
          }
          const pending = mapping.pending;
          const changed =
            mapping.observed !== observedKey ||
            observed.updatedAt > (pending.beforeAt || "");
          if (changed && cfiKey(observed.cfi) === cfiKey(pending.reading.cfi)) {
            // Preserve the incoming timestamp; Books' navigation time must not win LWW.
            current.reading = { ...pending.reading, source: "apple-books-ack" };
            mapping.applied = pending.reading.updatedAt;
            mapping.observed = observedKey;
            mapping.observedAt = observed.updatedAt;
            delete mapping.pending;
          } else if (
            pending.baseline &&
            observedKey !== pending.baseline.key &&
            observed.updatedAt > pending.baseline.updatedAt &&
            Date.parse(observed.updatedAt) > pending.at
          ) {
            // A second independently saved location after the navigation is reading activity.
            // The first (possibly page-aligned) save remains a suppressed navigation echo.
            current.reading = { ...observed, source: "apple-books" };
            mapping.applied = pending.reading.updatedAt;
            mapping.observed = observedKey;
            mapping.observedAt = observed.updatedAt;
            delete mapping.pending;
          } else {
            if (changed && observed.updatedAt > (pending.beforeAt || ""))
              pending.baseline ||= {
                key: observedKey,
                updatedAt: observed.updatedAt,
              };
            pending.observed = observed;
            if (Date.now() - pending.at > 120000)
              this.status.issues.push({
                id,
                title: book.title,
                error:
                  "Books 尚未确认目标位置；保留待确认回写，暂停此书进度导出。可在设置中检查、重试或取消。",
              });
            continue;
          }
        } else if (mapping.observed !== observedKey) {
          // First sight of an older Apple position must not override a newer cloud position.
          current.reading = { ...observed, source: "apple-books" };
          mapping.observed = observedKey;
          mapping.observedAt = observed.updatedAt;
        }
        const incoming = remote[id]?.reading;
        if (
          !incoming ||
          incoming.updatedAt <= (current.reading?.updatedAt || "") ||
          incoming.updatedAt === mapping.applied
        )
          continue;
        if (incoming.contentRevision !== revision)
          throw Error("云端进度修订不一致，无法回写旧位置");
        if (!/\.epub$/i.test(book.file) || !pointCFI(incoming.cfi)) {
          this.status.issues.push({
            id,
            title: book.title,
            error:
              "Apple Books 位置回写需要同修订 EPUB 的有效 CFI；PDF/百分比仅导出。",
          });
          continue;
        }
        if (cfiKey(incoming.cfi) === cfiKey(observed.cfi)) {
          mapping.applied = incoming.updatedAt;
          current.reading = incoming;
          continue;
        }
        if (!this.library.config.settings?.mac?.writeback) {
          this.status.issues.push({
            id,
            title: book.title,
            error:
              "有新的云端阅读位置。开启“自动回写位置”或点“在 Books 中继续”。",
          });
          continue;
        }
        if (snapshot.booksFrontmost) {
          this.status.issues.push({
            id,
            title: book.title,
            error:
              "Books 正在前台阅读，已暂缓自动跳转；离开 Books 后应用新位置，或点“在 Books 中继续”。",
          });
          continue;
        }
        mapping.pending = {
          reading: incoming,
          at: Date.now(),
          beforeAt: observed.updatedAt,
        };
        await persist();
        await this.native.jump(mapping.assetId, incoming.cfi);
      } catch (e) {
        this.status.issues.push({ id, title: book.title, error: e.message });
      }
    }
    if (
      !state.device.updatedAt ||
      previousBooks !== JSON.stringify(state.device.books)
    )
      state.device.updatedAt = new Date().toISOString();
    await persist(); // Local journal always precedes cloud publication; failed writes retry.
    await publishJson(
      path.join(folder, state.deviceId + ".json"),
      state.device,
    );
    this.status.mappings = Object.entries(state.mappings).map(([id, m]) => ({
      id,
      assetId: m.assetId,
      revision: m.revision,
      title: cloudBooks.get(id)?.title || id,
      pending: !!m.pending,
      requestedCfi: m.pending?.reading.cfi,
      observedCfi: m.pending?.observed?.cfi,
      observedProgress: m.pending?.observed?.progress,
    }));
    this.status.pending = Object.values(state.mappings).filter(
      (m) => m.pending,
    ).length;
    this.status.imports = Object.keys(state.imports);
    this.status.assets = [...assets.values()].map((a) => ({
      id: a.ZASSETID,
      title: a.ZTITLE || a.ZASSETID,
    }));
  }
  action(action, id, assetId) {
    const result = (this.actionQueue || Promise.resolve()).then(async () => {
      this.actionBusy = true;
      try {
        await this.queue;
        await this.performAction(action, id, assetId);
      } finally {
        this.actionBusy = false;
      }
      return this.sync();
    });
    this.actionQueue = result.catch(() => {});
    return result;
  }
  async performAction(action, id, assetId) {
    if (this.boundRoot !== this.library.config.root)
      throw Error("书库已改变，请先重新同步");
    if (!this.stateFile || !this.state) throw Error("请先连接书库并运行同步");
    if (action === "retry-import") delete this.state.imports[id];
    else if (action === "cancel" || action === "retry" || action === "accept") {
      const mapping = this.state.mappings[id];
      if (!mapping?.pending) throw Error("没有待确认的位置");
      let verified;
      if (action !== "cancel") verified = await this.verifyMapping(id, mapping);
      if (action === "retry")
        await this.native.jump(mapping.assetId, mapping.pending.reading.cfi);
      else if (action === "accept") {
        const pending = mapping.pending;
        if (!pending.observed) throw Error("尚无 Books 保存的位置");
        if (
          readingKey(
            readingFor(verified.asset, verified.tables, mapping.revision),
          ) !== readingKey(pending.observed)
        )
          throw Error("Books 位置又有变化，请先立即同步并重新核对");
        this.state.device.books[id].reading = {
          ...pending.reading,
          source: "apple-books-user-confirmed",
        };
        mapping.observed = readingKey(pending.observed);
        mapping.observedAt = pending.observed.updatedAt;
        mapping.applied = pending.reading.updatedAt;
        delete mapping.pending;
      } else {
        mapping.applied = mapping.pending.reading.updatedAt;
        delete mapping.pending;
      }
    } else if (action === "continue") {
      const mapping = this.state.mappings[id];
      if (!mapping) throw Error("尚未映射到 Apple Books");
      const remote = [];
      const folder = path.join(
        this.library.config.root,
        "reader-state/v1/devices",
      );
      for (const n of await fs.readdir(folder))
        if (/^[a-zA-Z0-9_-]+\.json$/.test(n))
          remote.push(await json(path.join(folder, n)));
      const reading = mergeDevices(remote)[id]?.reading;
      if (
        !reading ||
        reading.contentRevision !== mapping.revision ||
        !pointCFI(reading.cfi)
      )
        throw Error("没有同修订的 EPUB 位置");
      const book = (
        await this.library.catalog(this.library.config.root)
      ).raw.find((b) => b.asset_id === id);
      if (!book || (book.revision || book.sha256) !== mapping.revision)
        throw Error("云书正文修订已改变，请重新核对映射");
      const asset = array(
        (await this.native.snapshot()).tables.ZBKLIBRARYASSET,
      ).find((a) => a.ZASSETID === mapping.assetId);
      if (
        !asset ||
        (await sourceBook(this.native, asset, null)).fingerprint !==
          mapping.fingerprint
      )
        throw Error("Apple Books 正文已改变");
      mapping.pending = {
        reading,
        at: Date.now(),
        beforeAt: mapping.observedAt,
      };
      await atomicJson(this.stateFile, this.state);
      await this.native.jump(mapping.assetId, reading.cfi);
    } else if (action === "map") {
      if (!safeId(id) || !safeId(assetId)) throw Error("映射 ID 无效");
      const book = (
        await this.library.catalog(this.library.config.root)
      ).raw.find((b) => b.asset_id === id);
      if (!book) throw Error("未知云端书籍");
      const bytes = await fs.readFile(
        await safeCloudPath(this.library.config.root, book.file),
      );
      if (book.sha256 && hash(bytes) !== book.sha256)
        throw Error("云盘 SHA 校验失败");
      const info = /\.epub$/i.test(book.file)
        ? await epubInfo(bytes)
        : { fingerprint: hash(bytes) };
      const asset = array(
        (await this.native.snapshot()).tables.ZBKLIBRARYASSET,
      ).find((a) => a.ZASSETID === assetId);
      if (!asset) throw Error("未知 Apple asset");
      const source = await sourceBook(this.native, asset, null);
      if (info.fingerprint !== source.fingerprint)
        throw Error("正文不一致，不能映射或套用旧 CFI");
      if (
        Object.entries(this.state.mappings).some(
          ([otherId, m]) => otherId !== id && m.assetId === assetId,
        )
      )
        throw Error("此 Apple asset 已映射到另一云书");
      this.state.mappings[id] = {
        assetId,
        revision: book.revision || book.sha256,
        fingerprint: source.fingerprint,
        identifier: source.identifier,
      };
      delete this.state.imports[id];
    } else throw Error("未知同步操作");
    await atomicJson(this.stateFile, this.state);
  }
  async verifyMapping(id, mapping) {
    const root = this.library.config.root;
    const book = (await this.library.catalog(root)).raw.find(
      (b) => b.asset_id === id,
    );
    if (!book) throw Error("云端书籍已不存在");
    const file = await safeCloudPath(root, book.file),
      stat = await fs.stat(file);
    const revision =
      book.revision || book.sha256 || `${stat.size}:${stat.mtimeMs}`;
    if (revision !== mapping.revision)
      throw Error("正文修订已改变，请重新核对映射");
    const snapshot = await this.native.snapshot();
    const asset = array(snapshot.tables.ZBKLIBRARYASSET).find(
      (a) => a.ZASSETID === mapping.assetId,
    );
    if (
      !asset ||
      (await sourceBook(this.native, asset, null)).fingerprint !==
        mapping.fingerprint
    )
      throw Error("Apple Books 正文已改变，请重新核对映射");
    return { asset, tables: snapshot.tables };
  }
}
module.exports = {
  validateCloudRoot,
  AppleBooksSync,
  NativeBooks,
  pointCFI,
  cfiKey,
  deepLink,
  epubInfo,
  sourceBook,
  readingFor,
  readingKey,
};
