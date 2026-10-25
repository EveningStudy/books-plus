const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const JSZip = require("jszip");
const { XMLParser } = require("fast-xml-parser");
const { CloudFiles } = require("./cloud-files.cjs");
const { Formats, BUILTIN, CALIBRE, copyCompanions } = require("./formats.cjs");

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const array = (value) =>
  value ? (Array.isArray(value) ? value : [value]) : [];
async function json(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}
async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, file);
        break;
      } catch (e) {
        if (!["EPERM", "EBUSY", "EACCES"].includes(e.code) || attempt >= 5)
          throw e;
        await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
      }
    }
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}
function within(root, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative))
    throw Error("无效的书籍路径");
  const full = path.resolve(root, relative);
  if (!full.startsWith(path.resolve(root) + path.sep))
    throw Error("书籍路径超出书库目录");
  return full;
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function newer(value, previous) {
  const time = Date.parse(value?.updatedAt);
  if (!Number.isFinite(time)) return false;
  const before = Date.parse(previous?.updatedAt);
  // Equal timestamps must converge independently of directory enumeration order.
  return (
    !Number.isFinite(before) ||
    time > before ||
    (time === before && stable(value) > stable(previous))
  );
}
function mergeDevices(devices) {
  const books = {};
  for (const device of devices) {
    if (
      device?.version !== 1 ||
      !device.books ||
      typeof device.books !== "object"
    )
      continue;
    for (const [id, data] of Object.entries(device.books)) {
      if (
        !data ||
        typeof data !== "object" ||
        ["__proto__", "constructor", "prototype"].includes(id)
      )
        continue;
      const target = (books[id] ||= { marks: {} });
      for (const field of ["reading", "preferences", "status", "lifecycle"])
        if (newer(data[field], target[field])) target[field] = data[field];
      for (const [markId, mark] of Object.entries(data.marks || {})) {
        if (["__proto__", "constructor", "prototype"].includes(markId))
          continue;
        if (newer(mark, target.marks[markId])) target.marks[markId] = mark;
      }
    }
  }
  return books;
}
async function readDevices(root) {
  const devices = [],
    errors = [];
  const folder = path.join(root, "reader-state/v1/devices");
  const names = await fs.readdir(folder).catch((e) => {
    if (e.code === "ENOENT") return [];
    throw e;
  });
  for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
    try {
      devices.push(await json(path.join(folder, name)));
    } catch (e) {
      errors.push(`同步快照 ${name}: ${e.message}`);
    }
  }
  return { devices, errors };
}

