const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { Library, atomicJson, mergeDevices } = require("./helpers.cjs");
test("deletion converges across replicas, stale reading cannot resurrect, restore keeps marks", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "booksplus-delete-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const a = await new Library(path.join(dir, "a")).init();
  const b = await new Library(path.join(dir, "b")).init();
  const root = path.join(dir, "cloud");
  await fs.mkdir(root);
  await a.configure(root);
  const input = path.join(dir, "test.txt");
  await fs.writeFile(input, "Synthetic test only");
  const id = (await a.import([input])).imported[0];
  await b.configure(root);
  await a.save(id, {
    reading: { progress: 0.42 },
    mark: { id: "m", type: "bookmark", text: "keep" },
  });
  const source = await fs.readFile(await a.bookPath(id));
  await a.setDeleted(id, true);
  const deleted = await b.load();
  assert.equal(deleted.books.length, 0);
  assert.equal(deleted.trash[0].id, id);
  await assert.rejects(b.save(id, { reading: { progress: 0.1 } }), /删除/);
  await assert.rejects(b.read(id), /删除/);
  await b.setDeleted(id, false);
  const restored = await a.load();
  assert.equal(restored.books[0].state.reading.progress, 0.42);
  assert.equal(restored.books[0].state.marks.m.text, "keep");
  assert.deepEqual(await fs.readFile(await a.bookPath(id)), source);
  a.active.add(id);
  await assert.rejects(a.setDeleted(id, true), /关闭/);
});
test("offline deletion survives restart and retries without altering exporter input", async (t) => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "booksplus-delete-offline-"),
  );
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "cloud"),
    user = path.join(dir, "user");
  const raw = [{ asset_id: "APPLE", title: "Exported", file: "book.epub" }];
  await atomicJson(path.join(root, "library.json"), raw);
  const a = await new Library(user).init();
  await a.configure(root);
  await fs.writeFile(path.join(root, "reader-state"), "offline");
  assert.equal((await a.setDeleted("APPLE", true)).synced, false);
  const b = await new Library(user).init();
  assert.equal((await b.load()).trash.length, 1);
  await fs.rm(path.join(root, "reader-state"));
  assert.equal((await b.flush()).synced, true);
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(root, "library.json"))),
    raw,
  );
});
test("sidecar takes precedence once and a legacy sidecar tombstone suppresses base entry", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "booksplus-catalog-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "cloud"),
    a = await new Library(path.join(dir, "user")).init();
  await atomicJson(path.join(root, "library.json"), [
    { asset_id: "A", title: "old" },
  ]);
  await atomicJson(path.join(root, "catalog/extra/A.json"), {
    version: 2,
    book: { id: "A", title: "new" },
  });
  assert.equal((await a.configure(root)).books.length, 1);
  assert.equal((await a.load()).books[0].title, "new");
  await atomicJson(path.join(root, "catalog/extra/A.json"), {
    version: 2,
    book: { id: "A", deleted: true },
  });
  assert.equal((await a.load()).books.length, 0);
});
test("lifecycle merges independently of later reading, including equal-time ordering", () => {
  const a = {
    version: 1,
    books: {
      b: { lifecycle: { deleted: true, updatedAt: "2026-10-25T10:00:00Z" } },
    },
  };
  const b = {
    version: 1,
    books: {
      b: {
        reading: { progress: 0.9, updatedAt: "2026-10-25T11:00:00Z" },
        lifecycle: { deleted: false, updatedAt: "2026-10-25T10:00:00Z" },
      },
    },
  };
  assert.deepEqual(mergeDevices([a, b]), mergeDevices([b, a]));
  assert.equal(mergeDevices([a, b]).b.lifecycle.deleted, true);
});

test("missing, corrupt and older provider snapshots cannot roll back observed deletion across restart", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "booksplus-observed-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "cloud"),
    user = path.join(dir, "reader");
  const remote = await new Library(path.join(dir, "remote")).init();
  await remote.configure(root);
  const input = path.join(dir, "fixture.txt");
  await fs.writeFile(input, "Synthetic");
  const id = (await remote.import([input])).imported[0];
  await remote.save(id, {
    reading: { progress: 0.42 },
    mark: { id: "keep", type: "bookmark" },
  });
  const reader = await new Library(user).init();
  await reader.configure(root);
  const file = path.join(
    root,
    "reader-state/v1/devices",
    remote.config.deviceId + ".json",
  );
  const old = await fs.readFile(file);
  await remote.setDeleted(id, true);
  assert.equal((await reader.load()).trash.length, 1);
  await fs.writeFile(file, "{");
  assert.equal((await reader.load()).trash.length, 1);
  await fs.rm(file);
  assert.equal((await reader.load()).trash.length, 1);
  const restarted = await new Library(user).init();
  assert.equal((await restarted.load()).trash[0].state.reading.progress, 0.42);
  await fs.writeFile(file, old);
  assert.equal((await restarted.load()).trash.length, 1);
  await assert.rejects(
    restarted.save(id, { reading: { progress: 0 } }),
    /删除/,
  );
  await remote.setDeleted(id, false);
  assert.equal(
    (await restarted.load()).books[0].state.marks.keep.type,
    "bookmark",
  );
  const other = path.join(dir, "other");
  await atomicJson(path.join(other, "catalog.json"), {
    version: 2,
    libraryId: "different",
    books: [{ id, title: "Same id in a different library" }],
  });
  const isolated = await restarted.configure(other);
  assert.equal(isolated.books[0].state.reading, undefined);
});
