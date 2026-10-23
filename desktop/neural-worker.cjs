const path = require("node:path");
const sherpa = require("sherpa-onnx-node");
let tts, key;
const references = new Map();
const port = process.parentPort;
const reply = (value) => (port ? port.postMessage(value) : process.send(value));
if (!port) process.on("disconnect", () => process.exit(0));
const onMessage = (handler) =>
  port
    ? port.on("message", ({ data }) => handler(data))
    : process.on("message", handler);
onMessage(({ id, model, dir, text, voice, rate, threads, quality, file }) => {
  try {
    const nextKey = dir + ":" + threads;
    if (key !== nextKey) {
      references.clear();
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
      } else if (model.kind === "zipvoice") {
        config.model.zipvoice = {
          tokens: path.join(dir, "tokens.txt"),
          encoder: path.join(dir, "encoder.int8.onnx"),
          decoder: path.join(dir, "decoder.int8.onnx"),
          vocoder: path.join(dir, "vocos_24khz.onnx"),
          dataDir: path.join(dir, "espeak-ng-data"),
          lexicon: path.join(dir, "lexicon.txt"),
        };
      } else if (model.kind === "pocket") {
        config.model.pocket = {
          lmFlow: path.join(dir, "lm_flow.onnx"),
          lmMain: path.join(dir, "lm_main.onnx"),
          encoder: path.join(dir, "encoder.onnx"),
          decoder: path.join(dir, "decoder.onnx"),
          textConditioner: path.join(dir, "text_conditioner.onnx"),
          vocabJson: path.join(dir, "vocab.json"),
          tokenScoresJson: path.join(dir, "token_scores.json"),
          voiceEmbeddingCacheCapacity: 4,
        };
      } else if (model.kind === "kitten") {
        config.model.kitten = {
          model: path.join(dir, "model.onnx"),
          voices: path.join(dir, "voices.bin"),
          tokens: path.join(dir, "tokens.txt"),
          dataDir: path.join(dir, "espeak-ng-data"),
        };
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
    const playbackSpeed = ["zipvoice", "pocket"].includes(model.kind);
    const generation = {
      sid: Number(voice),
      speed: playbackSpeed ? 1 : rate,
    };
    if (model.qualitySteps)
      generation.numSteps =
        model.qualitySteps[quality] ?? model.qualitySteps.balanced;
    const reference = model.references?.[Number(voice)];
    if (reference) {
      if (!references.has(reference.file))
        references.set(
          reference.file,
          sherpa.readWave(path.join(dir, reference.file), false),
        );
      const wave = references.get(reference.file);
      generation.referenceAudio = wave.samples;
      generation.referenceSampleRate = wave.sampleRate;
      if (reference.text) generation.referenceText = reference.text;
    }
    if (model.kind === "zipvoice")
      generation.extra = { min_char_in_sentence: 10 };
    if (model.kind === "pocket") generation.extra = { seed: 42 };
    if (model.legacy) generation.silenceScale = 0.2;
    const audio = tts.generate({
      text,
      enableExternalBuffer: false,
      generationConfig: new sherpa.GenerationConfig(generation),
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
    reply({
      id,
      result: {
        cues: [],
        timing: "sentence",
        pitchSupported: false,
        // Pocket ignores speed; ZipVoice can exit with some accelerated
        // inputs. Chromium stretches playback while preserving pitch.
        playbackRate: playbackSpeed ? rate : 1,
        duration: audio.samples.length / audio.sampleRate,
        synthesisMs: Date.now() - started,
      },
    });
  } catch (e) {
    reply({ id, error: e.message || String(e) });
  }
});
reply({ ready: true });
