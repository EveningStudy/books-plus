const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Library, atomicJson } = require("./helpers.cjs");
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "booksplus-cloud-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "cloud");
  const states = new Map(),
    released = [];
  const cloud = {
    inspect: async (files) =>
      files.map((f) => ({
        id: f.id,
        status: states.get(f.id) || {
          state: "downloaded",
          supported: true,
          synced: true,
        },
      })),
    release: async (file) => {
      const id = path.basename(file, ".txt");
      if (states.get(id)?.synced === false) throw Error("not synced");
      released.push(id);
      return { state: "cloud", supported: true };
    },
    pin: async () => {},
    close() {},
  };
  await atomicJson(
    path.join(root, "library.json"),
    ["old", "active", "offline", "recent", "unsynced"].map((id) => ({
      asset_id: id,
      title: id,
      file: id + ".txt",
    })),
  );
  for (const id of ["old", "active", "offline", "recent", "unsynced"])
    await fs.writeFile(path.join(root, id + ".txt"), "正文");
  const library = await new Library(path.join(dir, "user"), { cloud }).init();
  await library.configure(root);
  return { dir, root, library, states, released, cloud };
}
test("library and cover browsing never read book bodies", async (t) => {
  const { library, root } = await setup(t),
    original = fs.readFile;
  let reads = 0;
  fs.readFile = async (file, ...args) => {
    if (String(file).startsWith(root) && String(file).endsWith(".txt")) {
      reads++;
      throw Error("body read while browsing");
    }
    return original(file, ...args);
  };
  try {
    await library.load();
    await library.cover("old");
    assert.equal(reads, 0);
  } finally {
    fs.readFile = original;
  }
  // read() extracts the cover in the background. Finish that job before teardown
  // removes its output directory, otherwise Windows can report ENOTEMPTY.
  const extractCover = library.extractCover.bind(library);
  let coverJob;
  library.extractCover = (...args) => (coverJob = extractCover(...args));
  const data = await library.read("old");
  await coverJob;
  assert.equal(data[0], 80);
  library.closed("old");
});
test("7 day eviction skips active, offline, recent and unsynced originals", async (t) => {
  const { library, states, released, root } = await setup(t);
  const old = new Date(Date.now() - 8 * 86400000).toISOString();
  for (const id of library.items.keys())
    library.downloads[id] = { lastReadAt: old };
  library.downloads.recent.lastReadAt = new Date().toISOString();
  library.downloads.offline.offline = true;
  library.active.add("active");
  states.set("unsynced", {
    state: "downloaded",
    supported: true,
    synced: false,
  });
  const result = await library.sweep();
  assert.equal(result.released, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(released, ["old"]);
  assert.equal(
    (await fs.readFile(path.join(root, "old.txt"))).toString(),
    "正文",
  );
  await assert.rejects(library.release("active"), /关闭/);
  await assert.rejects(library.release("offline"), /离线/);
});
test("different cloud libraries isolate progress, import never edits exporter metadata", async (t) => {
  const { library, root, dir } = await setup(t);
  await library.save("old", { reading: { progress: 0.7 } });
  const original = await fs.readFile(path.join(root, "library.json"));
  const source = path.join(dir, "new.md");
  await fs.writeFile(source, "# A\n\nNew book");
  const result = await library.import([source]);
  assert.equal(result.imported.length, 1);
  assert.deepEqual(
    await fs.readFile(path.join(root, "library.json")),
    original,
  );
  const second = path.join(dir, "second");
  await fs.mkdir(second);
  await atomicJson(path.join(second, "catalog.json"), {
    version: 2,
    libraryId: "second",
    books: [{ id: "old", title: "Other", content: { path: "old.txt" } }],
  });
  await fs.writeFile(path.join(second, "old.txt"), "Second");
  const other = await library.configure(second);
  assert.equal(other.books[0].state.reading, undefined);
  await library.configure(root);
  assert.equal(
    (await library.load()).books.find((b) => b.id === "old").state.reading
      .progress,
    0.7,
  );
});
