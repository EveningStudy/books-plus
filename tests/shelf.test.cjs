const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { SourceLibrary, Shelf } = require("../desktop/shelf.cjs");
const { atomicJson, json } = require("../desktop/library.cjs");
const { AppleBooksSync } = require("../desktop/apple-books.cjs");
const cloud = {
  inspect: async (files) =>
    files.map((f) => ({
      id: f.id,
      status: { state: "local", supported: false },
    })),
};
async function fixture(t) {
  const base = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "booksplus-shelf-")),
  );
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "Apple Library"),
    folder = path.join(base, "Comics");
  await fs.mkdir(root);
  await fs.mkdir(folder);
  const primary = await new SourceLibrary(path.join(base, "profile"), {
    cloud,
  }).init();
  await primary.configure(root);
  const shelf = await new Shelf(primary).init();
  return { base, root, folder, primary, shelf };
}
test("plain folders join the shelf without reading or copying book bodies; overlaps are rejected", async (t) => {
  const { root, folder, shelf } = await fixture(t);
  await fs.mkdir(path.join(folder, "Volume 2"));
  await fs.writeFile(
    path.join(folder, "Volume 2", "Story.cbz"),
    "placeholder, never opened",
  );
  await fs.writeFile(path.join(folder, "Readme.txt"), "synthetic text");
  const read = fs.readFile,
    reads = [];
  fs.readFile = async function (file, ...args) {
    if (/\.(cbz|txt)$/i.test(String(file))) {
      reads.push(file);
      throw Error("body must not be read");
    }
    return read.call(this, file, ...args);
  };
  let data;
  try {
    data = await shelf.add(folder);
    for (const b of data.books) await shelf.cover(b.id);
  } finally {
    fs.readFile = read;
  }
  assert.deepEqual(reads, []);
  assert.equal(data.sources.length, 2);
  assert.equal(data.sources.filter((s) => s.appleBooks).length, 1);
  assert.equal(data.root, root);
  assert.deepEqual(data.books.map((b) => b.title).sort(), ["Readme", "Story"]);
  assert.ok(!(await fs.stat(path.join(folder, "content")).catch(() => false)));
  await assert.rejects(shelf.add(folder), /重叠/);
  await assert.rejects(shelf.add(path.join(folder, "Volume 2")), /重叠/);
  await assert.rejects(shelf.add(path.dirname(folder)), /重叠/);
});
test("matching book IDs in separate catalogs retain isolated progress, deletion and legacy state", async (t) => {
  const { root, folder, primary, shelf } = await fixture(t);
  for (const dir of [root, folder]) {
    await fs.writeFile(path.join(dir, "book.txt"), "Synthetic book");
    await atomicJson(path.join(dir, "catalog.json"), {
      version: 2,
      libraryId: path.basename(dir).replaceAll(" ", "-"),
      books: [
        {
          id: "same-book",
          title: path.basename(dir),
          content: { path: "book.txt" },
        },
      ],
    });
  }
  await primary.load();
  await primary.save("same-book", {
    reading: { progress: 0.23 },
    mark: { id: "legacy-note", text: "keep", type: "highlight" },
  });
  let data = await shelf.add(folder);
  const legacy = data.books.find((b) => b.title === path.basename(root)),
    added = data.books.find((b) => b.title === path.basename(folder));
  assert.equal(legacy.id, "same-book");
  assert.notEqual(added.id, legacy.id);
  assert.equal(legacy.state.reading.progress, 0.23);
  assert.equal(legacy.state.marks["legacy-note"].text, "keep");
  await shelf.save(added.id, {
    reading: { progress: 0.71 },
    mark: { id: "comic-note", text: "other", type: "bookmark" },
  });
  await shelf.setDeleted(added.id, true);
  data = await shelf.load();
  assert.equal(data.books.length, 1);
  assert.equal(data.trash.length, 1);
  assert.equal(data.books[0].state.reading.progress, 0.23);
  assert.equal(data.trash[0].state.reading.progress, 0.71);
  await shelf.setDeleted(added.id, false);
  data = await shelf.load();
  assert.equal(data.books.length, 2);
  assert.equal(
    data.books.find((b) => b.id === added.id).state.marks["comic-note"].text,
    "other",
  );
});
test("loose folder replicas share progress and tombstones; remove/re-add and restart preserve identity", async (t) => {
  const { base, folder, shelf } = await fixture(t);
  await fs.writeFile(
    path.join(folder, "Comic.cbz"),
    "synthetic comic placeholder",
  );
  const first = await shelf.add(folder),
    source = first.sources.find((s) => !s.appleBooks),
    book = first.books[0];
  await shelf.save(book.id, {
    reading: { progress: 0.42 },
    mark: { id: "mark", text: "unchanged", type: "bookmark" },
  });
  const mirror = path.join(base, "Mirrored Comics");
  await fs.cp(folder, mirror, { recursive: true, preserveTimestamps: true });
  const peer = await new SourceLibrary(path.join(base, "peer"), {
    cloud,
  }).init();
  const peerRoot = path.join(base, "Peer Apple");
  await peer.configure(peerRoot);
  const peerShelf = await new Shelf(peer).init();
  let value = await peerShelf.add(mirror);
  assert.equal(value.books[0].state.reading.progress, 0.42);
  assert.equal(value.books[0].state.marks.mark.text, "unchanged");
  await shelf.setDeleted(book.id, true);
  await fs.cp(
    path.join(folder, "reader-state"),
    path.join(mirror, "reader-state"),
    { recursive: true },
  );
  value = await peerShelf.load();
  assert.equal(value.books.length, 0);
  assert.equal(value.trash.length, 1);
  await shelf.remove(source.id);
  assert.equal(
    await fs.readFile(path.join(folder, "Comic.cbz"), "utf8"),
    "synthetic comic placeholder",
  );
  value = await shelf.add(folder);
  assert.equal(value.trash.length, 1);
  await shelf.setDeleted(value.trash[0].id, false);
  const restarted = await new SourceLibrary(shelf.primary.userDir, {
    cloud,
  }).init();
  value = await (await new Shelf(restarted).init()).load();
  assert.equal(value.books[0].state.reading.progress, 0.42);
  assert.equal(value.books[0].state.marks.mark.text, "unchanged");
  await assert.rejects(shelf.add(mirror), /同一书库/);
});
test("switching the single Apple bridge keeps the old folder and routes imports to the chosen destination", async (t) => {
  const { base, root, folder, primary, shelf } = await fixture(t);
  await fs.writeFile(path.join(folder, "Existing.txt"), "Existing original");
  const initial = await shelf.add(folder),
    target = initial.sources.find((s) => !s.appleBooks);
  await assert.rejects(
    shelf.remove(initial.sources.find((s) => s.appleBooks).id),
    /先为 Apple Books/,
  );
  await shelf.save(initial.books[0].id, { reading: { progress: 0.51 } });
  let data = await shelf.setBridge(target.id);
  assert.equal(primary.config.root, folder);
  assert.equal(data.sources.filter((s) => s.appleBooks).length, 1);
  assert.equal(data.sources.find((s) => s.appleBooks).id, target.id);
  assert.equal(data.sources.length, 2);
  assert.equal(data.books[0].state.reading.progress, 0.51);
  const old = data.sources.find((s) => s.root === root);
  await shelf.setImportSource(target.id);
  const file = path.join(base, "Added.md");
  await fs.writeFile(file, "# Added\nSynthetic text");
  const imported = await shelf.import([file]);
  assert.equal(imported.imported.length, 1);
  assert.equal(imported.data.books.length, 2);
  assert.ok(!(await fs.stat(path.join(root, "content")).catch(() => false)));
  await shelf.remove(old.id);
  const config = await json(path.join(primary.userDir, "config.json"));
  assert.equal(config.root, folder);
  assert.equal(config.sources.length, 1);
  const next = await new SourceLibrary(primary.userDir, { cloud }).init();
  data = await (await new Shelf(next).init()).load();
  assert.equal(data.books.length, 2);
  assert.equal(
    data.books.find((b) => b.title === "Existing").state.reading.progress,
    0.51,
  );
});
test("an unavailable source reports an error without removing other books or overwriting its catalog", async (t) => {
  const { folder, shelf } = await fixture(t);
  await fs.writeFile(path.join(folder, "Book.txt"), "test");
  const initial = await shelf.add(folder);
  await shelf.save(initial.books[0].id, { reading: { progress: 0.3 } });
  const moved = folder + "-unmounted";
  await fs.rename(folder, moved);
  let data = await shelf.load();
  assert.equal(data.books.length, 1);
  assert.ok(data.sources.find((s) => s.root === folder).error);
  assert.equal(data.books[0].storage.state, "unknown");
  assert.equal((await shelf.flush()).synced, false);
  assert.equal(await fs.stat(folder).catch(() => null), null);
  await fs.rename(moved, folder);
  data = await shelf.load();
  assert.equal(data.books.length, 1);
  assert.equal(data.syncError, undefined);
});

