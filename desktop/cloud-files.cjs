const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

// Cloud originals are never unlinked. Releasing a file is a provider operation.
class CloudFiles {
  constructor(script = path.join(__dirname, "cloud-files.ps1")) {
    this.script = script;
    this.pending = new Map();
  }
  request(value) {
    if (!this.child) {
      const child = (this.child = spawn(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          this.script,
        ],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
      ));
      let buffer = "",
        error = "";
      child.stderr.on("data", (d) => (error = (error + d).slice(-1500)));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (data) => {
        buffer += data;
        for (let n; (n = buffer.indexOf("\n")) >= 0;) {
          const line = buffer.slice(0, n);
          buffer = buffer.slice(n + 1);
          try {
            const v = JSON.parse(line),
              item = this.pending.get(v.id);
            if (item) {
              clearTimeout(item.timer);
              this.pending.delete(v.id);
              v.error ? item.reject(Error(v.error)) : item.resolve(v.result);
            }
          } catch {}
        }
      });
      const fail = (e) => {
        for (const [id, p] of this.pending) {
          if (p.child === child) {
            clearTimeout(p.timer);
            p.reject(e);
            this.pending.delete(id);
          }
        }
        if (this.child === child) this.child = null;
      };
      child.on("error", fail);
      child.on("exit", () => fail(Error("云盘状态服务退出：" + error)));
    }
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("云盘操作超时，请检查云盘客户端"));
        this.child?.kill();
      }, 30000);
      this.pending.set(id, { resolve, reject, timer, child: this.child });
      this.child.stdin.write(JSON.stringify({ ...value, id }) + "\n");
    });
  }
  async inspect(files) {
    if (!files.length) return [];
    if (process.platform === "win32")
      return this.request({ action: "inspect", files });
    return Promise.all(
      files.map(async ({ id, path: file }) => ({
        id,
        status: await fs
          .stat(file)
          .then((s) => ({
            state: "local",
            supported: false,
            bytes: s.size,
            synced: false,
            pinned: false,
          }))
          .catch(() => ({ state: "missing", supported: false })),
      })),
    );
  }
  async release(file) {
    if (process.platform !== "win32")
      throw Error("此平台请使用云盘客户端的“移除下载”；阅读器不会删除云端原件");
    return this.request({ action: "release", path: file });
  }
  async pin(file, pin) {
    if (process.platform !== "win32") return;
    return this.request({ action: "pin", path: file, pin });
  }
  close() {
    this.child?.kill();
  }
}
module.exports = { CloudFiles };
