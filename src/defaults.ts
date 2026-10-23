import type {
  ReadSettings,
  VoiceSettings,
  SubtitleSettings,
  ThemeName,
} from "./types";
export const readingDefaults: ReadSettings = {
  theme: "original",
  font: "serif",
  size: 21,
  lineHeight: 1.8,
  letterSpacing: 0,
  paragraphSpacing: 0.8,
  spread: true,
  scroll: false,
  brightness: 1,
  alignment: "justify",
  pageTurn: "curl",
  turnDuration: 550,
};
export const voiceDefaults: VoiceSettings = {
  engine: "edge",
  voice: "zh-CN-XiaoxiaoNeural",
  rate: 1,
  pitch: 0,
  volume: 0.8,
  sleep: 0,
  piperPath: "",
  modelPath: "",
  follow: true,
  modelId: "zipvoice-distill",
  threads: 2,
  quality: "balanced",
  presetVersion: 2,
};
export const subtitleDefaults: SubtitleSettings = {
  size: 30,
  color: "#ffffff",
  activeColor: "#ffaf50",
  background: 0.12,
  lines: 2,
  font: "sans-serif",
  outline: 2,
  align: "center",
  alwaysOnTop: true,
};
export const themes: Record<
  ThemeName,
  { name: string; bg: string; fg: string; font?: string }
> = {
  original: { name: "原始", bg: "#ffffff", fg: "#292723" },
  quiet: { name: "安静", bg: "#faf6ee", fg: "#403a32" },
  paper: { name: "纸张", bg: "#f3e8d0", fg: "#493d2a" },
  bold: { name: "粗体", bg: "#fffdf6", fg: "#171717" },
  calm: { name: "平静", bg: "#e0e1df", fg: "#303333" },
  focus: { name: "专注", bg: "#171818", fg: "#d9d7d3" },
};
export const fontFamilies: Record<string, string> = {
  serif: '"Noto Serif CJK SC", "Songti SC", "SimSun", Georgia, serif',
  sans: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  georgia: 'Georgia, "Songti SC", "SimSun", serif',
  kai: '"Kaiti SC", "KaiTi", serif',
};
