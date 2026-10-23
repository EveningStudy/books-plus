const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const JSZip = require("jszip");
const { Library, atomicJson, json } = require("./helpers.cjs");
const {
  AppleBooksSync,
  pointCFI,
  cfiKey,
  deepLink,
  epubInfo,
  readingFor,
} = require("../desktop/apple-books.cjs");
async function epub(text = "original", date = new Date("2020-01-01")) {
  const zip = new JSZip(),
    opts = { date };
  zip.file("mimetype", "application/epub+zip", opts);
  zip.file(
    "META-INF/container.xml",
    '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    opts,
  );
  zip.file(
    "OPS/book.opf",
    '<package unique-identifier="uid"><metadata><identifier id="uid">urn:uuid:fixture</identifier><title>Fixture</title></metadata><manifest><item id="c1" href="c1.xhtml"/></manifest><spine><itemref idref="c1"/></spine></package>',
    opts,
  );
  zip.file("OPS/c1.xhtml", `<html><body><p>${text}</p></body></html>`, opts);
  return zip.generateAsync({ type: "nodebuffer" });
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
async function setup(t, apple = true) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "booksplus-apple-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "cloud"),
    library = await new Library(path.join(dir, "user")).init();
  await library.configure(root);
  await library.settings({
    mac: { mode: "both", login: false, writeback: true },
  });
  const file = path.join(dir, "apple.epub");
  await fs.writeFile(file, await epub());
  const asset = {
    ZASSETID: "APPLE1",
    ZTITLE: "Fixture",
    ZEPUBID: "urn:uuid:fixture",
    ZPATH: file,
    ZREADINGPROGRESS: 0.2,
    ZLASTOPENDATE: 800000000,
    ZCREATIONDATE: 790000000,
    ZISFINISHED: 0,
  };
  const tables = {
    ZBKLIBRARYASSET: apple ? [asset] : [],
    ZAEANNOTATION: [
      {
        ZANNOTATIONASSETID: "APPLE1",
        ZANNOTATIONUUID: "position",
        ZANNOTATIONTYPE: 3,
        ZANNOTATIONLOCATION: "epubcfi(/6/2!/4/2/1:0)",
        ZANNOTATIONMODIFICATIONDATE: 800000000,
      },
    ],
  };
  const opens = [],
    jumps = [];
  const native = {
    snapshot: async () => ({ libraryAvailable: true, tables, errors: [] }),
    source: async (file) => {
      const stat = await fs.stat(file);
      return {
        directory: false,
        entries: [
          {
            name: path.basename(file),
            path: file,
            size: stat.size,
            mtime: stat.mtimeMs,
          },
        ],
      };
    },
    open: async (file) => {
      opens.push(file);
    },
    jump: async (id, cfi) => {
      jumps.push({ id, cfi });
    },
    watch: () => () => {},
  };
  const sync = new AppleBooksSync(library, native);
  t.after(() => sync.stop());
  return {
    dir,
    root,
    library,
    sync,
    native,
    tables,
    asset,
    file,
    opens,
    jumps,
  };
}
async function cloudBook(f, id = "CLOUD1", bytes) {
  bytes ||= await epub();
  const digest = sha(bytes),
    relative = `content/${id}/${digest}.epub`;
  await fs.mkdir(path.dirname(path.join(f.root, relative)), {
    recursive: true,
  });
  await fs.writeFile(path.join(f.root, relative), bytes);
  await atomicJson(path.join(f.root, "catalog/extra", id + ".json"), {
    version: 2,
    book: {
      id,
      title: "Fixture",
      content: { path: relative, revision: digest, sha256: digest },
    },
  });
  return digest;
}
async function remote(
  f,
  id,
  revision,
  cfi,
  updatedAt = "2030-01-01T00:00:00.000Z",
) {
  const reading = { contentRevision: revision, cfi, progress: 0.8, updatedAt };
  await atomicJson(path.join(f.root, "reader-state/v1/devices/windows.json"), {
    version: 1,
    deviceId: "windows",
    books: { [id]: { reading } },
  });
  return reading;
}
test("point CFI conversion handles ranges, escaped assertions and rejects unsafe URLs", () => {
  assert.equal(
    pointCFI("epubcfi(/6/4[c2]!/4/14/1,:0,:1)"),
    "epubcfi(/6/4[c2]!/4/14/1:0)",
  );
  assert.equal(
    cfiKey("epubcfi(/6/4[chapter^,two]!/4/14/1,:0,:1)"),
    "epubcfi(/6/4!/4/14/1:0)",
  );
  assert.equal(pointCFI("https://evil"), null);
  assert.equal(pointCFI("epubcfi(/6/2#oops)"), null);
  assert.throws(() => deepLink("../evil", "epubcfi(/6/2!/4/2/1:0)"));
  assert.equal(
    deepLink("APPLE1", "epubcfi(/6/2!/4/2/1:0)"),
    "ibooks://assetid/APPLE1#epubcfi(/6/2!/4/2/1:0)",
  );
});
test("EPUB identity ignores ZIP timestamps but detects body revisions", async () => {
  const first = await epubInfo(await epub());
  assert.equal(first.identifier, "urn:uuid:fixture");
  assert.equal(
    first.fingerprint,
    (await epubInfo(await epub("original", new Date("2026-01-01"))))
      .fingerprint,
  );
  assert.notEqual(
    first.fingerprint,
    (await epubInfo(await epub("changed"))).fingerprint,
  );
});
test("Apple export publishes immutable content and an independent virtual device, retaining annotation tombstones", async (t) => {
  const f = await setup(t);
  f.tables.ZAEANNOTATION.push({
    ZANNOTATIONASSETID: "APPLE1",
    ZANNOTATIONUUID: "deleted-mark",
    ZANNOTATIONTYPE: 2,
    ZANNOTATIONDELETED: 1,
    ZANNOTATIONMODIFICATIONDATE: 800000000,
  });
  await f.sync.cycle();
  const sidecar = await json(path.join(f.root, "catalog/extra/APPLE1.json"));
  assert.equal(
    sha(await fs.readFile(path.join(f.root, sidecar.book.content.path))),
    sidecar.book.content.sha256,
  );
  const state = f.sync.state;
  assert.notEqual(state.deviceId, f.library.config.deviceId);
  assert.equal(
    state.device.books.APPLE1.marks["apple-deleted-mark"].deleted,
    true,
  );
  const reader = await f.library.load();
  assert.equal(reader.books[0].state.reading.progress, 0.2);
  await f.sync.cycle();
  assert.equal(f.opens.length, 0);
  assert.equal(f.jumps.length, 0);
});
test("cloud imports wait for exact content mapping and do not reimport after restart", async (t) => {
  const f = await setup(t, false),
    revision = await cloudBook(f);
  await f.sync.cycle();
  assert.equal(f.opens.length, 1);
  assert.equal(f.sync.state.mappings.CLOUD1, undefined);
  const restarted = new AppleBooksSync(f.library, f.native);
  await restarted.cycle();
  assert.equal(f.opens.length, 1);
  f.tables.ZBKLIBRARYASSET.push(f.asset);
  await restarted.cycle();
  assert.equal(restarted.state.mappings.CLOUD1.assetId, "APPLE1");
  assert.equal(restarted.state.mappings.CLOUD1.revision, revision);
  assert.equal(
    (await fs.readdir(path.join(f.root, "catalog/extra"))).length,
    1,
  );
});
test("newer cloud CFI journals before jump, waits for persisted confirmation and suppresses echo across restart", async (t) => {
  const f = await setup(t),
    revision = await cloudBook(f);
  await f.sync.cycle();
  const target = "epubcfi(/6/4!/4/64/1:0)",
    incoming = await remote(f, "CLOUD1", revision, target);
  await f.sync.cycle();
  assert.equal(f.jumps.length, 1);
  assert.ok(f.sync.state.mappings.CLOUD1.pending);
  assert.notEqual(
    f.sync.state.device.books.CLOUD1.reading.updatedAt,
    incoming.updatedAt,
  );
  const restarted = new AppleBooksSync(f.library, f.native);
  await restarted.cycle();
  assert.equal(f.jumps.length, 1);
  f.tables.ZAEANNOTATION[0].ZANNOTATIONLOCATION = target;
  f.tables.ZAEANNOTATION[0].ZANNOTATIONMODIFICATIONDATE = 1000000000;
  f.asset.ZREADINGPROGRESS = 0.79;
  await restarted.cycle();
  assert.equal(restarted.state.mappings.CLOUD1.pending, undefined);
  assert.equal(
    restarted.state.device.books.CLOUD1.reading.updatedAt,
    incoming.updatedAt,
  );
  await restarted.cycle();
  assert.equal(f.jumps.length, 1);
  f.tables.ZAEANNOTATION[0].ZANNOTATIONLOCATION = "epubcfi(/6/4!/4/68/1:0)";
  f.tables.ZAEANNOTATION[0].ZANNOTATIONMODIFICATIONDATE = 1000000010;
  await restarted.cycle();
  assert.equal(
    restarted.state.device.books.CLOUD1.reading.source,
    "apple-books",
  );
  assert.equal(f.jumps.length, 1);
});
test("unconfirmed jump never becomes success; retry and cancel are explicit", async (t) => {
  const f = await setup(t),
    revision = await cloudBook(f);
  await f.sync.cycle();
  await remote(f, "CLOUD1", revision, "epubcfi(/6/4!/4/64/1:0)");
  await f.sync.cycle();
  const state = await json(f.sync.stateFile);
  state.mappings.CLOUD1.pending.at = Date.now() - 200000;
  await atomicJson(f.sync.stateFile, state);
  await f.sync.cycle();
  assert.ok(f.sync.status.issues.some((i) => /尚未确认/.test(i.error)));
  f.sync.enabled = () => false;
  await f.sync.action("retry", "CLOUD1");
  assert.equal(f.jumps.length, 2);
  await f.sync.action("cancel", "CLOUD1");
  assert.equal(f.sync.state.mappings.CLOUD1.pending, undefined);
});
test("content revision mismatch and hash corruption never jump or import", async (t) => {
  const f = await setup(t),
    revision = await cloudBook(f);
  await f.sync.cycle();
  await remote(f, "CLOUD1", "wrong-revision", "epubcfi(/6/4!/4/64/1:0)");
  await f.sync.cycle();
  assert.equal(f.jumps.length, 0);
  assert.ok(f.sync.status.issues.some((i) => /修订不一致/.test(i.error)));
  const digest = await cloudBook(f, "CORRUPT");
  await fs.writeFile(
    path.join(f.root, `content/CORRUPT/${digest}.epub`),
    "bad",
  );
  await f.sync.cycle();
  assert.equal(f.opens.length, 0);
  assert.ok(f.sync.status.issues.some((i) => /SHA-256/.test(i.error)));
});
test("ambiguous Apple duplicates are held for manual mapping without publishing duplicates", async (t) => {
  const f = await setup(t);
  await cloudBook(f);
  f.tables.ZBKLIBRARYASSET.push({ ...f.asset, ZASSETID: "APPLE2" });
  await f.sync.cycle();
  assert.equal(f.opens.length, 0);
  assert.equal(Object.keys(f.sync.state.mappings).length, 0);
  assert.ok(f.sync.status.issues.some((i) => /多个 Apple/.test(i.error)));
  assert.deepEqual(await fs.readdir(path.join(f.root, "catalog/extra")), [
    "CLOUD1.json",
  ]);
  f.sync.enabled = () => false;
  await f.sync.action("map", "CLOUD1", "APPLE2");
  assert.equal(f.sync.state.mappings.CLOUD1.assetId, "APPLE2");
});
test("owned Apple revision publishes a new body and retains old immutable content", async (t) => {
  const f = await setup(t);
  await f.sync.cycle();
  const old = (await json(path.join(f.root, "catalog/extra/APPLE1.json"))).book
    .content;
  await fs.writeFile(f.file, await epub("a changed source"));
  await f.sync.cycle();
  const next = (await json(path.join(f.root, "catalog/extra/APPLE1.json"))).book
    .content;
  assert.notEqual(old.revision, next.revision);
  assert.equal(sha(await fs.readFile(path.join(f.root, old.path))), old.sha256);
});
test("a cloud write failure keeps the local virtual-device journal for retry", async (t) => {
  const f = await setup(t);
  await f.sync.cycle();
  f.tables.ZAEANNOTATION[0].ZANNOTATIONLOCATION = "epubcfi(/6/4!/4/64/1:0)";
  f.tables.ZAEANNOTATION[0].ZANNOTATIONMODIFICATIONDATE = 1000000000;
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (to.includes(path.join("reader-state", "v1", "devices")))
      throw Object.assign(Error("cloud offline"), { code: "EIO" });
    return rename(from, to);
  };
  try {
    await assert.rejects(f.sync.cycle(), /cloud offline/);
  } finally {
    fs.rename = rename;
  }
  assert.equal(
    (await json(f.sync.stateFile)).device.books.APPLE1.reading.cfi,
    "epubcfi(/6/4!/4/64/1:0)",
  );
  await f.sync.cycle();
  assert.equal(
    (
      await json(
        path.join(
          f.root,
          "reader-state/v1/devices",
          f.sync.state.deviceId + ".json",
        ),
      )
    ).books.APPLE1.reading.cfi,
    "epubcfi(/6/4!/4/64/1:0)",
  );
});
test("library changes isolate mappings and virtual device journals", async (t) => {
  const f = await setup(t);
  await f.sync.cycle();
  const oldFile = f.sync.stateFile,
    oldId = f.sync.state.deviceId;
  await f.library.configure(path.join(f.dir, "other-cloud"));
  await f.sync.cycle();
  assert.notEqual(f.sync.stateFile, oldFile);
  assert.equal(f.sync.state.deviceId, oldId);
  assert.ok((await json(oldFile)).mappings.APPLE1);
});
test("Apple timestamps use the 2001 epoch and latest position wins", () => {
  const reading = readingFor(
    { ZASSETID: "A", ZLASTOPENDATE: 100, ZREADINGPROGRESS: 1.2 },
    {
      ZBCASSETDETAIL: [
        {
          ZASSETID: "A",
          ZREADINGPOSITIONCFISTRING: "epubcfi(/6/2!/4/2/1:0)",
          ZREADINGPOSITIONLOCATIONUPDATEDATE: 200,
        },
      ],
    },
    "r",
  );
  assert.equal(reading.updatedAt, "2001-01-01T00:03:20.000Z");
  assert.equal(reading.progress, 1);
});
test("unchanged Apple state does not rewrite cloud snapshots or restart a watcher feedback loop", async (t) => {
  const f = await setup(t);
  await f.sync.cycle();
  const file = path.join(
    f.root,
    "reader-state/v1/devices",
    f.sync.state.deviceId + ".json",
  );
  const before = await fs.stat(file),
    bytes = await fs.readFile(file, "utf8");
  await f.sync.cycle();
  assert.equal((await fs.stat(file)).mtimeMs, before.mtimeMs);
  assert.equal(await fs.readFile(file, "utf8"), bytes);
});
test("page-aligned persisted CFI remains pending until explicitly verified", async (t) => {
  const f = await setup(t),
    revision = await cloudBook(f);
  await f.sync.cycle();
  const incoming = await remote(
    f,
    "CLOUD1",
    revision,
    "epubcfi(/6/4!/4/64/1:0)",
  );
  await f.sync.cycle();
  f.tables.ZAEANNOTATION[0].ZANNOTATIONLOCATION = "epubcfi(/6/4!/4/58/1,:0,:1)";
  f.tables.ZAEANNOTATION[0].ZANNOTATIONMODIFICATIONDATE = 1000000000;
  await f.sync.cycle();
  assert.ok(f.sync.state.mappings.CLOUD1.pending);
  f.sync.enabled = () => false;
  await f.sync.action("accept", "CLOUD1");
  assert.equal(f.sync.state.mappings.CLOUD1.pending, undefined);
  assert.equal(
    f.sync.state.device.books.CLOUD1.reading.updatedAt,
    incoming.updatedAt,
  );
});
test("cloud output rejects directory symlinks", async (t) => {
  const f = await setup(t);
  const outside = path.join(f.dir, "outside");
  await fs.mkdir(outside);
  await fs.mkdir(path.join(f.root, "reader-state"));
  await fs.symlink(
    outside,
    path.join(f.root, "reader-state/v1"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(f.sync.cycle(), /链接/);
  assert.deepEqual(await fs.readdir(outside), []);
});
test("Apple metadata updates only its own published sidecar", async (t) => {
  const f = await setup(t);
  await f.sync.cycle();
  f.asset.ZTITLE = "Updated title";
  await f.sync.cycle();
  const file = path.join(f.root, "catalog/extra/APPLE1.json");
  assert.equal((await json(file)).book.title, "Updated title");
  const record = await json(file);
  record.book.appleBooks.publisherDeviceId = "another-device";
  await atomicJson(file, record);
  f.asset.ZTITLE = "Should not overwrite";
  await f.sync.cycle();
  assert.equal((await json(file)).book.title, "Updated title");
  assert.ok(f.sync.status.issues.some((i) => /发布者/.test(i.error)));
});
test("retry of a pending jump rechecks the current Apple revision", async (t) => {
  const f = await setup(t),
    revision = await cloudBook(f);
  await f.sync.cycle();
  await remote(f, "CLOUD1", revision, "epubcfi(/6/4!/4/64/1:0)");
  await f.sync.cycle();
  await fs.writeFile(f.file, await epub("different revision"));
  await assert.rejects(f.sync.action("retry", "CLOUD1"), /正文已改变/);
  assert.equal(f.jumps.length, 1);
});
test("Apple status preserves cloud flags and pending reading does not block independent marks", async (t) => {
  const f = await setup(t),
    revision = await cloudBook(f);
  await atomicJson(path.join(f.root, "reader-state/v1/devices/status.json"), {
    version: 1,
    books: {
      CLOUD1: {
        status: {
          favorite: true,
          want: true,
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    },
  });
  await f.sync.cycle();
  assert.equal(f.sync.state.device.books.CLOUD1.status.favorite, true);
  await remote(f, "CLOUD1", revision, "epubcfi(/6/4!/4/64/1:0)");
  await f.sync.cycle();
  f.tables.ZAEANNOTATION.push({
    ZANNOTATIONASSETID: "APPLE1",
    ZANNOTATIONUUID: "new-highlight",
    ZANNOTATIONTYPE: 2,
    ZANNOTATIONSELECTEDTEXT: "New independent mark",
    ZANNOTATIONMODIFICATIONDATE: 1000000000,
  });
  await f.sync.cycle();
  assert.ok(f.sync.state.mappings.CLOUD1.pending);
  assert.equal(
    f.sync.state.device.books.CLOUD1.marks["apple-new-highlight"].text,
    "New independent mark",
  );
});

test("a newer remote session supersedes an unconfirmed jump exactly once", async (t) => {
  const f = await setup(t),
    revision = await cloudBook(f);
  await f.sync.cycle();
  await remote(f, "CLOUD1", revision, "epubcfi(/6/4!/4/64/1:0)");
  await f.sync.cycle();
  const latest = await remote(
    f,
    "CLOUD1",
    revision,
    "epubcfi(/6/4!/4/88/1:0)",
    "2030-01-01T00:01:00.000Z",
  );
  await f.sync.cycle();
  assert.equal(f.jumps.length, 2);
  assert.equal(f.sync.state.mappings.CLOUD1.pending.reading.cfi, latest.cfi);
  await f.sync.cycle();
  assert.equal(f.jumps.length, 2);
});
test("Books foreground reading defers background navigation but explicit Continue remains available", async (t) => {
  const f = await setup(t),
    revision = await cloudBook(f);
  f.native.snapshot = async () => ({
    libraryAvailable: true,
    tables: f.tables,
    errors: [],
    booksFrontmost: true,
  });
  await f.sync.cycle();
  await remote(f, "CLOUD1", revision, "epubcfi(/6/4!/4/64/1:0)");
  await f.sync.cycle();
  assert.equal(f.jumps.length, 0);
  assert.ok(f.sync.status.issues.some((i) => /前台阅读/.test(i.error)));
  await f.sync.performAction("continue", "CLOUD1");
  assert.equal(f.jumps.length, 1);
});
test("a page-aligned echo is suppressed, then a subsequent saved Apple reading session resumes export", async (t) => {
  const f = await setup(t),
    revision = await cloudBook(f);
  await f.sync.cycle();
  const incoming = await remote(
    f,
    "CLOUD1",
    revision,
    "epubcfi(/6/4!/4/64/1:0)",
    new Date().toISOString(),
  );
  await f.sync.cycle();
  const position = f.tables.ZAEANNOTATION[0];
  position.ZANNOTATIONLOCATION = "epubcfi(/6/4!/4/58/1,:0,:1)";
  position.ZANNOTATIONMODIFICATIONDATE = Date.now() / 1000 - 978307200 + 1;
  await f.sync.cycle();
  assert.ok(f.sync.state.mappings.CLOUD1.pending.baseline);
  assert.notEqual(
    f.sync.state.device.books.CLOUD1.reading.cfi,
    position.ZANNOTATIONLOCATION,
  );
  position.ZANNOTATIONLOCATION = "epubcfi(/6/4!/4/76/1,:0,:1)";
  position.ZANNOTATIONMODIFICATIONDATE += 30;
  await f.sync.cycle();
  assert.equal(f.sync.state.mappings.CLOUD1.pending, undefined);
  assert.equal(
    f.sync.state.device.books.CLOUD1.reading.cfi,
    "epubcfi(/6/4!/4/76/1:0)",
  );
  assert.ok(
    f.sync.state.device.books.CLOUD1.reading.updatedAt > incoming.updatedAt,
  );
  assert.equal(f.jumps.length, 1);
});
test("opening Books alone cannot turn an old CFI into a newer reading position or overwrite cloud status", async (t) => {
  const f = await setup(t),
    revision = await cloudBook(f);
  await f.sync.cycle();
  const before = f.sync.state.device.books.CLOUD1.reading.updatedAt;
  await atomicJson(path.join(f.root, "reader-state/v1/devices/flags.json"), {
    version: 1,
    books: {
      CLOUD1: {
        status: {
          finished: true,
          favorite: true,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  });
  f.asset.ZLASTOPENDATE = 1000000000;
  await f.sync.cycle();
  assert.equal(f.sync.state.device.books.CLOUD1.reading.updatedAt, before);
  const reader = await f.library.load();
  assert.equal(reader.books[0].finished, true);
});
test("three independent cloud replicas converge across Mac reading, Windows reading and Apple writeback/restart", async (t) => {
  const f = await setup(t);
  await f.sync.cycle(); // Apple publishes a book and a virtual device on Mac.
  const windowsRoot = path.join(f.dir, "OneDrive Windows 本地副本");
  const thirdRoot = path.join(f.dir, "Dropbox Mac 本地副本");
  const replicate = async (from, to) => {
    await fs.mkdir(to, { recursive: true });
    await fs.cp(from, to, { recursive: true, force: true });
  };
  await replicate(f.root, windowsRoot);
  await replicate(f.root, thirdRoot);
  const windows = await new Library(path.join(f.dir, "windows-user")).init();
  const macReader = await new Library(
    path.join(f.dir, "mac-reader-user"),
  ).init();
  await windows.configure(windowsRoot);
  await macReader.configure(thirdRoot);
  assert.equal(windows.libraryKey, macReader.libraryKey);
  assert.equal(
    (await windows.load()).books[0].state.reading.cfi,
    "epubcfi(/6/2!/4/2/1:0)",
  );
  await windows.save("APPLE1", {
    reading: { cfi: "epubcfi(/6/2!/4/22/1:0)", progress: 0.4 },
    mark: { id: "bookmark", text: "Windows bookmark", type: "bookmark" },
  });
  // Transfer only device snapshots, as an asynchronously replicating provider would.
  const device = (root, id) =>
    path.join(root, "reader-state/v1/devices", id + ".json");
  await fs.copyFile(
    device(windowsRoot, windows.config.deviceId),
    device(thirdRoot, windows.config.deviceId),
  );
  assert.equal((await macReader.load()).books[0].state.reading.progress, 0.4);
  await macReader.save("APPLE1", {
    reading: { cfi: "epubcfi(/6/2!/4/44/1:0)", progress: 0.6 },
  });
  await fs.copyFile(
    device(thirdRoot, macReader.config.deviceId),
    device(f.root, macReader.config.deviceId),
  );
  await f.sync.cycle();
  assert.equal(f.jumps.length, 1);
  assert.equal(f.jumps[0].cfi, "epubcfi(/6/2!/4/44/1:0)");
  // Earlier Windows delivery arrives after the newer Mac session.
  await fs.copyFile(
    device(windowsRoot, windows.config.deviceId),
    device(f.root, windows.config.deviceId),
  );
  const restarted = new AppleBooksSync(f.library, f.native);
  await restarted.cycle();
  assert.equal(f.jumps.length, 1);
  f.tables.ZAEANNOTATION[0].ZANNOTATIONLOCATION = f.jumps[0].cfi;
  f.tables.ZAEANNOTATION[0].ZANNOTATIONMODIFICATIONDATE =
    Date.now() / 1000 - 978307200 + 1;
  await restarted.cycle();
  const acknowledged = restarted.state.device.books.APPLE1.reading;
  assert.equal(
    acknowledged.updatedAt,
    macReader.device.books.APPLE1.reading.updatedAt,
  );
  // Genuine later Apple reading, then returning to Windows.
  f.tables.ZAEANNOTATION[0].ZANNOTATIONLOCATION = "epubcfi(/6/2!/4/66/1:0)";
  f.tables.ZAEANNOTATION[0].ZANNOTATIONMODIFICATIONDATE += 30;
  await restarted.cycle();
  await fs.copyFile(
    device(f.root, restarted.state.deviceId),
    device(windowsRoot, restarted.state.deviceId),
  );
  const restored = await windows.load();
  assert.equal(restored.books[0].state.reading.cfi, "epubcfi(/6/2!/4/66/1:0)");
  assert.equal(restored.books[0].state.marks.bookmark.text, "Windows bookmark");
  assert.equal(f.jumps.length, 1);
  assert.equal(
    (await fs.readdir(path.join(f.root, "catalog/extra"))).length,
    1,
  );
});

test("continuous filesystem events have a bounded debounce delay", async (t) => {
  const f = await setup(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let cycles = 0;
  f.sync.sync = () => {
    cycles++;
  };
  f.sync.schedule();
  t.mock.timers.tick(1000);
  f.sync.schedule();
  t.mock.timers.tick(500);
  assert.equal(
    cycles,
    1,
    "continuous provider events must not postpone sync forever",
  );
});
test("an event arriving during a cycle requests another cycle", async (t) => {
  const f = await setup(t);
  f.sync.enabled = () => true;
  f.sync.stopped = false;
  let finish,
    scheduled = 0;
  f.sync.cycle = () =>
    new Promise((r) => {
      finish = r;
    });
  f.sync.schedule = () => {
    scheduled++;
  };
  const first = f.sync.sync();
  await new Promise((r) => setImmediate(r));
  f.sync.sync();
  finish();
  await first;
  assert.equal(scheduled, 1);
});
