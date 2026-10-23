const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { Models } = require("../desktop/models.cjs");
const { MODELS } = require("../desktop/model-catalog.cjs");
const digest = (data) => crypto.createHash("sha256").update(data).digest("hex");
async function fixture(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "booksplus-model-test-"));
  const originalFetch = global.fetch;
  const archive = Buffer.from("download fixture");
  const model = {
    id: "test-download",
    url: "https://example.invalid/model",
    folder: "test-model",
    size: archive.length + 4,
    archiveSize: archive.length,
    sha256: digest(archive),
    extras: [
      {
        name: "voice.wav",
        url: "https://example.invalid/voice",
        size: 4,
        sha256: digest(Buffer.from("good")),
      },
    ],
  };
  MODELS.push(model);
  const models = new Models(dir);
  try {
    await run({ dir, models, model, archive });
  } finally {
    global.fetch = originalFetch;
    MODELS.splice(MODELS.indexOf(model), 1);
    models.close();
    assert.ok(
      path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    assert.ok(path.basename(dir).startsWith("booksplus-model-test-"));
    await fs.rm(dir, { recursive: true, force: true });
  }
}
test("a valid archive cannot install when its separate voice asset is corrupt", async () =>
  fixture(async ({ dir, models, model, archive }) => {
    const requested = [];
    global.fetch = async (url) => {
      requested.push(url);
      return new Response(url === model.url ? archive : Buffer.from("bad!"));
    };
    await assert.rejects(models.install(model.id), /SHA-256/);
    assert.deepEqual(requested, [model.url, model.extras[0].url]);
    assert.deepEqual(await fs.readdir(dir), []);
    assert.equal(models.jobs.size, 0);
  }));
test("cancelling the separate voice download leaves no partial installation", async () =>
  fixture(async ({ dir, models, model, archive }) => {
    const progress = [];
    models.notify = (p) => {
      progress.push(p);
      if (p.received > archive.length && p.phase === "downloading")
        models.cancel(model.id);
    };
    global.fetch = async (url) =>
      new Response(url === model.url ? archive : Buffer.from("good"));
    await models.install(model.id);
    assert.equal(progress.at(-1).phase, "cancelled");
    assert.deepEqual(await fs.readdir(dir), []);
    assert.equal(models.jobs.size, 0);
  }));
test("legacy models appear only while installed and cannot be downloaded again", async () =>
  fixture(async ({ dir, models }) => {
    assert.ok((await models.list()).every((m) => !m.legacy));
    const legacy = path.join(dir, "kokoro-int8");
    await fs.mkdir(legacy);
    await fs.writeFile(path.join(legacy, "installed.json"), "{}");
    assert.equal(
      (await models.list()).find((m) => m.id === "kokoro-int8").installed,
      true,
    );
    await assert.rejects(models.install("kokoro-int8"), /旧模型/);
    await models.remove("kokoro-int8");
    assert.ok(!(await models.list()).some((m) => m.id === "kokoro-int8"));
  }));
