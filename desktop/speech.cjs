const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker } = require("node:worker_threads");
const { json, atomicJson } = require("./library.cjs");
const exec = promisify(execFile);
class NativeWorker {
  constructor(script) {
    this.script = script;
    this.pending = new Map();
  }
  start() {
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
      stderr = "";
    child.stderr.on("data", (data) => {
      stderr = (stderr + data).slice(-2000);
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data) => {
      buffer += data;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          const value = JSON.parse(line);
          const item = this.pending.get(value.id);
          if (item) {
            clearTimeout(item.timer);
            this.pending.delete(value.id);
            value.error
              ? item.reject(Error(value.error))
              : item.resolve(value.result);
          }
        } catch {}
      }
    });
    const fail = (error) => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(error);
      }
      this.pending.clear();
      if (this.child === child) this.child = null;
    };
    child.on("error", fail);
    child.on("exit", () => fail(Error(`系统语音服务退出 ${stderr}`)));
  }
  request(payload) {
    if (!this.child) this.start();
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("系统语音合成超时"));
        this.child?.kill();
      }, 60000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ ...payload, id }) + "\n");
    });
  }
  stop() {
    this.child?.kill();
  }
}
const EDGE_VOICES = [
  ["zh-CN-XiaoxiaoNeural", "晓晓 · 中文女声", "zh-CN"],
  ["zh-CN-YunxiNeural", "云希 · 中文男声", "zh-CN"],
  ["zh-CN-YunjianNeural", "云健 · 中文男声", "zh-CN"],
  ["zh-CN-XiaoyiNeural", "晓伊 · 中文女声", "zh-CN"],
  ["zh-TW-HsiaoChenNeural", "曉臻 · 台湾女声", "zh-TW"],
  ["zh-HK-HiuMaanNeural", "曉曼 · 粤语女声", "zh-HK"],
  ["en-GB-SoniaNeural", "Sonia · 英音女声", "en-GB"],
  ["en-US-AriaNeural", "Aria · 美音女声", "en-US"],
  ["en-US-GuyNeural", "Guy · 美音男声", "en-US"],
  ["ja-JP-NanamiNeural", "七海 · 日语女声", "ja-JP"],
].map(([id, name, lang]) => ({ id, name, lang, engine: "edge" }));
class Speech {
  constructor(cacheDir, script, models) {
    this.cacheDir = cacheDir;
    this.worker = new NativeWorker(script);
    this.pending = new Map();
    this.models = models;
  }
  async voices() {
    let native = [],
      error = null;
    try {
      if (process.platform === "win32")
        native = await this.worker.request({ command: "voices" });
      else if (process.platform === "darwin") {
        const { stdout } = await exec("/usr/bin/say", ["-v", "?"]);
        native = stdout
          .split("\n")
          .map((line) => line.match(/^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#/))
          .filter(Boolean)
          .map((m) => ({
            id: m[1].trim(),
            name: m[1].trim(),
            lang: m[2].replace("_", "-"),
            engine: "native",
          }));
      } else error = "此平台请使用 Edge 或 Piper 朗读";
    } catch (e) {
      error = e.message;
    }
    return {
      voices: [
        ...EDGE_VOICES,
        ...native,
        ...(this.models
          ? (await this.models.list())
              .filter((m) => m.installed)
              .flatMap((m) =>
                m.voices.map(([id, name, lang]) => ({
                  id: String(id),
                  name,
                  lang,
                  engine: "neural",
                  modelId: m.id,
                })),
              )
          : []),
      ],
      nativeError: error,
      platform: process.platform,
    };
  }
  async generate(request) {
    const {
      text,
      engine,
      voice,
      rate = 1,
      pitch = 0,
      piperPath,
      modelPath,
      modelId,
      threads,
      quality = "balanced",
    } = request;
    if (typeof text !== "string" || !text.trim() || text.length > 1800)
      throw Error("朗读文本为空或超过长度限制");
    if (
      !["native", "edge", "piper", "neural"].includes(engine) ||
      !Number.isFinite(rate) ||
      rate < 0.5 ||
      rate > 3 ||
      !Number.isFinite(pitch) ||
      Math.abs(pitch) > 50
    )
      throw Error("无效的语音参数");
    const hash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          text,
          engine,
          voice,
          rate,
          pitch,
          piperPath,
          modelPath,
          modelId,
          threads,
          quality,
          v: 4,
        }),
      )
      .digest("hex");
    if (this.pending.has(hash)) return this.pending.get(hash);
    const work = this.render(hash, {
      ...request,
      rate,
      pitch,
      quality,
    }).finally(() => this.pending.delete(hash));
    this.pending.set(hash, work);
    return work;
  }
  async render(
    hash,
    {
      text,
      engine,
      voice,
      rate,
      pitch,
      piperPath,
      modelPath,
      modelId,
      threads,
      quality,
    },
  ) {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const file = path.join(
      this.cacheDir,
      hash + (engine === "edge" ? ".mp3" : ".wav"),
    );
    const metadata = file + ".meta.json";
    const cached = await json(metadata, null);
    if (cached && (await fs.stat(file).catch(() => null))?.size > 44)
      return { ...cached, file };
    let result = { cues: [], timing: "sentence", pitchSupported: false };
    if (engine === "edge") {
      const selected = EDGE_VOICES.find((v) => v.id === voice);
      if (!selected) throw Error("请选择有效的 Edge 音色");
      const config = {
        voice,
        lang: selected.lang,
        rate: `${rate >= 1 ? "+" : ""}${Math.round((rate - 1) * 100)}%`,
        pitch: `${pitch >= 0 ? "+" : ""}${pitch}Hz`,
        saveSubtitles: true,
        timeout: 25000,
      };
      await new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, "edge-worker.cjs"), {
          workerData: { config, text, file },
        });
        const timer = setTimeout(() => {
          worker.terminate();
          reject(Error("Edge 连接或合成超时，请检查网络或切换系统离线语音"));
        }, 30000);
        worker.once("message", (value) => {
          clearTimeout(timer);
          worker.terminate();
          value.error ? reject(Error(value.error)) : resolve();
        });
        worker.once("error", (error) => {
          clearTimeout(timer);
          worker.terminate();
          reject(error);
        });
        worker.once("exit", (code) => {
          clearTimeout(timer);
          if (code !== 0) reject(Error("Edge 语音服务已停止"));
        });
      });
      const subtitles = await json(file + ".json", []);
      let cursor = 0;
      result = {
        cues: subtitles.map((cue) => {
          const start = text.indexOf(cue.part.trim(), cursor);
          const offset = start < 0 ? cursor : start;
          cursor = offset + cue.part.trim().length;
          return {
            time: cue.start / 1000,
            start: offset,
            length: cue.part.trim().length,
          };
        }),
        timing: "word",
        pitchSupported: true,
      };
    } else if (engine === "neural") {
      if (!this.models) throw Error("本地模型服务未启动");
      result = await this.models.generate({
        modelId,
        voice,
        text,
        rate,
        threads,
        quality,
        file,
      });
    } else if (engine === "native" && process.platform === "win32") {
      result = await this.worker.request({
        command: "synthesize",
        text,
        voice,
        rate,
        pitch,
        file,
      });
    } else if (engine === "native" && process.platform === "darwin") {
      await exec(
        "/usr/bin/say",
        [
          ...(voice ? ["-v", voice] : []),
          "-r",
          String(Math.round(180 * rate)),
          "-o",
          file,
          "--file-format=WAVE",
          "--data-format=LEI16@22050",
          text,
        ],
        { timeout: 60000 },
      );
    } else if (engine === "piper") {
      if (
        !path.isAbsolute(piperPath || "") ||
        !path.isAbsolute(modelPath || "") ||
        !modelPath.endsWith(".onnx")
      )
        throw Error("请在设置中选择 Piper 程序和 ONNX 音色模型");
      await new Promise((resolve, reject) => {
        const child = spawn(
          piperPath,
          [
            "--model",
            modelPath,
            "--output_file",
            file,
            "--length_scale",
            String(1 / rate),
          ],
          { windowsHide: true },
        );
        let error = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(Error("Piper 合成超时"));
        }, 60000);
        child.stderr.on("data", (data) => {
          error = (error + data).slice(-1500);
        });
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.on("exit", (code) => {
          clearTimeout(timer);
          code === 0
            ? resolve()
            : reject(Error(error || `Piper 退出代码 ${code}`));
        });
        child.stdin.end(text + "\n");
      });
    } else throw Error("当前系统不支持该离线语音引擎");
    if ((await fs.stat(file)).size <= 44)
      throw Error("语音服务没有返回有效音频");
    await atomicJson(metadata, result);
    return { ...result, file };
  }
  async prune() {
    const names = await fs.readdir(this.cacheDir).catch(() => []);
    const files = await Promise.all(
      names.map(async (name) => ({
        name,
        ...(await fs.stat(path.join(this.cacheDir, name))),
      })),
    );
    let size = files.reduce((sum, f) => sum + f.size, 0);
    for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
      if (size < 256 * 1024 * 1024) break;
      if (Date.now() - file.mtimeMs > 3600000) {
        await fs.rm(path.join(this.cacheDir, file.name), { force: true });
        size -= file.size;
      }
    }
  }
  close() {
    this.worker.stop();
    this.models?.close();
  }
}
module.exports = { Speech };
