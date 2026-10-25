// One side of the opt-in real provider test. Never use a personal library as root.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const { Library } = require("../desktop/library.cjs");
async function stage(task) {
  assert.ok(path.basename(task.root).startsWith("BooksPlus QA "));
  const library = await new Library(task.user).init();
  try {
    if (task.action === "seed") {
      await fs.mkdir(task.root, { recursive: true });
      await library.configure(task.root);
      const file = path.join(task.user, "Synthetic 双机验收.txt");
      await fs.writeFile(
        file,
        "Synthetic BooksPlus two-host test. 中文云盘验证。\n".repeat(300),
      );
      const result = await library.import([file]);
      assert.deepEqual(result.failed, []);
      const id = result.imported[0];
      await library.save(id, { reading: { progress: 0.12 } });
      return {
        id,
        key: library.libraryKey,
        hash: crypto
          .createHash("sha256")
          .update(await fs.readFile(await library.bookPath(id)))
          .digest("hex"),
      };
    }
    // Never configure a provider folder before its catalogue has arrived from the other host.
    await fs.access(path.join(task.root, "catalog.json"));
    const data = await library.configure(task.root),
      e = task.expected;
    assert.equal(
      library.libraryKey,
      e.key,
      "stable library identity across operating systems",
    );
    const book = [...data.books, ...data.trash].find((b) => b.id === e.id);
    assert.ok(book, "book catalogue delivery");
    assert.equal(
      !!book.state.lifecycle?.deleted,
      !!e.deleted,
      "deletion delivery",
    );
    assert.equal(book.state.reading.progress, e.progress, "progress delivery");
    if (e.mark !== undefined)
      assert.equal(
        book.state.marks["mac-bookmark"]?.deleted || false,
        e.mark === "deleted",
      );
    if (e.mark === "present")
      assert.equal(
        book.state.marks["mac-bookmark"].text,
        "Synthetic Mac bookmark",
      );
    const bytes = await fs.readFile(await library.bookPath(e.id));
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      e.hash,
      "provider delivered exact book bytes",
    );
    if (task.action === "mac-read") {
      const prepared = await library.read(e.id);
      assert.ok(prepared.length > 100);
      library.closed(e.id);
      await library.save(e.id, {
        reading: { progress: 0.37 },
        mark: {
          id: "mac-bookmark",
          type: "bookmark",
          text: "Synthetic Mac bookmark",
        },
      });
    } else if (task.action === "win-read") {
      await library.save(e.id, {
        reading: { progress: 0.72 },
        mark: { id: "mac-bookmark", deleted: true },
      });
    } else if (task.action === "delete") {
      await library.setDeleted(e.id, true);
    } else if (task.action === "restore") {
      await assert.rejects(library.read(e.id), /删除/);
      await assert.rejects(
        library.save(e.id, { reading: { progress: 0 } }),
        /删除/,
      );
      await library.setDeleted(e.id, false);
    }
    return {
      verified: true,
      action: task.action,
      at: new Date().toISOString(),
      platform: process.platform,
      key: library.libraryKey,
    };
  } finally {
    library.close();
  }
}
module.exports = { stage };
if (require.main === module)
  stage(JSON.parse(Buffer.from(process.argv[2], "base64").toString("utf8")))
    .then((v) => console.log(JSON.stringify(v)))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
