const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events");
const { Updates, updateMode } = require("../desktop/updates.cjs");
function fixture(mode = "automatic", preferences = {}) {
  const updater = new EventEmitter();
  let downloads = 0,
    installs = 0,
    checks = 0;
  updater.checkForUpdates = async () => {
    checks++;
    updater.emit("update-available", { version: "0.6.0" });
  };
  updater.downloadUpdate = async () => {
    downloads++;
    updater.emit("download-progress", { percent: 50 });
    updater.emit("update-downloaded", { version: "0.6.0" });
  };
  updater.quitAndInstall = () => {
    installs++;
  };
  const updates = new Updates({
    updater,
    version: "0.5.0",
    mode,
    preferences: () => preferences,
  });
  return { updater, updates, counts: () => ({ downloads, installs, checks }) };
}
test("automatic check deduplicates, downloads once and installs only after explicit request and flush", async () => {
  const { updater, updates, counts } = fixture();
  await Promise.all([updates.check(), updates.check()]);
  assert.equal(updates.status().phase, "downloaded");
  assert.deepEqual(counts(), { downloads: 1, installs: 0, checks: 1 });
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updates.applyInstall(), false);
  updates.requestInstall();
  assert.equal(counts().installs, 0);
  updates.applyInstall();
  assert.equal(counts().installs, 1);
  assert.equal(updates.applyInstall(), false);
});
test("portable migration and download opt-out require explicit download", async () => {
  for (const [mode, settings] of [
    ["migration", {}],
    ["automatic", { autoDownload: false }],
  ]) {
    const { updates, counts } = fixture(mode, settings);
    await updates.check();
    assert.equal(updates.status().phase, "available");
    assert.equal(counts().downloads, 0);
    assert.throws(() => updates.requestInstall(), /下载/);
    await updates.download();
    assert.equal(updates.status().phase, "downloaded");
  }
});
test("failed or corrupt download never installs, retry succeeds", async () => {
  const { updates, updater, counts } = fixture("automatic", {
    autoDownload: false,
  });
  await updates.check();
  const good = updater.downloadUpdate;
  updater.downloadUpdate = async () => {
    throw Error("SHA-512 mismatch");
  };
  await updates.download();
  assert.equal(updates.status().phase, "error");
  assert.throws(() => updates.requestInstall(), /下载/);
  assert.equal(counts().installs, 0);
  updater.downloadUpdate = good;
  await updates.download();
  assert.equal(updates.status().phase, "downloaded");
});
test("manual checks reject malformed, prerelease and failed server responses, never downgrade", async () => {
  for (const [response, expected] of [
    [{ ok: false, status: 503 }, "error"],
    [{ ok: true, json: async () => ({ tag_name: "bad" }) }, "error"],
    [{ ok: true, json: async () => ({ tag_name: "v0.6.0-beta.1" }) }, "error"],
    [
      {
        ok: true,
        json: async () => ({ tag_name: "v0.6.0", prerelease: true }),
      },
      "error",
    ],
    [{ ok: true, json: async () => ({ tag_name: "v0.4.0" }) }, "current"],
    [{ ok: true, json: async () => ({ tag_name: "v0.6.0" }) }, "available"],
  ]) {
    const updates = new Updates({
      version: "0.5.0",
      mode: "manual",
      fetchRelease: async () => response,
    });
    assert.equal((await updates.check()).phase, expected);
    await assert.rejects(updates.download(), /发布页/);
  }
});
test("development and portable mode are detected without installing or altering profiles", async () => {
  assert.equal(await updateMode({ isPackaged: false }), "development");
  assert.equal(
    await updateMode(
      { isPackaged: true },
      { PORTABLE_EXECUTABLE_FILE: "test.exe" },
      "win32",
    ),
    "migration",
  );
  assert.equal(
    await updateMode({ isPackaged: true }, {}, "win32"),
    "automatic",
  );
});

test("a failed fresh check does not offer a stale release for download", async () => {
  const { updates, updater } = fixture("automatic", { autoDownload: false });
  await updates.check();
  updater.checkForUpdates = async () => {
    throw Error("offline");
  };
  assert.equal((await updates.check()).version, undefined);
  await assert.rejects(updates.download(), /检查更新/);
});

test("updater failures expose a bounded user message instead of headers or stack traces", async () => {
  const { updates, updater } = fixture();
  updater.checkForUpdates = async () => {
    throw Error(
      "Cannot find latest.yml: HTTP 404 Headers: " +
        "private internals ".repeat(500),
    );
  };
  const state = await updates.check();
  assert.match(state.error, /更新源尚未就绪/);
  assert.ok(state.error.length < 100);
  assert.equal(state.error.includes("Headers"), false);
});