test("folder changes reject active readers and roll back failed configuration writes", async (t) => {
  const { folder, shelf, primary } = await fixture(t);
  await fs.writeFile(
    path.join(folder, "Book.md"),
    "# A book\n\nSynthetic text.",
  );
  let data = await shelf.add(folder);
  const book = data.books[0],
    target = data.sources.find((s) => !s.appleBooks);
  await shelf.read(book.id);
  await assert.rejects(shelf.remove(target.id), /先返回书库/);
  await assert.rejects(shelf.setBridge(target.id), /先返回书库/);
  shelf.closed(book.id);
  const original = shelf.persist;
  shelf.persist = async () => {
    throw Error("injected config write failure");
  };
  const root = primary.config.root;
  await assert.rejects(shelf.setBridge(target.id), /injected/);
  assert.equal(primary.config.root, root);
  assert.equal(shelf.bridgeId, data.sources.find((s) => s.appleBooks).id);
  await assert.rejects(shelf.remove(target.id), /injected/);
  assert.equal(shelf.list().length, 2);
  await assert.rejects(shelf.setImportSource(target.id), /injected/);
  assert.notEqual(primary.config.importSourceId, target.id);
  shelf.persist = original;
  data = await shelf.load();
  assert.equal(data.books.length, 1);
});

