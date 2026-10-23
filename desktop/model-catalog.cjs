const base =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/";
const MODELS = [
  {
    id: "kokoro-int8",
    name: "Kokoro 82M · 中英多音色",
    description:
      "INT8 神经语音，中文与英文；CPU 推理，无需显卡。首次使用需要加载模型。",
    size: 132303094,
    archive: "kokoro-int8-multi-lang-v1_0.tar.bz2",
    folder: "kokoro-int8-multi-lang-v1_0",
    sha256: "4c3052abaa60943a341f193888cf6abd68787dae6ab8ae5c925a706caa247e4e",
    kind: "kokoro",
    license: "Apache-2.0",
    licenseUrl: "https://huggingface.co/hexgrad/Kokoro-82M/blob/main/LICENSE",
    source:
      "https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html",
    defaultVoice: 48,
    voices: [
      [45, "小贝 · 中文女声", "zh-CN"],
      [46, "小妮 · 中文女声", "zh-CN"],
      [47, "晓晓 · 中文女声", "zh-CN"],
      [48, "小伊 · 中文女声", "zh-CN"],
      [49, "云健 · 中文男声", "zh-CN"],
      [50, "云希 · 中文男声", "zh-CN"],
      [51, "云夏 · 中文男声", "zh-CN"],
      [52, "云扬 · 中文男声", "zh-CN"],
      [3, "Heart · 美音女声", "en-US"],
      [15, "Liam · 美音男声", "en-US"],
      [21, "Emma · 英音女声", "en-GB"],
      [26, "George · 英音男声", "en-GB"],
    ],
  },
  {
    id: "piper-lessac",
    name: "Piper Lessac · 轻量英文",
    description: "单音色英文神经语音，适合优先节省 CPU 的英文阅读。",
    size: 67230653,
    archive: "vits-piper-en_US-lessac-medium.tar.bz2",
    folder: "vits-piper-en_US-lessac-medium",
    sha256: "9e3febfacf0abf4270172d2958bcec246032b7e88efc2720840cc80c93de334e",
    kind: "vits",
    model: "en_US-lessac-medium.onnx",
    license: "见模型卡与数据集许可",
    licenseUrl:
      "https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD",
    source:
      "https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html",
    defaultVoice: 0,
    voices: [[0, "Lessac · 英文", "en-US"]],
  },
].map((m) => ({ ...m, url: base + m.archive }));
module.exports = { MODELS };