class Library {
  constructor(userDir, { cloud } = {}) {
    this.userDir = userDir;
    this.items = new Map();
    this.queue = Promise.resolve();
    this.cloud = cloud || new CloudFiles();
    this.storage = new Map();
    this.active = new Set();
    this.opening = new Set();
    this.epochs = new Map();
    this.importQueue = Promise.resolve();
  }
  async init() {
    this.config = await json(path.join(this.userDir, "config.json"), {});
    this.config.deviceId ||= crypto.randomUUID();
    this.config.root ||=
      process.platform === "darwin"
        ? path.join(
            require("node:os").homedir(),
            "Library/Mobile Documents/com~apple~CloudDocs/Books Export",
          )
        : path.join(require("node:os").homedir(), "iCloudDrive/Books Export");
    this.device = await json(path.join(this.userDir, "state-v1.json"), {
      version: 1,
      deviceId: this.config.deviceId,
      books: {},
    });
    this.legacyDevice = this.device;
    this.legacyRoot = this.config.root;
    await atomicJson(path.join(this.userDir, "config.json"), this.config);
    return this;
  }
  async configure(root) {
    if (this.active.size || this.opening.size || this.sweeping)
      throw Error("请先返回书库，等待下载或清理完成，再更改书库");
    const exists = await Promise.all(
      ["catalog.json", "library.json"].map((n) =>
        fs
          .stat(path.join(root, n))
          .then(() => true)
          .catch(() => false),
      ),
    );
    if (!exists.some(Boolean))
      await atomicJson(path.join(root, "catalog.json"), {
        version: 2,
        libraryId: crypto.randomUUID(),
        books: [],
      });
    await this.catalog(root);
    await this.queue;
    await this.downloadQueue;
    await this.importQueue;
    this.config.root = root;
    await atomicJson(path.join(this.userDir, "config.json"), this.config);
    return this.load();
  }
  async catalog(root) {
    const extra = [];
    const extraDir = path.join(root, "catalog/extra");
    for (const name of (
      await fs.readdir(extraDir).catch((e) => {
        if (e.code === "ENOENT") return [];
        throw e;
      })
    ).sort()) {
      if (!/^[a-zA-Z0-9_-]+\.json$/.test(name)) continue;
      const record = await json(path.join(extraDir, name));
      if (record.version === 2 && record.book) extra.push(record.book);
    }
    const mapBook = (b) => ({
      asset_id: b.id,
      title: b.title,
      author: b.author,
      file: b.content?.path,
      cover_file: b.cover?.path,
      revision: b.content?.revision || b.content?.sha256,
      sha256: b.content?.sha256,
      collections: b.collections || [],
      export_status: "exported",
      date_added: b.addedAt,
      reading_progress_fraction: 0,
    });
    const catalog = await json(path.join(root, "catalog.json"), null);
    if (catalog) {
      if (
        catalog.version !== 2 ||
        !Array.isArray(catalog.books) ||
        typeof catalog.libraryId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(catalog.libraryId)
      )
        throw Error(
          "不支持的 catalog.json 格式，需要 version 2 与稳定的 libraryId",
        );
      return {
        libraryId: catalog.libraryId,
        raw: [
          ...new Map(
            [...catalog.books, ...extra].map((b) => [b.id, b]),
          ).values(),
        ]
          .filter((b) => !b.deleted)
          .map(mapBook),
      };
    }
    const raw = await json(path.join(root, "library.json"));
    if (!Array.isArray(raw))
      throw Error("请选择包含 library.json 或 catalog.json 的云端书库文件夹");
    const combined = new Map(raw.map((b) => [b.asset_id, b]));
    for (const book of extra) {
      if (book.deleted) combined.delete(book.id);
      else combined.set(book.id, mapBook(book));
    }
    return { raw: [...combined.values()] };
  }
  async bind(libraryId) {
    const root = this.config.root;
    const identity = libraryId
      ? `catalog:${libraryId}`
      : `folder:${process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root)}`;
    const key = crypto
      .createHash("sha256")
      .update(identity)
      .digest("hex")
      .slice(0, 32);
    if (this.libraryKey === key) return;
    this.libraryKey = key;
    this.libraryId = libraryId;
    this.localDir = path.join(this.userDir, "libraries", key);
    this.formats = new Formats(path.join(this.localDir, "converted"));
    this.stateFile = path.join(this.localDir, "state-v1.json");
    this.mergedFile = path.join(this.localDir, "observed-v1.json");
    const observed = await json(this.mergedFile, { version: 1, books: {} });
    this.merged = mergeDevices([observed]);
    this.observedSerialized = stable(this.merged);
    this.device = await json(
      this.stateFile,
      root === this.legacyRoot
        ? this.legacyDevice
        : { version: 1, deviceId: this.config.deviceId, books: {} },
    );
    this.downloads = await json(path.join(this.localDir, "downloads.json"), {});
  }
  load() {
    const result = this.queue.then(() => this.loadNow());
    this.queue = result.catch(() => {});
    return result;
  }
  async loadNow() {
    const root = this.config.root;
    const [catalog, annotations, positions, history] = await Promise.all([
      this.catalog(root),
      json(path.join(root, "records/annotations.json"), []),
      json(path.join(root, "records/reading-positions.json"), []),
      json(path.join(root, "records/reading-time-history.json"), null),
    ]);
    const { raw, libraryId } = catalog;
    await this.bind(libraryId);
    if (!Array.isArray(raw)) throw Error("library.json 格式不正确");
    this.items = new Map(
      raw.filter((b) => b.asset_id).map((b) => [b.asset_id, b]),
    );
    const files = [];
    for (const [id, b] of this.items) {
      b._revision = b.revision || b.sha256;
      if (!b.file || b.file.startsWith("unvalidated-books/")) continue;
      try {
        const file = await this.bookPath(id),
          stat = await fs.stat(file);
        b._revision = b.revision || `${stat.size}:${stat.mtimeMs}`;
        if (
          !["epub", "kepub", "pdf"].includes(
            path.extname(file).slice(1).toLowerCase(),
          )
        )
          b._revision +=
            ":booksplus-convert-v1:" +
            (this.config.settings?.formats?.textEncoding || "auto");
        files.push({ id, path: file });
      } catch {}
    }
    const statuses = await this.cloud.inspect(files).catch(() =>
      files.map((f) => ({
        id: f.id,
        status: { state: "unknown", supported: false },
      })),
    );
    this.storage = new Map(statuses.map((s) => [s.id, s.status]));
    let syncError = null;
    try {
      const { devices, errors } = await readDevices(root);
      // Recover our own cloud snapshot after profile loss or an interrupted local backup.
      // Other devices remain read-only and never become our device identity.
      const own = devices.filter(
        (d) => d?.version === 1 && d.deviceId === this.config.deviceId,
      );
      this.device.books = mergeDevices([...own, this.device]);
      this.device.updatedAt = [
        this.device.updatedAt,
        ...own.map((d) => d.updatedAt),
      ]
        .filter(Boolean)
        .sort()
        .at(-1);
      // File providers can briefly omit or redeliver an older device snapshot.
      // Retain fields already observed, without publishing remote writes as ours.
      this.merged = mergeDevices([
        { version: 1, books: this.merged },
        ...devices,
        this.device,
      ]);
      if (errors.length) syncError = errors.join("；");
    } catch (e) {
      syncError = e.message;
      this.merged = mergeDevices([
        { version: 1, books: this.merged },
        this.device,
      ]);
    }
    const serialized = stable(this.merged);
    if (serialized !== this.observedSerialized) {
      await atomicJson(this.mergedFile, { version: 1, books: this.merged });
      this.observedSerialized = serialized;
    }
    const books = raw.map((b) => {
      const position = positions
        .filter(
          (p) => p.ZANNOTATIONASSETID === b.asset_id && !p.ZANNOTATIONDELETED,
        )
        .sort(
          (a, z) =>
            (z.ZANNOTATIONMODIFICATIONDATE || 0) -
            (a.ZANNOTATIONMODIFICATIONDATE || 0),
        )[0];
      const cloud = [...(b.cloud_reading_records || [])]
        .filter((c) => !c.ZDELETEDFLAG)
        .sort(
          (a, z) =>
            (z.ZREADINGPOSITIONLOCATIONUPDATEDATE || 0) -
            (a.ZREADINGPOSITIONLOCATIONUPDATEDATE || 0),
        )[0];
      const candidates = [
        {
          cfi: position?.ZANNOTATIONLOCATION,
          at: position?.ZANNOTATIONMODIFICATIONDATE || 0,
        },
        {
          cfi: cloud?.ZREADINGPOSITIONCFISTRING,
          at: cloud?.ZREADINGPOSITIONLOCATIONUPDATEDATE || 0,
        },
      ]
        .filter((p) => p.cfi?.startsWith("epubcfi("))
        .sort((a, z) => z.at - a.at);
      const saved = { ...(this.merged[b.asset_id] || {}) };
      if (
        saved.reading?.contentRevision &&
        saved.reading.contentRevision !== b._revision
      ) {
        saved.reading = {
          progress: saved.reading.progress,
          updatedAt: saved.reading.updatedAt,
        };
      }
      return {
        id: b.asset_id,
        title: b.title || "未命名图书",
        author: b.author || "未知作者",
        file: b.file,
        format: path
          .extname(b.file || "")
          .slice(1)
          .toLowerCase(),
        valid: !!b.file && !b.file.startsWith("unvalidated-books/"),
        exportStatus: b.export_status,
        contentRevision: b._revision,
        coverKey: `${this.libraryKey}:${b.asset_id}:${b._revision || ""}:${this.downloads[b.asset_id]?.lastReadAt || ""}`,
        storage: {
          ...(this.storage.get(b.asset_id) || {
            state: "missing",
            supported: false,
          }),
          offline: !!this.downloads[b.asset_id]?.offline,
          lastReadAt: this.downloads[b.asset_id]?.lastReadAt,
        },
        collections: b.collections || [],
        appleProgress: b.reading_progress_fraction || 0,
        appleCfi: candidates[0]?.cfi,
        lastOpened: saved.reading?.updatedAt || b.last_opened || b.date_added,
        finished: saved.status?.finished ?? !!b.finished,
        state: saved,
        annotations: annotations
          .filter(
            (a) =>
              a.ZANNOTATIONASSETID === b.asset_id &&
              !a.ZANNOTATIONDELETED &&
              a.ZANNOTATIONTYPE !== 3,
          )
          .map((a) => ({
            id: a.ZANNOTATIONUUID,
            cfi: a.ZANNOTATIONLOCATION,
            text:
              a.ZANNOTATIONSELECTEDTEXT ||
              a.ZANNOTATIONREPRESENTATIVETEXT ||
              "",
            note: a.ZANNOTATIONNOTE || "",
            type: a.ZANNOTATIONTYPE === 1 ? "bookmark" : "highlight",
            imported: true,
          })),
      };
    });
    return {
      root,
      books: books.filter((b) => !b.state.lifecycle?.deleted),
      trash: books.filter((b) => b.state.lifecycle?.deleted),
      history,
      libraryId,
      syncError,
      deviceId: this.config.deviceId,
      settings: this.config.settings || {},
      lastLoadedAt: new Date().toISOString(),
    };
  }
  async bookPath(id) {
    const item = this.items.get(id);
    if (!item?.file || item.file.startsWith("unvalidated-books/"))
      throw Error("这本书是未验证的备份，暂不能打开");
    const file = within(this.config.root, item.file);
    const real = await fs.realpath(file);
    const root = await fs.realpath(this.config.root);
    if (!real.startsWith(root + path.sep)) throw Error("书籍链接超出书库目录");
    return real;
  }
  async read(id) {
    if (this.merged?.[id]?.lifecycle?.deleted)
      throw Error("这本书已在最近删除中，请先恢复");
    const epoch = (this.epochs.get(id) || 0) + 1;
    this.epochs.set(id, epoch);
    const localDir = this.localDir,
      formats = this.formats,
      item = this.items.get(id);
    this.opening.add(id);
    try {
      const file = await this.bookPath(id);
      const bytes = await fs.readFile(file);
      if (
        item.sha256 &&
        crypto.createHash("sha256").update(bytes).digest("hex") !== item.sha256
      )
        throw Error("书籍校验失败，云盘可能还在同步，请稍后重试");
      const prepared = await formats.prepare(
        file,
        bytes,
        item,
        this.config.settings?.formats,
      );
      if (this.epochs.get(id) !== epoch) return prepared;
      this.active.add(id);
      this.downloads[id] = {
        ...this.downloads[id],
        lastReadAt: new Date().toISOString(),
        convertedKey: formats.keys.get(id),
      };
      await this.saveDownloads();
      // Only the book the user opened may be read to extract its cover.
      if (path.extname(file).toLowerCase() !== ".pdf")
        this.extractCover(id, prepared, item._revision, localDir).catch(
          () => {},
        );
      return prepared;
    } finally {
      this.opening.delete(id);
    }
  }
  async cover(id) {
    const item = this.items.get(id);
    if (!item) return null;
    if (item.cover_file) {
      const file = within(this.config.root, item.cover_file);
      const real = await fs.realpath(file),
        root = await fs.realpath(this.config.root);
      if (!real.startsWith(root + path.sep))
        throw Error("封面路径超出书库目录");
      const ext = path.extname(file).toLowerCase(),
        mime = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".webp": "image/webp",
        }[ext];
      if (mime && (await fs.stat(file)).size < 3 * 1024 * 1024)
        return `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
    }
    // Existing local thumbnails are safe; never open an EPUB while browsing.
    const cached = await json(
      path.join(
        this.localDir,
        "covers",
        crypto.createHash("sha256").update(id).digest("hex") + ".json",
      ),
      null,
    );
    if (cached && cached.revision === item._revision) return cached.url || null;
    try {
      const file = await this.bookPath(id),
        stat = await fs.stat(file);
      const key = crypto
        .createHash("sha256")
        .update(`${id}:${stat.size}:${stat.mtimeMs}`)
        .digest("hex");
      return (
        (await json(path.join(this.userDir, "covers", `${key}.json`), null))
          ?.url || null
      );
    } catch {
      return null;
    }
  }
  async extractCover(id, bytes, revision, localDir = this.localDir) {
    const key = crypto.createHash("sha256").update(id).digest("hex");
    const cache = path.join(localDir, "covers", `${key}.json`);
    const old = await json(cache, null);
    if (old && old.revision === revision) return old.url || null;
    const zip = await JSZip.loadAsync(bytes);
    const container = zip.file("META-INF/container.xml");
    if (!container) return null;
    const opfPath = xml.parse(await container.async("string")).container
      .rootfiles.rootfile;
    const opfName = array(opfPath)[0]["full-path"];
    const opfEntry = zip.file(opfName);
    if (!opfEntry) return null;
    const pkg = xml.parse(await opfEntry.async("string")).package;
    const items = array(pkg.manifest?.item);
    const meta = array(pkg.metadata?.meta).find((m) => m.name === "cover");
    const image =
      items.find((i) =>
        String(i.properties || "")
          .split(" ")
          .includes("cover-image"),
      ) ||
      items.find((i) => i.id === meta?.content) ||
      items.find(
        (i) => /cover/i.test(i.id) && i["media-type"]?.startsWith("image/"),
      );
    let url = null;
    if (image) {
      const name = path.posix.normalize(
        path.posix.join(
          path.posix.dirname(opfName),
          decodeURIComponent(image.href),
        ),
      );
      const entry = zip.file(name);
      if (
        entry &&
        ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
          image["media-type"],
        )
      ) {
        const bytes = await entry.async("nodebuffer");
        if (bytes.length < 15 * 1024 * 1024)
          url = `data:${image["media-type"]};base64,${bytes.toString("base64")}`;
      }
    }
    await atomicJson(cache, { url, revision });
    return url;
  }
  saveDownloads() {
    const file = path.join(this.localDir, "downloads.json"),
      value = JSON.parse(JSON.stringify(this.downloads));
    const result = (this.downloadQueue || Promise.resolve()).then(() =>
      atomicJson(file, value),
    );
    this.downloadQueue = result.catch(() => {});
    return result;
  }
  async release(id) {
    if (this.active.has(id) || this.opening.has(id))
      throw Error("请先关闭这本书，再释放本地空间");
    if (this.downloads[id]?.offline) throw Error("请先取消“保留离线”");
    const result = await this.cloud.release(await this.bookPath(id));
    if (result.state === "cloud")
      await this.formats.remove(this.downloads[id]?.convertedKey);
    this.storage.set(id, result);
    return result;
  }
  async offline(id, keep) {
    if (keep) {
      const wasActive = this.active.has(id);
      const data = await this.read(id); // User explicitly requested an offline download.
      if (!data.length) throw Error("书籍为空");
      if (!wasActive) this.active.delete(id);
      const status = (
        await this.cloud.inspect([{ id, path: await this.bookPath(id) }])
      )[0]?.status;
      const appPinned =
        this.downloads[id]?.appPinned ||
        !!(status?.supported && !status.pinned);
      if (status?.supported && !status.pinned)
        await this.cloud.pin(await this.bookPath(id), true);
      this.downloads[id] = { ...this.downloads[id], offline: true, appPinned };
    } else {
      if (this.downloads[id]?.appPinned)
        await this.cloud.pin(await this.bookPath(id), false);
      this.downloads[id] = {
        ...this.downloads[id],
        offline: false,
        appPinned: false,
      };
    }
    await this.saveDownloads();
  }
  async sweep(now = Date.now()) {
    if (this.sweeping || !this.downloads) return { released: 0, skipped: 0 };
    const days = this.config.settings?.storage?.retentionDays ?? 7;
    if (!days) return { released: 0, skipped: 0 };
    this.sweeping = true;
    let released = 0,
      skipped = 0;
    try {
      for (const [id, data] of Object.entries(this.downloads)) {
        if (
          !this.items.has(id) ||
          data.offline ||
          this.active.has(id) ||
          this.opening.has(id) ||
          !data.lastReadAt ||
          now - Date.parse(data.lastReadAt) < days * 86400000
        )
          continue;
        try {
          const previous = (
            await this.cloud.inspect([{ id, path: await this.bookPath(id) }])
          )[0]?.status;
          const result = await this.release(id);
          if (previous?.state !== "cloud" && result.state === "cloud")
            released++;
        } catch {
          skipped++;
        }
      }
      await this.formats.prune(days);
      return { released, skipped };
    } finally {
      this.sweeping = false;
    }
  }
  closed(id) {
    this.epochs.set(id, (this.epochs.get(id) || 0) + 1);
    this.active.delete(id);
  }
  close() {
    this.cloud.close?.();
  }
  import(files) {
    const root = this.config.root;
    const run = async () => {
      const imported = [],
        failed = [];
      for (const file of files) {
        try {
          const ext = path.extname(file).slice(1).toLowerCase();
          if (![...BUILTIN, ...CALIBRE].includes(ext))
            throw Error("不支持此格式：" + ext);
          const stat = await fs.stat(file);
          if (!stat.isFile() || stat.size > 512 * 1048576)
            throw Error("文件过大（上限 512 MB）或不是普通文件");
          const bytes = await fs.readFile(file),
            sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
          const id = crypto.randomUUID(),
            relative = `content/${id}/${sha256}.${ext}`;
          const dest = within(root, relative);
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.writeFile(dest, bytes, { flag: "wx" });
          await copyCompanions(file, dest, bytes, ext);
          const book = {
            id,
            title: path.basename(file, path.extname(file)),
            author: "未知作者",
            content: { path: relative, revision: sha256, sha256 },
            addedAt: new Date().toISOString(),
            collections: [],
          };
          await atomicJson(path.join(root, "catalog/extra", id + ".json"), {
            version: 2,
            book,
          });
          imported.push(id);
        } catch (e) {
          failed.push({ name: path.basename(file), error: e.message });
        }
      }
      return { data: await this.load(), imported, failed };
    };
    const result = this.importQueue.then(run);
    this.importQueue = result.catch(() => {});
    return result;
  }
  setDeleted(id, deleted) {
    if (typeof deleted !== "boolean")
      return Promise.reject(Error("无效的删除操作"));
    return this.save(id, { lifecycle: { deleted } });
  }
  save(id, patch) {
    const run = async () => {
      if (!this.items.has(id)) throw Error("未知图书");
      // Read arriving remote fields before combining a local partial edit.
      // A favorite toggle must not discard a remote finished/want flag.
      try {
        const { devices } = await readDevices(this.config.root);
        this.merged = mergeDevices([
          ...devices,
          { version: 1, books: this.merged },
          this.device,
        ]);
      } catch {
        /* Local edits stay available while the provider is offline. */
      }
      if (this.merged?.[id]?.lifecycle?.deleted && !patch.lifecycle)
        throw Error("这本书已在其他设备删除，请先恢复");
      if (
        patch.lifecycle?.deleted &&
        (this.active.has(id) || this.opening.has(id))
      )
        throw Error("请先关闭这本书，再删除");
      const current = (this.device.books[id] ||= { marks: {} });
      const now = new Date(
        Math.max(
          Date.now(),
          (Date.parse(this.device.updatedAt) || 0) + 1,
          ...Object.values(this.merged?.[id] || {}).map(
            (v) => Date.parse(v?.updatedAt) + 1 || 0,
          ),
        ),
      ).toISOString();
      for (const field of ["reading", "preferences", "status", "lifecycle"])
        if (patch[field])
          current[field] = {
            ...(this.merged?.[id]?.[field] || current[field] || {}),
            ...patch[field],
            ...(field === "reading"
              ? {
                  contentRevision: this.items.get(id)._revision,
                  originDeviceId: this.config.deviceId,
                }
              : {}),
            updatedAt: now,
          };
      if (patch.mark)
        current.marks[patch.mark.id] = { ...patch.mark, updatedAt: now };
      this.device.updatedAt = now;
      await atomicJson(this.stateFile, this.device);
      this.merged = mergeDevices([
        { version: 1, books: this.merged },
        this.device,
      ]);
      return this.flush();
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }
  async flush() {
    try {
      const file = path.join(
        this.config.root,
        "reader-state/v1/devices",
        `${this.config.deviceId}.json`,
      );
      const previous = await json(file, null);
      if (JSON.stringify(previous) !== JSON.stringify(this.device))
        await atomicJson(file, this.device);
      return { synced: true, at: this.device.updatedAt };
    } catch (e) {
      return {
        synced: false,
        error: `已保存在本机，等待写入云盘：${e.message}`,
      };
    }
  }
  settings(patch) {
    const run = async () => {
      this.config.settings = { ...this.config.settings, ...patch };
      await atomicJson(path.join(this.userDir, "config.json"), this.config);
      return this.config.settings;
    };
    const result = (this.settingsQueue || Promise.resolve()).then(run);
    this.settingsQueue = result.catch(() => {});
    return result;
  }
}
module.exports = {
  Library,
  within,
  mergeDevices,
  atomicJson,
  json,
  readDevices,
  newer,
};
