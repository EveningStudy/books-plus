const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Library, mergeDevices, within, atomicJson } = require("./helpers.cjs");
test("device merge retains independent marks, newer progress and deletion tombstones", () => {
  const a = {
    version: 1,
    books: {
      book: {
        reading: { cfi: "a", updatedAt: "2026-10-22T12:00:00Z" },
        marks: { first: { text: "old", updatedAt: "2026-10-22T12:00:00Z" } },
      },
    },
  };
  const b = {
    version: 1,
    books: {
      book: {
        reading: { cfi: "b", updatedAt: "2026-10-23T12:00:00Z" },
        marks: {
          first: { deleted: true, updatedAt: "2026-10-23T12:00:00Z" },
          second: { text: "keep", updatedAt: "2026-10-22T12:00:00Z" },
        },
      },
    },
  };
  for (const list of [
    [a, b],
    [b, a],
  ]) {
    const result = mergeDevices(list).book;
    assert.equal(result.reading.cfi, "b");
    assert.equal(result.marks.first.deleted, true);
    assert.equal(result.marks.second.text, "keep");
  }
});
test("library rejects path traversal and absolute paths", () => {
  const root = path.resolve("test-root");
  assert.throws(() => within(root, "../secret.txt"));
  assert.throws(() => within(root, path.resolve("secret.txt")));
  assert.equal(
    within(root, "books/book.epub"),
    path.join(root, "books/book.epub"),
  );
});
test("read and write preserves exporter records, imports Apple CFI, restores progress and tombstones", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "books-state-test-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "export");
  const raw = [
    {
      asset_id: "book",
      title: "Example",
      file: "books/example.epub",
      reading_progress_fraction: 0.4,
      cloud_reading_records: [
        {
          ZREADINGPOSITIONCFISTRING: "epubcfi(/6/4!/4/2/1:5)",
          ZREADINGPOSITIONLOCATIONUPDATEDATE: 10,
        },
      ],
    },
  ];
  await atomicJson(path.join(root, "library.json"), raw);
  await atomicJson(path.join(root, "records/annotations.json"), [
    {
      ZANNOTATIONASSETID: "book",
      ZANNOTATIONUUID: "a",
      ZANNOTATIONTYPE: 2,
      ZANNOTATIONSELECTEDTEXT: "kept",
    },
  ]);
  const source = await fs.readFile(path.join(root, "library.json"), "utf8");
  const library = await new Library(path.join(temp, "user")).init();
  const loaded = await library.configure(root);
  assert.equal(loaded.books[0].appleCfi, "epubcfi(/6/4!/4/2/1:5)");
  assert.equal(loaded.books[0].annotations[0].text, "kept");
  await Promise.all([
    library.save("book", {
      reading: { cfi: "epubcfi(/6/4!/4/2/1:10)", progress: 0.5 },
    }),
    library.save("book", {
      mark: { id: "mark", type: "bookmark", text: "test" },
    }),
    library.save("book", { status: { favorite: true } }),
  ]);
  const second = await new Library(path.join(temp, "other-device")).init();
  const restored = await second.configure(root);
  assert.equal(restored.books[0].state.reading.progress, 0.5);
  assert.equal(restored.books[0].state.marks.mark.text, "test");
  await second.save("book", { mark: { id: "mark", deleted: true } });
  assert.equal((await library.load()).books[0].state.marks.mark.deleted, true);
  assert.equal(
    await fs.readFile(path.join(root, "library.json"), "utf8"),
    source,
  );
  assert.deepEqual(JSON.parse(source), raw);
});
test("cloud write failure retains durable local progress and can be retried", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "books-offline-test-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "export");
  await atomicJson(path.join(root, "library.json"), [
    { asset_id: "book", title: "Example", file: "books/example.epub" },
  ]);
  const library = await new Library(path.join(temp, "user")).init();
  await library.configure(root);
  await fs.writeFile(path.join(root, "reader-state"), "blocks folder creation");
  const result = await library.save("book", { reading: { progress: 0.7 } });
  assert.equal(result.synced, false);
  assert.equal(
    JSON.parse(await fs.readFile(library.stateFile, "utf8")).books.book.reading
      .progress,
    0.7,
  );
  await fs.rm(path.join(root, "reader-state"));
  assert.equal((await library.flush()).synced, true);
});

