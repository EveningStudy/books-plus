import type { VoiceSettings } from "../types";

// Apply the preferred engine once per upgrade, then retain deliberate choices.
export function migrateVoicePreferences(
  defaults: VoiceSettings,
  saved?: Partial<VoiceSettings>,
): VoiceSettings {
  const voice = { ...defaults, ...saved };
  if ((saved?.presetVersion ?? 0) < 2) {
    voice.engine = "edge";
    voice.voice =
      saved?.engine === "edge" && saved.voice ? saved.voice : defaults.voice;
    voice.presetVersion = 2;
    if (["kokoro-int8", "piper-lessac"].includes(voice.modelId))
      voice.modelId = defaults.modelId;
  }
  return voice;
}
