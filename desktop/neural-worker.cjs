const { parentPort } = require("node:worker_threads");
const path = require("node:path");
const sherpa = require("sherpa-onnx-node");
let tts, key;
parentPort.on(
  "message",
  ({ id, model, dir, text, voice, rate, threads, file }) => {
    try {
      const nextKey = dir + ":" + threads;
      if (key !== nextKey) {
        const config = {
          model: { numThreads: threads, debug: false, provider: "cpu" },
          maxNumSentences: 1,
        };
        if (model.kind === "kokoro") {
          config.model.kokoro = {
            model: path.join(dir, "model.int8.onnx"),
            voices: path.join(dir, "voices.bin"),
            tokens: path.join(dir, "tokens.txt"),
            dataDir: path.join(dir, "espeak-ng-data"),
            lexicon: [
              path.join(dir, "lexicon-us-en.txt"),
              path.join(dir, "lexicon-zh.txt"),
            ].join(","),
          };
          config.ruleFsts = ["phone-zh.fst", "date-zh.fst", "number-zh.fst"]
            .map((f) => path.join(dir, f))
            .join(",");
        } else
          config.model.vits = {
            model: path.join(dir, model.model),
            tokens: path.join(dir, "tokens.txt"),
            dataDir: path.join(dir, "espeak-ng-data"),
          };
        tts = new sherpa.OfflineTts(config);
        key = nextKey;
      }
      const started = Date.now();
      const audio = tts.generate({
        text,
        enableExternalBuffer: false,
        generationConfig: new sherpa.GenerationConfig({
          sid: Number(voice),
          speed: rate,
          silenceScale: 0.2,
        }),
      });
      if (
        !audio.samples?.length ||
        !Number.isFinite(audio.sampleRate) ||
        audio.sampleRate <= 0
      )
        throw Error("模型没有生成有效音频，请更换音色或文本语言");
      sherpa.writeWave(file, {
        samples: audio.samples,
        sampleRate: audio.sampleRate,
      });
      parentPort.postMessage({
        id,
        result: {
          cues: [],
          timing: "sentence",
          pitchSupported: false,
          duration: audio.samples.length / audio.sampleRate,
          synthesisMs: Date.now() - started,
        },
      });
    } catch (e) {
      parentPort.postMessage({ id, error: e.message || String(e) });
    }
  },
);
