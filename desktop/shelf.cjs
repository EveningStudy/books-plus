const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { Library, atomicJson, json } = require("./library.cjs");
const { BUILTIN, CALIBRE } = require("./formats.cjs");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const normal = (root) =>
  process.platform === "win32"
    ? path.resolve(root).toLowerCase()
    : path.resolve(root);
const sourceId = (root) => hash(normal(root)).slice(0, 24);
const supported = new Set([...BUILTIN, ...CALIBRE]);
const reserved = new Set([
  "content",
  "catalog",
  "reader-state",
  "records",
  "covers",
  "notes",
  "unvalidated-books",
  "node_modules",
]);

// A plain folder keeps originals in place. Enumerating names and file attributes
// must never hydrate book bodies merely to display the shelf.
class SourceLibrary extends Library {
  async configure(root) {
    const descriptor = this.config.sources?.find(
      (s) => normal(s.root) === normal(root),
    );
    const marker = await fs
      .stat(path.join(root, ".booksplus-folder.json"))
      .then(
        () => true,
        (e) => {
          if (e.code === "ENOENT") return false;
          throw e;
        },
      );
    if ((descriptor?.kind || this.sourceKind) !== "folder" && !marker)
      return super.configure(root);
    if (this.active.size || this.opening.size || this.sweeping)
      throw Error("请先返回书库，等待下载或清理完成，再更改书库");
    await Promise.all([this.queue, this.importQueue, this.downloadQueue]);
    if (descriptor) descriptor.kind = "folder";
    this.sourceKind = "folder";
    await this.catalog(root);
    this.config.root = root;
    await atomicJson(path.join(this.userDir, "config.json"), this.config);
    return this.load();
  }
  async flush() {
    try {
      // A temporarily unavailable mount must never be recreated by a retry.
      if (!(await fs.stat(this.config.root)).isDirectory())
        throw Error("书库文件夹不可用");
      const descriptor = this.config.sources?.find(
        (s) => normal(s.root) === normal(this.config.root),
      );
      const name =
        (descriptor?.kind || this.sourceKind) === "folder"
          ? ".booksplus-folder.json"
          : this.libraryId
            ? "catalog.json"
            : "library.json";
      const identity = await json(path.join(this.config.root, name));
      if (this.libraryId && identity.libraryId !== this.libraryId)
        throw Error("书库标识已改变，请重新连接文件夹");
      return super.flush();
    } catch (e) {
      return {
        synced: false,
        error: `已保存在本机，等待写入云盘：${e.message}`,
      };
    }
  }
  async catalog(root) {
    const descriptor = this.config.sources?.find(
      (s) => normal(s.root) === normal(root),
    );
    if ((descriptor?.kind || this.sourceKind) !== "folder")
      return super.catalog(root);
    if (!(await fs.stat(root)).isDirectory()) throw Error("请选择文件夹");
    const marker = path.join(root, ".booksplus-folder.json");
    let identity = await json(marker, null);
    if (!identity) {
      const proposed = { version: 1, libraryId: crypto.randomUUID() };
      // Exclusive creation prevents two local processes from replacing identity.
      try {
        await fs.writeFile(marker, JSON.stringify(proposed), { flag: "wx" });
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
      }
      identity = await json(marker);
    }
    if (
      identity?.version !== 1 ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(identity.libraryId)
    )
      throw Error("文件夹书库标识损坏，请检查云盘同步");
    const entries = [];
    const walk = async (dir, depth = 0) => {
      if (depth > 40) throw Error("文件夹层级过深");
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (
          entry.name.startsWith(".") ||
          entry.name === "__MACOSX" ||
          entry.isSymbolicLink()
        )
          continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!reserved.has(entry.name) && !/\.epub$/i.test(entry.name))
            await walk(file, depth + 1);
        } else if (
          entry.isFile() &&
          supported.has(path.extname(entry.name).slice(1).toLowerCase())
        ) {
          const relative = path.relative(root, file).split(path.sep).join("/");
          const stat = await fs.stat(file);
          entries.push({
            asset_id: "folder-" + hash(relative.normalize("NFC")),
            file: relative,
            title: path.basename(entry.name, path.extname(entry.name)),
            author: "未知作者",
            collections:
              path.dirname(relative) === "." ? [] : [path.dirname(relative)],
            date_added: stat.mtime.toISOString(),
            export_status: "folder",
          });
        }
      }
    };
    await walk(root);
    // Explicit imports and Apple exports publish sidecars, alongside loose files.
    const extraDir = path.join(root, "catalog/extra");
    const names = await fs.readdir(extraDir).catch((e) => {
      if (e.code === "ENOENT") return [];
      throw e;
    });
    for (const name of names
      .filter((n) => /^[a-zA-Z0-9_-]+\.json$/.test(n))
      .sort()) {
      const record = await json(path.join(extraDir, name));
      if (record.version !== 2 || !record.book || record.book.deleted) continue;
      const b = record.book;
      entries.push({
        asset_id: b.id,
        title: b.title,
        author: b.author,
        file: b.content?.path,
        revision: b.content?.revision,
        sha256: b.content?.sha256,
        cover_file: b.cover?.path,
        collections: b.collections || [],
        date_added: b.addedAt,
        appleBooks: b.appleBooks,
      });
    }
    return { libraryId: identity.libraryId, raw: entries };
  }
}

