const RELEASES = "https://github.com/EveningStudy/books-plus/releases/latest";
const API =
  "https://api.github.com/repos/EveningStudy/books-plus/releases/latest";
const semver = require("semver");
function updateError(error) {
  const message = String(error?.message || error);
  if (/sha-?512|checksum/i.test(message))
    return "更新文件校验失败，请重新下载。";
  if (
    /Cannot find latest.*\.yml|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND/i.test(
      message,
    )
  )
    return "正式更新源尚未就绪，请稍后重试或前往发布页下载。";
  return "无法完成更新，请检查网络后重试，或前往发布页下载。";
}

// Dependencies are injected so failure, download and restart ordering can be tested.
class Updates {
  constructor({
    updater,
    version,
    mode,
    notify = () => {},
    preferences = () => ({}),
    fetchRelease = fetch,
  }) {
    Object.assign(this, { updater, notify, preferences, fetchRelease });
    this.state = {
      phase: "idle",
      currentVersion: version,
      mode,
      releaseUrl: RELEASES,
    };
    if (!updater) return;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    updater.on("checking-for-update", () =>
      this.set({ phase: "checking", error: undefined }),
    );
    updater.on("update-not-available", () =>
      this.set({ phase: "current", version: undefined }),
    );
    updater.on("update-available", (info) =>
      this.set({ phase: "available", version: info.version }),
    );
    updater.on("download-progress", (p) =>
      this.set({
        phase: "downloading",
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
      }),
    );
    updater.on("update-downloaded", (info) =>
      this.set({ phase: "downloaded", percent: 100, version: info.version }),
    );
    updater.on("error", (e) =>
      this.set({ phase: "error", error: updateError(e) }),
    );
  }
  set(patch) {
    Object.assign(this.state, patch);
    this.notify(this.status());
  }
  status() {
    return { ...this.state };
  }
  check() {
    if (this.pending) return this.pending;
    if (["downloading", "downloaded"].includes(this.state.phase))
      return Promise.resolve(this.status());
    this.pending = this.checkNow().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  async checkNow() {
    this.set({
      phase: "checking",
      error: undefined,
      version: undefined,
      percent: undefined,
    });
    try {
      if (this.updater) {
        await this.updater.checkForUpdates();
        if (
          this.state.phase === "available" &&
          this.state.mode === "automatic" &&
          this.preferences().autoDownload !== false
        )
          await this.download();
      } else {
        const response = await this.fetchRelease(API, {
          signal: AbortSignal.timeout(20000),
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!response.ok) throw Error(`更新服务器返回 HTTP ${response.status}`);
        const release = await response.json();
        const version = semver.valid(
          String(release.tag_name || "").replace(/^v/, ""),
        );
        if (
          !version ||
          semver.prerelease(version) ||
          release.draft ||
          release.prerelease
        )
          throw Error("更新信息无效");
        this.set({
          phase: semver.gt(version, this.state.currentVersion)
            ? "available"
            : "current",
          version,
        });
      }
    } catch (e) {
      this.set({ phase: "error", error: updateError(e) });
    }
    return this.status();
  }
  async download() {
    if (!this.updater) throw Error("此版本请前往发布页下载更新");
    if (this.downloading) return this.downloading;
    if (
      !["available", "error"].includes(this.state.phase) ||
      !this.state.version
    )
      throw Error("请先检查更新");
    this.set({ phase: "downloading", percent: 0, error: undefined });
    this.downloading = this.updater
      .downloadUpdate()
      .then(() => this.status())
      .catch((e) => {
        this.set({ phase: "error", error: updateError(e) });
        return this.status();
      })
      .finally(() => {
        this.downloading = null;
      });
    return this.downloading;
  }
  requestInstall() {
    if (this.state.phase !== "downloaded" || !this.updater)
      throw Error("更新尚未下载完成");
    this.installRequested = true;
  }
  applyInstall() {
    if (!this.installRequested) return false;
    this.installRequested = false;
    this.updater.quitAndInstall(false, true);
    return true;
  }
  start() {
    this.stop();
    if (this.state.mode === "development") return;
    const run = () => {
      if (this.preferences().autoCheck !== false) void this.check();
    };
    this.startTimer = setTimeout(run, 15000);
    this.startTimer.unref?.();
    this.timer = setInterval(run, 6 * 3600000);
    this.timer.unref?.();
  }
  stop() {
    clearTimeout(this.startTimer);
    clearInterval(this.timer);
  }
}
async function updateMode(app, env = process.env, platform = process.platform) {
  if (!app.isPackaged) return "development";
  if (platform === "win32")
    return env.PORTABLE_EXECUTABLE_FILE ? "migration" : "automatic";
  if (platform === "darwin") {
    try {
      const exec = require("node:util").promisify(
        require("node:child_process").execFile,
      );
      const { stderr } = await exec(
        "/usr/bin/codesign",
        [
          "-dv",
          "--verbose=2",
          require("node:path").resolve(process.resourcesPath, "../.."),
        ],
        { timeout: 10000 },
      );
      if (/Authority=Developer ID Application:/.test(stderr))
        return "automatic";
    } catch {
      /* Ad-hoc builds can check releases but cannot use Squirrel.Mac. */
    }
  }
  return "manual";
}
module.exports = { Updates, updateMode, RELEASES };
