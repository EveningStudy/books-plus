const fs = require("node:fs/promises");
const { createReadStream, createWriteStream } = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { Worker } = require("node:worker_threads");
const tar = require("tar");
const unbz2 = require("unbzip2-stream");
const { MODELS } = require("./model-catalog.cjs");
class Models {
  constructor(dir, notify = () => {}) {
    this.dir = dir;
    this.notify = notify;
    this.jobs = new Map();
    this.pending = new Map();
    this.queue = Promise.resolve();
  }
  async list() {
    return Promise.all(
      MODELS.map(async (m) => ({
        ...m,
        installed: !!(await fs
          .stat(path.join(this.dir, m.id, "installed.json"))
          .catch(() => null)),
        progress: this.jobs.get(m.id)?.progress,
      })),
    );
  }
  async install(id) {
    const model = MODELS.find((m) => m.id === id);
    if (!model) throw Error("未知模型");
    if (this.jobs.has(id)) return;
    const controller = new AbortController(),
      job = {
        controller,
        progress: { id, phase: "downloading", received: 0, total: model.size },
      };
    this.jobs.set(id, job);
    const staging = path.join(this.dir, `.${id}-${crypto.randomUUID()}`),
      archive = path.join(staging, "model.tar.bz2");
    const emit = (patch) => {
      job.progress = { ...job.progress, ...patch };
      this.notify(job.progress);
    };
    try {
      await fs.mkdir(staging, { recursive: true });
      const response = await fetch(model.url, { signal: controller.signal });
      if (!response.ok || !response.body)
        throw Error("模型服务器返回 " + response.status);
      const hash = crypto.createHash("sha256");
      let received = 0,
        last = 0;
      const meter = new Transform({
        transform(chunk, _, done) {
          received += chunk.length;
          if (received > model.size + 1024) {
            done(Error("下载大小超出预期"));
            return;
          }
          hash.update(chunk);
          if (Date.now() - last > 150) {
            last = Date.now();
            emit({ received });
          }
          done(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body),
        meter,
        createWriteStream(archive),
        { signal: controller.signal },
      );
      if (received !== model.size || hash.digest("hex") !== model.sha256)
        throw Error("模型 SHA-256 校验失败，请重新下载");
      emit({ phase: "extracting", received });
      let expanded = 0;
      await pipeline(
        createReadStream(archive),
        unbz2(),
        tar.x({
          cwd: staging,
          strict: true,
          preservePaths: false,
          filter: (name, entry) => {
            const parts = name.replace(/\\/g, "/").split("/");
            if (
              parts[0] !== model.folder ||
              parts.some((p) => p === "..") ||
              path.posix.isAbsolute(name) ||
              !["File", "Directory"].includes(entry.type)
            )
              throw Error("模型压缩包包含不允许的路径或链接");
            expanded += entry.size || 0;
            if (expanded > 1024 * 1024 * 1024)
              throw Error("模型解压大小超出限制");
            return true;
          },
        }),
        { signal: controller.signal },
      );
      const folder = path.join(staging, model.folder);
      for (const file of model.kind === "kokoro"
        ? [
            "model.int8.onnx",
            "tokens.txt",
            "voices.bin",
            "lexicon-zh.txt",
            "espeak-ng-data",
          ]
        : [model.model, "tokens.txt", "espeak-ng-data"])
        await fs.access(path.join(folder, file));
      await fs.writeFile(
        path.join(folder, "installed.json"),
        JSON.stringify({
          id,
          sha256: model.sha256,
          installedAt: new Date().toISOString(),
          license: model.license,
          source: model.source,
        }),
      );
      if (await fs.stat(path.join(this.dir, id)).catch(() => null))
        throw Error("模型已安装");
      await fs.rename(folder, path.join(this.dir, id));
      emit({ phase: "installed" });
    } catch (e) {
      emit({
        phase: controller.signal.aborted ? "cancelled" : "error",
        error: controller.signal.aborted ? undefined : e.message,
      });
      if (!controller.signal.aborted) throw e;
    } finally {
      this.jobs.delete(id);
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  }
  cancel(id) {
    this.jobs.get(id)?.controller.abort();
  }
  async remove(id) {
    if (!MODELS.some((m) => m.id === id)) throw Error("未知模型");
    if (this.jobs.has(id)) throw Error("请先取消下载");
    const result = this.queue.then(async () => {
      await this.stopWorker();
      await fs.rm(path.join(this.dir, id), { recursive: true, force: true });
      this.notify({ id, phase: "removed" });
    });
    this.queue = result.catch(() => {});
    return result;
  }
  async generate({ modelId, voice, text, rate, threads = 2, file }) {
    const model = MODELS.find((m) => m.id === modelId);
    if (!model || !model.voices.some((v) => String(v[0]) === String(voice)))
      throw Error("请选择有效的本地模型和音色");
    await fs
      .access(path.join(this.dir, modelId, "installed.json"))
      .catch(() => {
        throw Error("请先在设置中下载此模型");
      });
    const run = async () => {
      clearTimeout(this.idleTimer);
      if (!this.worker) {
        const worker = (this.worker = new Worker(
          path.join(__dirname, "neural-worker.cjs"),
        ));
        worker.on("message", (v) => {
          const p = this.pending.get(v.id);
          if (p) {
            this.pending.delete(v.id);
            clearTimeout(p.timer);
            v.error ? p.reject(Error(v.error)) : p.resolve(v.result);
          }
        });
        const fail = (e) => {
          for (const [id, p] of this.pending) {
            if (p.worker === worker) {
              clearTimeout(p.timer);
              p.reject(e);
              this.pending.delete(id);
            }
          }
          if (this.worker === worker) this.worker = null;
        };
        worker.on("error", fail);
        worker.on("exit", (code) => fail(Error("本地模型进程退出 " + code)));
      }
      try {
        return await new Promise((resolve, reject) => {
          const id = crypto.randomUUID(),
            timer = setTimeout(() => {
              this.pending.delete(id);
              reject(Error("本地模型合成超时"));
              this.stopWorker();
            }, 120000);
          this.pending.set(id, { resolve, reject, timer, worker: this.worker });
          this.worker.postMessage({
            id,
            model,
            dir: path.join(this.dir, modelId),
            text,
            voice,
            rate,
            threads: Math.max(1, Math.min(4, Math.round(threads))),
            file,
          });
        });
      } finally {
        this.idleTimer = setTimeout(() => this.stopWorker(), 120000);
        this.idleTimer.unref();
      }
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }
  async stopWorker() {
    clearTimeout(this.idleTimer);
    const worker = this.worker;
    this.worker = null;
    await worker?.terminate();
  }
  close() {
    for (const job of this.jobs.values()) job.controller.abort();
    this.stopWorker();
  }
}
module.exports = { Models };