test("selecting a default plain folder and reconfiguring a folder bridge never creates a conflicting catalog", async (t) => {
  const { root, shelf, primary } = await fixture(t);
  await fs.unlink(path.join(root, "catalog.json"));
  await fs.writeFile(path.join(root, "Loose.cbz"), "synthetic fixture");
  const first = await shelf.prepare(shelf.bridgeId);
  const identity = await json(path.join(root, ".booksplus-folder.json"));
  assert.equal(first.books.length, 1);
  await primary.configure(root);
  assert.equal(
    await fs.stat(path.join(root, "catalog.json")).catch(() => null),
    null,
  );
  assert.equal(
    (await json(path.join(root, ".booksplus-folder.json"))).libraryId,
    identity.libraryId,
  );
  assert.equal((await shelf.load()).books.length, 1);
});

test("Apple sync sees only the selected folder and follows an explicit bridge change", async (t) => {
  const { folder, shelf, primary } = await fixture(t);
  await fs.writeFile(
    path.join(folder, "Independent.pdf"),
    "%PDF-1.4 synthetic import fixture",
  );
  const data = await shelf.add(folder),
    opens = [];
  const sync = new AppleBooksSync(primary, {
    snapshot: async () => ({
      libraryAvailable: true,
      tables: { ZBKLIBRARYASSET: [], ZAEANNOTATION: [] },
      errors: [],
    }),
    open: async (file) => opens.push(file),
  });
  t.after(() => sync.stop());
  await sync.cycle();
  assert.deepEqual(
    opens,
    [],
    "independent books must not be sent to Apple Books",
  );
  await shelf.setBridge(data.sources.find((s) => s.root === folder).id);
  await sync.cycle();
  assert.deepEqual(opens, [path.join(folder, "Independent.pdf")]);
});
