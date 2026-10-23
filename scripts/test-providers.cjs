const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const { Library, atomicJson } = require("../desktop/library.cjs");
// Optional native acceptance: writes/removes only synthetic fixtures in configured Mac providers.
// No provider login or private books are read. Server delivery to another device is not asserted.
(async () => {
  if (process.platform !== "darwin")
    throw Error("This optional provider acceptance runs on macOS");
  const local = await fs.mkdtemp(path.resolve(".qa/provider-folders-"));
  const cloudStorage = path.join(os.homedir(), "Library/CloudStorage");
  const names = await fs.readdir(cloudStorage);
  const providers = [];
  for (const prefix of ["OneDrive-", "GoogleDrive-"]) {
    const name = names.find((n) => n.startsWith(prefix));
    if (!name) continue;
    let parent = path.join(cloudStorage, name);
    if (prefix === "GoogleDrive-") {
      const children = await fs.readdir(parent);
      const drive = children.find((n) =>
        ["My Drive", "我的云端硬盘"].includes(n),
      );
      if (!drive) continue;
      parent = path.join(parent, drive);
    }
    providers.push({ label: prefix.slice(0, -1), parent });
  }
  const results = [];
  for (const { label, parent } of providers) {
    const root = path.join(
      parent,
      "BooksPlus Acceptance " + crypto.randomUUID().slice(0, 8),
    );
    const a = await new Library(path.join(local, label + "-a")).init(),
      b = await new Library(path.join(local, label + "-b")).init();
    await fs.mkdir(root);
    try {
      await a.configure(root);
      const input = path.join(local, label + ".txt"),
        source = Buffer.from(
          "Synthetic BooksPlus cloud provider test.\n中文测试。\n",
        );
      await fs.writeFile(input, source);
      const added = await a.import([input]);
      assert.deepEqual(added.failed, []);
      const id = added.imported[0];
      await a.save(id, {
        reading: { progress: 0.37 },
        mark: { id: "mark", type: "bookmark", text: "Synthetic bookmark" },
      });
      const data = await b.configure(root);
      assert.equal(a.libraryKey, b.libraryKey);
      assert.equal(data.books[0].state.reading.progress, 0.37);
      assert.equal(
        data.books[0].storage.supported,
        false,
        "third-party File Providers must not be classified as iCloud eviction support",
      );
      const original = await fs.readFile(await b.bookPath(id));
      assert.deepEqual(original, source);
      const prepared = await b.read(id);
      assert.equal(prepared[0], 80);
      b.closed(id);
      await b.save(id, {
        reading: { progress: 0.72 },
        mark: { id: "mark", deleted: true },
      });
      const restored = await a.load();
      assert.equal(restored.books[0].state.reading.progress, 0.72);
      assert.equal(restored.books[0].state.marks.mark.deleted, true);
      await assert.rejects(b.release(id), /客户端的移除下载/);
      assert.deepEqual(
        await fs.readFile(await b.bookPath(id)),
        source,
        "unsupported release must preserve the actual provider file",
      );
      results.push({
        provider: label,
        import: true,
        renderConversion: true,
        roundtripProgress: true,
        tombstone: true,
        unsupportedReleasePreservesSource: true,
        serverUploadConfirmed: false,
      });
      console.log(results.at(-1));
    } finally {
      a.close();
      b.close();
      assert.equal(path.dirname(root), parent);
      assert.ok(path.basename(root).startsWith("BooksPlus Acceptance "));
      await fs.rm(root, { recursive: true, force: true });
    }
  }
  await atomicJson(path.join(local, "result.json"), results);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
