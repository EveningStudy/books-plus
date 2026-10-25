// Verify exactly the names, sizes and digests an installed updater will request.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict"),
  yaml = require("js-yaml");
(async () => {
  const dir = path.resolve(process.argv[2] || "release");
  const version = require("../package.json").version;
  let checked = 0;
  for (const name of ["latest.yml", "latest-mac.yml"]) {
    let text;
    try {
      text = await fs.readFile(path.join(dir, name), "utf8");
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    const manifest = yaml.load(text);
    assert.equal(manifest.version, version);
    assert.ok(manifest.files?.length);
    for (const entry of manifest.files) {
      const file = decodeURIComponent(entry.url);
      assert.equal(
        path.basename(file),
        file,
        "manifest references a local release asset name",
      );
      const bytes = await fs.readFile(path.join(dir, file));
      assert.equal(bytes.length, entry.size, "installer size " + file);
      assert.equal(
        crypto.createHash("sha512").update(bytes).digest("base64"),
        entry.sha512,
        "installer digest " + file,
      );
      await fs.access(path.join(dir, file + ".blockmap"));
      console.log("PASS", name, file, bytes.length);
      checked++;
    }
    assert.equal(manifest.path, manifest.files[0].url);
    assert.equal(manifest.sha512, manifest.files[0].sha512);
  }
  assert.ok(checked, "at least one generated update manifest must exist");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