// The original Library instance remains the Apple bridge. Other instances use the
// same device identity and cache layout but never participate in AppleBooksSync.
class Shelf {
  constructor(primary) {
    this.primary = primary;
    this.instances = new Map();
    this.cache = new Map();
    this.routes = new Map();
    this.queue = Promise.resolve();
  }
  async init() {
    const config = this.primary.config;
    if (!Array.isArray(config.sources) || !config.sources.length) {
      config.sources = [
        { id: sourceId(config.root), root: config.root, kind: "library" },
      ];
    }
    const current = config.sources.find(
      (s) => normal(s.root) === normal(config.root),
    );
    if (!current) throw Error("Apple Books 同步目录不在文件夹列表中");
    this.bridgeId = current.id;
    config.importSourceId ||= current.id;
    this.instances.set(current.id, this.primary);
    await this.persist();
    return this;
  }
  run(work) {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
  change(work) {
    return this.run(async () => {
      this.changing = true;
      try {
        return await work();
      } finally {
        this.changing = false;
      }
    });
  }
  persist() {
    // Share the config queue with language and ordinary settings writes.
    const p = this.primary;
    const result = (p.settingsQueue || Promise.resolve()).then(() =>
      atomicJson(path.join(p.userDir, "config.json"), p.config),
    );
    p.settingsQueue = result.catch(() => {});
    return result;
  }
  instance(source) {
    if (!this.instances.has(source.id)) {
      const p = this.primary,
        lib = new SourceLibrary(p.userDir, { cloud: p.cloud });
      lib.config = {
        root: source.root,
        deviceId: p.config.deviceId,
        settings: p.config.settings,
      };
      lib.sourceKind = source.kind;
      lib.legacyRoot = p.legacyRoot;
      lib.legacyDevice = p.legacyDevice;
      this.instances.set(source.id, lib);
    }
    const lib = this.instances.get(source.id);
    lib.config.settings = this.primary.config.settings;
    return lib;
  }
  list() {
    return this.primary.config.sources;
  }
  async ensureUnique(root, excluding) {
    const real = normal(await fs.realpath(root));
    for (const source of this.list()) {
      if (source.id === excluding) continue;
      const other = normal(
        await fs.realpath(source.root).catch(() => source.root),
      );
      if (
        real === other ||
        real.startsWith(other + path.sep) ||
        other.startsWith(real + path.sep)
      )
        throw Error("此文件夹已添加，或与现有文件夹重叠");
    }
  }
  async checkIdle() {
    for (const lib of this.instances.values()) {
      if (lib.active.size || lib.opening.size || lib.sweeping)
        throw Error("请先返回书库，等待下载或清理完成，再更改书库");
    }
    await this.idle();
  }
  async idle() {
    await Promise.all(
      [...this.instances.values()].flatMap((lib) => [
        lib.queue,
        lib.importQueue,
        lib.downloadQueue,
        lib.settingsQueue,
      ]),
    );
  }
  add(root) {
    return this.change(async () => {
      await this.checkIdle();
      root = await fs.realpath(root);
      if (!(await fs.stat(root)).isDirectory()) throw Error("请选择文件夹");
      await this.ensureUnique(root);
      const structured = (
        await Promise.all(
          ["catalog.json", "library.json"].map((n) =>
            fs.stat(path.join(root, n)).then(
              () => true,
              (e) => {
                if (e.code === "ENOENT") return false;
                throw e;
              },
            ),
          ),
        )
      ).some(Boolean);
      const marker = await fs
        .stat(path.join(root, ".booksplus-folder.json"))
        .then(
          () => true,
          (e) => {
            if (e.code === "ENOENT") return false;
            throw e;
          },
        );
      const source = {
        id: sourceId(root),
        root,
        kind: structured && !marker ? "library" : "folder",
      };
      const lib = this.instance(source);
      let data;
      try {
        data = await lib.load();
      } catch (e) {
        this.instances.delete(source.id);
        throw e;
      }
      for (const other of this.list()) {
        const known = this.instances.get(other.id)?.libraryId;
        if (known && known === data.libraryId) {
          this.instances.delete(source.id);
          throw Error("同一书库已从另一个路径添加");
        }
      }
      this.list().push(source);
      try {
        await this.persist();
      } catch (e) {
        this.primary.config.sources = this.list().filter(
          (s) => s.id !== source.id,
        );
        this.instances.delete(source.id);
        throw e;
      }
      return this.loadNow();
    });
  }
  remove(id) {
    return this.change(async () => {
      await this.checkIdle();
      if (id === this.bridgeId)
        throw Error("请先为 Apple Books 选择另一个同步文件夹");
      if (!this.list().some((s) => s.id === id)) throw Error("未知文件夹");
      const previous = this.list(),
        importSourceId = this.primary.config.importSourceId;
      this.primary.config.sources = this.list().filter((s) => s.id !== id);
      if (this.primary.config.importSourceId === id)
        this.primary.config.importSourceId = this.bridgeId;
      try {
        await this.persist();
      } catch (e) {
        this.primary.config.sources = previous;
        this.primary.config.importSourceId = importSourceId;
        throw e;
      }
      this.instances.delete(id);
      this.cache.delete(id);
      return this.loadNow();
    });
  }
  prepare(id) {
    return this.change(async () => {
      await this.checkIdle();
      const source = this.list().find((s) => s.id === id);
      if (!source) throw Error("未知文件夹");
      const structured = (
        await Promise.all(
          ["catalog.json", "library.json"].map((n) =>
            fs.stat(path.join(source.root, n)).then(
              () => true,
              (e) => {
                if (e.code === "ENOENT") return false;
                throw e;
              },
            ),
          ),
        )
      ).some(Boolean);
      const previous = source.kind;
      if (!structured) source.kind = "folder";
      const lib = this.instance(source);
      lib.sourceKind = source.kind;
      try {
        await lib.load();
        await this.persist();
      } catch (e) {
        source.kind = previous;
        lib.sourceKind = previous;
        throw e;
      }
      return this.loadNow();
    });
  }
  setBridge(id) {
    return this.change(async () => {
      await this.checkIdle();
      if (id === this.bridgeId) return this.loadNow();
      const source = this.list().find((s) => s.id === id);
      if (!source) throw Error("未知文件夹");
      const next = this.instance(source);
      await next.load(); // Validate before changing the persisted bridge.
      await this.flush();
      const p = this.primary,
        oldSource = this.list().find((s) => s.id === this.bridgeId);
      this.instances.delete(oldSource.id);
      p.config.root = source.root;
      // Force a bind even if a provider reports a recycled library identifier.
      p.libraryKey = undefined;
      this.instances.set(id, p);
      this.bridgeId = id;
      try {
        await p.load();
        await this.persist();
      } catch (e) {
        p.config.root = oldSource.root;
        this.bridgeId = oldSource.id;
        p.libraryKey = undefined;
        this.instances.set(oldSource.id, p);
        this.instances.set(id, next);
        await p.load().catch(() => {});
        throw e;
      }
      return this.loadNow();
    });
  }
  setImportSource(id) {
    return this.run(async () => {
      if (!this.list().some((s) => s.id === id)) throw Error("未知文件夹");
      const previous = this.primary.config.importSourceId;
      this.primary.config.importSourceId = id;
      try {
        await this.persist();
      } catch (e) {
        this.primary.config.importSourceId = previous;
        throw e;
      }
      return this.loadNow();
    });
  }
  load() {
    return this.run(() => this.loadNow());
  }
  async loadNow() {
    const data = [],
      sources = [],
      routes = new Map();
    for (const source of this.list()) {
      const lib = this.instance(source);
      let value, error;
      try {
        value = await lib.load();
        this.cache.set(source.id, value);
      } catch (e) {
        error = e.message;
        value = this.cache.get(source.id);
      }
      sources.push({
        ...source,
        name: path.basename(source.root) || source.root,
        appleBooks: source.id === this.bridgeId,
        error,
        count: value?.books.length || 0,
      });
      if (!value) continue;
      const map = (book) => {
        // Preserve legacy primary IDs. Qualify others to prevent cross-folder edits.
        const id =
          source.id === this.bridgeId
            ? book.id
            : `source:${source.id}:${book.id}`;
        routes.set(id, { lib, id: book.id, sourceId: source.id });
        return {
          ...book,
          id,
          sourceId: source.id,
          sourceName: path.basename(source.root) || source.root,
          ...(error
            ? {
                storage: {
                  ...book.storage,
                  state: "unknown",
                  supported: false,
                },
              }
            : {}),
        };
      };
      data.push({
        ...value,
        books: value.books.map(map),
        trash: (value.trash || []).map(map),
      });
    }
    if (!data.length && sources.length === 1)
      throw Error(sources[0].error || "尚未连接书库");
    for (const [id, target] of this.routes) {
      if (
        !routes.has(id) &&
        (target.lib.active.has(target.id) || target.lib.opening.has(target.id))
      )
        routes.set(id, target);
    }
    this.routes = routes;
    return {
      root: this.primary.config.root,
      books: data.flatMap((d) => d.books),
      trash: data.flatMap((d) => d.trash),
      sources,
      importSourceId: this.primary.config.importSourceId,
      deviceId: this.primary.config.deviceId,
      settings: this.primary.config.settings || {},
      history:
        data.find((d) => d.root === this.primary.config.root)?.history || null,
      syncError:
        sources
          .filter((s) => s.error)
          .map((s) => `${s.name}: ${s.error}`)
          .concat(data.map((d) => d.syncError).filter(Boolean))
          .join("；") || undefined,
      lastLoadedAt: new Date().toISOString(),
    };
  }
  route(id) {
    const target = this.routes.get(id);
    if (!target || !this.list().some((s) => s.id === target.sourceId))
      throw Error("未知图书");
    target.lib.config.settings = this.primary.config.settings;
    return target;
  }
  read(id) {
    if (this.changing) throw Error("正在更新文件夹，请稍后再打开图书");
    const r = this.route(id);
    return r.lib.read(r.id);
  }
  cover(id) {
    const r = this.route(id);
    return r.lib.cover(r.id);
  }
  closed(id) {
    const r = this.route(id);
    return r.lib.closed(r.id);
  }
  save(id, patch) {
    const r = this.route(id);
    return r.lib.save(r.id, patch);
  }
  setDeleted(id, deleted) {
    const r = this.route(id);
    return r.lib.setDeleted(r.id, deleted);
  }
  offline(id, keep) {
    if (this.changing) throw Error("正在更新文件夹，请稍后再打开图书");
    const r = this.route(id);
    return r.lib.offline(r.id, keep);
  }
  release(id) {
    const r = this.route(id);
    return r.lib.release(r.id);
  }
  import(files, id = this.primary.config.importSourceId) {
    return this.run(async () => {
      const source = this.list().find((s) => s.id === id);
      if (!source) throw Error("未知文件夹");
      const lib = this.instance(source);
      await lib.load();
      const result = await lib.import(files);
      return { ...result, data: await this.loadNow() };
    });
  }
  async flush() {
    const results = [];
    for (const lib of this.instances.values())
      if (lib.stateFile && lib.device?.updatedAt) {
        const result = lib.queue.then(() => lib.flush());
        lib.queue = result.catch(() => {});
        results.push(await result);
      }
    return {
      synced: results.every((r) => r.synced),
      error:
        results
          .filter((r) => !r.synced)
          .map((r) => r.error)
          .join("；") || undefined,
    };
  }
  async sweep() {
    const results = await Promise.all(
      [...this.instances.values()].map((lib) => lib.sweep()),
    );
    return results.reduce(
      (sum, r) => ({
        released: sum.released + r.released,
        skipped: sum.skipped + r.skipped,
      }),
      { released: 0, skipped: 0 },
    );
  }
}
module.exports = { SourceLibrary, Shelf };