test("equal-time conflicts converge and equivalent ISO offsets compare by time", () => {
  const device = (reading) => ({ version: 1, books: { b: { reading } } });
  const a = device({ progress: 0.8, updatedAt: "2026-10-23T12:00:00.000Z" });
  const b = device({ progress: 0.2, updatedAt: "2026-10-23T13:00:00+01:00" });
  assert.deepEqual(mergeDevices([a, b]), mergeDevices([b, a]));
  const c = device({ progress: 0.9, updatedAt: "2026-10-23T12:00:01Z" });
  assert.equal(mergeDevices([b, c]).b.reading.progress, 0.9);
  assert.equal(
    mergeDevices([c, device({ progress: 0, updatedAt: "garbage" })]).b.reading
      .progress,
    0.9,
  );
});
test("partial local edits merge newly arrived fields without a preceding library reload", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "books-merge-late-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "Dropbox 中文 Library");
  const mac = await new Library(path.join(temp, "mac")).init();
  await mac.configure(root);
  const input = path.join(temp, "book.txt");
  await fs.writeFile(input, "test");
  const {
    imported: [id],
  } = await mac.import([input]);
  const win = await new Library(path.join(temp, "win")).init();
  await win.configure(root);
  await win.save(id, { status: { want: true, finished: true } });
  await mac.save(id, { status: { favorite: true } });
  assert.deepEqual((await win.load()).books[0].state.status, {
    want: true,
    finished: true,
    favorite: true,
    updatedAt: mac.device.books[id].status.updatedAt,
  });
});
test("own cloud state recovers after lost local backup; unchanged flush does not create provider churn", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "books-recover-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const user = path.join(temp, "user"),
    root = path.join(temp, "cloud");
  const a = await new Library(user).init();
  await a.configure(root);
  const input = path.join(temp, "book.txt");
  await fs.writeFile(input, "test");
  const {
    imported: [id],
  } = await a.import([input]);
  await a.save(id, {
    reading: { progress: 0.6 },
    mark: { id: "m", type: "bookmark", text: "kept" },
  });
  await fs.rm(a.stateFile);
  const restarted = await new Library(user).init();
  await restarted.load();
  assert.equal(restarted.device.books[id].reading.progress, 0.6);
  await restarted.save(id, { status: { favorite: true } });
  const file = path.join(
    root,
    "reader-state/v1/devices",
    a.config.deviceId + ".json",
  );
  const before = (await fs.stat(file)).mtimeMs;
  await restarted.flush();
  assert.equal((await fs.stat(file)).mtimeMs, before);
  assert.equal(
    JSON.parse(await fs.readFile(file)).books[id].marks.m.text,
    "kept",
  );
});
test("declared revision survives delayed body delivery and corrupt snapshots do not erase progress", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "books-delay-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "OneDrive 中文");
  await atomicJson(path.join(root, "catalog.json"), {
    version: 2,
    libraryId: "shared",
    books: [
      { id: "b", content: { path: "content/b/book.epub", revision: "r" } },
    ],
  });
  await atomicJson(path.join(root, "reader-state/v1/devices/win.json"), {
    version: 1,
    books: {
      b: {
        reading: {
          cfi: "epubcfi(/6/2!/4/2/1:0)",
          contentRevision: "r",
          progress: 0.5,
          updatedAt: "2026-10-23T12:00:00Z",
        },
      },
    },
  });
  await fs.writeFile(
    path.join(root, "reader-state/v1/devices/broken.json"),
    "{",
  );
  const library = await new Library(path.join(temp, "user")).init();
  const data = await library.configure(root);
  assert.equal(data.books[0].contentRevision, "r");
  assert.ok(data.books[0].state.reading.cfi);
  assert.match(data.syncError, /broken/);
  await assert.rejects(library.read("b"), /ENOENT/);
});
