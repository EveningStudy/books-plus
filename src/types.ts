export type ThemeName =
  "original" | "quiet" | "paper" | "bold" | "calm" | "focus";
export type ReadSettings = {
  theme: ThemeName;
  font: string;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing: number;
  spread: boolean;
  scroll: boolean;
  brightness: number;
  alignment: "justify" | "left";
  pageTurn: "curl" | "slide" | "fade" | "none";
  turnDuration: number;
};
export type VoiceSettings = {
  engine: "native" | "edge" | "piper" | "neural";
  modelId: string;
  threads: number;
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
  sleep: number;
  piperPath: string;
  modelPath: string;
  follow: boolean;
};
export type SubtitleSettings = {
  size: number;
  color: string;
  activeColor: string;
  background: number;
  lines: number;
  font: string;
  outline: number;
  align: "center" | "left";
  alwaysOnTop: boolean;
};
export type AppSettings = {
  reading?: ReadSettings;
  voice?: VoiceSettings;
  subtitles?: SubtitleSettings;
  view?: string;
  sort?: string;
  storage?: { retentionDays: number };
  formats?: { calibrePath?: string; textEncoding?: string };
};
export type Mark = {
  id: string;
  cfi?: string;
  page?: number;
  text: string;
  note?: string;
  type: "bookmark" | "highlight";
  imported?: boolean;
  deleted?: boolean;
  updatedAt?: string;
};
export type Reading = {
  cfi?: string;
  page?: number;
  progress: number;
  updatedAt?: string;
  narration?: { spine: number; index: number; href?: string };
  contentRevision?: string;
};
export type BookState = {
  reading?: Reading;
  marks?: Record<string, Mark>;
  preferences?: ReadSettings;
  status?: {
    favorite?: boolean;
    want?: boolean;
    finished?: boolean;
    updatedAt?: string;
  };
};
export type BookItem = {
  id: string;
  title: string;
  author: string;
  file: string;
  format: string;
  valid: boolean;
  exportStatus: string;
  collections: string[];
  appleProgress: number;
  appleCfi?: string;
  lastOpened?: string;
  finished: boolean;
  state: BookState;
  annotations: Mark[];
  contentRevision?: string;
  storage: {
    state: "cloud" | "downloaded" | "local" | "missing" | "unknown";
    supported: boolean;
    synced?: boolean;
    pinned?: boolean;
    offline?: boolean;
    bytes?: number;
    lastReadAt?: string;
  };
  coverKey: string;
};
export type LibraryData = {
  root: string;
  books: BookItem[];
  settings: AppSettings;
  syncError?: string;
  deviceId: string;
  lastLoadedAt: string;
  history: {
    status: string;
    coverage: string;
    days: { date: string; reading_minutes: number }[];
  } | null;
};
export type Voice = {
  id: string;
  name: string;
  lang: string;
  engine: string;
  modelId?: string;
};
export type ModelProgress = {
  id: string;
  phase:
    | "downloading"
    | "extracting"
    | "installed"
    | "cancelled"
    | "removed"
    | "error";
  received?: number;
  total?: number;
  error?: string;
};
export type ModelInfo = {
  id: string;
  name: string;
  description: string;
  size: number;
  installed: boolean;
  license: string;
  source: string;
  licenseUrl: string;
  defaultVoice: number;
  progress?: ModelProgress;
  voices: [number, string, string][];
};
export type Cue = { time: number; start: number; length: number };
export type SpeechResult = {
  url: string;
  cues: Cue[];
  timing: "sentence" | "word";
  pitchSupported: boolean;
};
export type Sentence = {
  text: string;
  cfi?: string;
  href?: string;
  page?: number;
  spine: number;
  index: number;
};
export type OverlayState = {
  text: string;
  next?: string;
  start: number;
  length: number;
  playing: boolean;
  loading?: boolean;
  settings: SubtitleSettings;
  title?: string;
  locked?: boolean;
};
export type SyncResult = { synced: boolean; at?: string; error?: string };
export interface ReaderAPI {
  load(): Promise<LibraryData>;
  choose(): Promise<LibraryData | null>;
  importBooks(): Promise<{
    data: LibraryData;
    imported: string[];
    failed: { name: string; error: string }[];
  } | null>;
  formats(): Promise<{
    builtin: string[];
    calibre: string[];
    converter: string | null;
  }>;
  pickConverter(): Promise<string | null>;
  downloadConverter(): Promise<void>;
  read(id: string): Promise<Uint8Array>;
  closeBook(id: string): Promise<void>;
  offline(id: string, keep: boolean): Promise<void>;
  release(id: string): Promise<void>;
  sweep(): Promise<{ released: number; skipped: number }>;
  models(): Promise<ModelInfo[]>;
  installModel(id: string): Promise<void>;
  cancelModel(id: string): Promise<void>;
  removeModel(id: string): Promise<void>;
  openModelPage(id: string, kind: "source" | "license"): Promise<void>;
  onModelProgress(fn: (progress: ModelProgress) => void): () => void;
  capture(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<string>;
  cover(id: string): Promise<string | null>;
  save(
    id: string,
    patch: {
      reading?: Reading;
      preferences?: ReadSettings;
      status?: BookState["status"];
      mark?: Mark;
    },
  ): Promise<SyncResult>;
  saveSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
  voices(): Promise<{
    voices: Voice[];
    nativeError?: string;
    platform: string;
  }>;
  synthesize(request: VoiceSettings & { text: string }): Promise<SpeechResult>;
  pick(kind: "program" | "model"): Promise<string | null>;
  showOverlay(show: boolean): Promise<boolean>;
  publish(state: OverlayState): Promise<void>;
  overlayState(): Promise<OverlayState>;
  lockOverlay(locked: boolean): Promise<void>;
  control(command: string): Promise<void>;
  fullscreen(): Promise<boolean>;
  finishClose(): Promise<void>;
  onClosing(fn: () => void): () => void;
  onOverlay(fn: (value: OverlayState) => void): () => void;
  onLock(fn: (locked: boolean) => void): () => void;
  onOverlayVisibility(fn: (shown: boolean) => void): () => void;
  onControl(fn: (command: string) => void): () => void;
  onChoose(fn: () => void): () => void;
  onSync(fn: (value: SyncResult) => void): () => void;
}
declare global {
  interface Window {
    reader?: ReaderAPI;
  }
}
