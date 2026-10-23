const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  migrateVoicePreferences,
} = require("../src/speech/voicePreferences.ts");
const defaults = {
  engine: "edge",
  voice: "zh-CN-XiaoxiaoNeural",
  modelId: "zipvoice-distill",
  rate: 1,
  volume: 0.8,
  quality: "balanced",
  presetVersion: 2,
};
test("fresh settings and old offline preferences migrate to Edge once", () => {
  assert.deepEqual(migrateVoicePreferences(defaults), defaults);
  for (const engine of ["native", "neural", "piper"]) {
    const voice = migrateVoicePreferences(defaults, {
      engine,
      voice: "48",
      modelId: "kokoro-int8",
      rate: 1.4,
      volume: 0.4,
    });
    assert.equal(voice.engine, "edge");
    assert.equal(voice.voice, defaults.voice);
    assert.equal(voice.modelId, defaults.modelId);
    assert.equal(voice.rate, 1.4);
    assert.equal(voice.volume, 0.4);
    const chosen = {
      ...voice,
      engine: "neural",
      voice: "1",
      modelId: "pocket-en",
    };
    assert.deepEqual(migrateVoicePreferences(defaults, chosen), chosen);
  }
});
test("an existing Edge voice survives the preference upgrade", () => {
  const voice = migrateVoicePreferences(defaults, {
    engine: "edge",
    voice: "en-GB-SoniaNeural",
  });
  assert.equal(voice.voice, "en-GB-SoniaNeural");
  assert.equal(voice.presetVersion, 2);
});
