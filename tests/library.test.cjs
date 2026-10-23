const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  Library,
  mergeDevices,
  within,
  atomicJson,
} = require("../desktop/library.cjs");
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
