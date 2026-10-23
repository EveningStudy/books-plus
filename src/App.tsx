import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  FolderOpen,
  LoaderCircle,
  X,
  AlertCircle,
} from "lucide-react";
import type {
  AppSettings,
  BookItem,
  BookState,
  LibraryData,
  Mark,
  Reading,
  ReadSettings,
  SyncResult,
  Voice,
} from "./types";
import { readingDefaults, subtitleDefaults, voiceDefaults } from "./defaults";
import { Library } from "./components/Library";
import { Settings } from "./components/Settings";
import { migrateVoicePreferences } from "./speech/voicePreferences";
import { IconButton } from "./components/Primitives";
import { MacSync } from "./components/MacSync";
const Reader = lazy(() =>
  import("./components/Reader").then((module) => ({ default: module.Reader })),
);
export default function App() {
  const [data, setData] = useState<LibraryData | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    reading: readingDefaults,
    voice: voiceDefaults,
    subtitles: subtitleDefaults,
  });
  const [active, setActive] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [message, setMessage] = useState("");
  const [sync, setSync] = useState("正在读取书库…");
  const [busy, setBusy] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const preview = useRef<HTMLAudioElement | null>(null);
  const previewGeneration = useRef(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  const libraryRoot = useRef("");
  useEffect(() => {
    if (settings.mac?.mode === "sync") setActive(null);
  }, [settings.mac?.mode]);
  const syncStatus = useRef<{ root: string; text: string } | null>(null);
  const showError = useCallback((error: unknown) => {
    setMessage(error instanceof Error ? error.message : String(error));
  }, []);
  const reportSync = useCallback((result: SyncResult) => {
    const text = result.synced
      ? "进度已写入云盘文件夹"
      : result.error || "进度已在本机保存 · 等待同步";
    syncStatus.current = { root: libraryRoot.current, text };
    setSync(text);
  }, []);
  const applyData = useCallback((value: LibraryData) => {
    libraryRoot.current = value.root;
    setData(value);
    setSync(
      value.syncError ||
        (syncStatus.current?.root === value.root && syncStatus.current.text) ||
        `已读取 ${value.books.length} 本图书`,
    );
  }, []);
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (!window.reader || refreshing.current) return;
    refreshing.current = true;
    if (!activeRef.current) setBusy(true);
    try {
      applyData(await window.reader.load());
    } catch (e) {
      setMessage(`无法读取书库：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      refreshing.current = false;
      setBusy(false);
    }
  }, [applyData]);
  const choose = useCallback(async () => {
    try {
      const value = await window.reader?.choose();
      if (value) {
        applyData(value);
        setActive(null);
        setMessage("");
      }
    } catch (e) {
      setMessage(`无法连接书库：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [applyData]);
  useEffect(() => {
    const whenFocused = () => {
      refresh();
    };
    window.addEventListener("focus", whenFocused);
    const timer = setInterval(() => {
      refresh();
    }, 5000);
    return () => {
      window.removeEventListener("focus", whenFocused);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (!window.reader) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    window.reader
      .macStatus()
      .then((status) => {
        if (!cancelled && status.platform === "darwin")
          setSettings((previous) => ({ ...previous, mac: status.settings }));
      })
      .catch(() => {});
    Promise.allSettled([window.reader.load(), window.reader.voices()]).then(
      ([library, voicesResult]) => {
        if (cancelled) return;
        let loaded: AppSettings = {};
        if (library.status === "fulfilled") {
          applyData(library.value);
          loaded = library.value.settings;
        } else
          setMessage(
            `书库尚未连接：${library.reason?.message || library.reason}`,
          );
        const found =
          voicesResult.status === "fulfilled" ? voicesResult.value.voices : [];
        setVoices(found);
        const voice = migrateVoicePreferences(voiceDefaults, loaded.voice);
        setSettings({
          ...loaded,
          reading: { ...readingDefaults, ...loaded.reading },
          voice,
          subtitles: { ...subtitleDefaults, ...loaded.subtitles },
        });
        if (
          library.status === "fulfilled" &&
          (loaded.voice?.presetVersion ?? 0) < 2
        )
          window.reader?.saveSettings({ voice }).catch(showError);
        setBusy(false);
      },
    );
    const offChoose = window.reader.onChoose(choose);
    const offSettings = window.reader.onSettings(setSettingsTab);
    const offMac = window.reader.onMacStatus((status) => {
      setSettings((previous) => ({ ...previous, mac: status.settings }));
    });
    const offModels = window.reader.onModelProgress((p) => {
      if (p.phase === "installed" || p.phase === "removed")
        window.reader
          ?.voices()
          .then((v) => setVoices(v.voices))
          .catch(() => {});
    });
    const offSync = window.reader.onSync(reportSync);
    const offClosing = window.reader.onClosing(() => {
      if (!activeRef.current) window.reader?.finishClose();
    });
    return () => {
      cancelled = true;
      offChoose();
      offSettings();
      offMac();
      offModels();
      offSync();
      offClosing();
      preview.current?.pause();
    };
  }, [applyData, choose, reportSync]);
  const changeSettings = useCallback((patch: Partial<AppSettings>) => {
    const value = { ...settingsRef.current, ...patch };
    settingsRef.current = value;
    setSettings(value);
    if (patch.mac) return; // Mode was persisted by the dedicated Mac settings API.
    window.reader
      ?.saveSettings(patch)
      .catch((e) => setMessage(`设置未能保存：${e.message}`));
  }, []);
  const saveBook = useCallback(
    async (
      id: string,
      patch: {
        reading?: Reading;
        mark?: Mark;
        status?: BookState["status"];
        preferences?: ReadSettings;
      },
    ) => {
      setData((previous) =>
        previous
          ? {
              ...previous,
              books: previous.books.map((book) => {
                if (book.id !== id) return book;
                const state = {
                  ...book.state,
                  ...(patch.reading ? { reading: patch.reading } : {}),
                  ...(patch.preferences
                    ? { preferences: patch.preferences }
                    : {}),
                  ...(patch.status
                    ? { status: { ...book.state.status, ...patch.status } }
                    : {}),
                  ...(patch.mark
                    ? {
                        marks: {
                          ...book.state.marks,
                          [patch.mark.id]: patch.mark,
                        },
                      }
                    : {}),
                };
                return {
                  ...book,
                  state,
                  finished: patch.status?.finished ?? book.finished,
                  lastOpened: patch.reading
                    ? new Date().toISOString()
                    : book.lastOpened,
                };
              }),
            }
          : null,
      );
      const result = await window.reader!.save(id, patch);
      reportSync(result);
    },
    [reportSync],
  );
  const onStatus = useCallback(
    (id: string, status: BookState["status"]) => {
      saveBook(id, { status }).catch((e) => setMessage(e.message));
    },
    [saveBook],
  );
  const openBook = useCallback(
    async (book: BookItem) => {
      if (!book.valid || !window.reader) return;
      try {
        const fresh = await window.reader.load();
        applyData(fresh);
        if (!fresh.books.some((b) => b.id === book.id && b.valid))
          throw Error("书目已改变，请刷新书库");
        setActive(book.id);
        setMessage("");
      } catch (e) {
        showError(e);
      }
    },
    [applyData, showError],
  );
  const importBooks = useCallback(async () => {
    try {
      const result = await window.reader?.importBooks();
      if (result) {
        applyData(result.data);
        setMessage(
          `已加入 ${result.imported.length} 本图书` +
            (result.failed.length
              ? "；" +
                result.failed.map((f) => `${f.name}：${f.error}`).join("；")
              : ""),
        );
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  }, [applyData, showError]);
  const openSettings = useCallback((tab: string) => setSettingsTab(tab), []);
  const closeSettings = useCallback(() => setSettingsTab(null), []);
  const closeBook = useCallback(() => {
    if (activeRef.current)
      window.reader?.closeBook(activeRef.current).catch(() => {});
    setActive(null);
    refresh();
  }, [refresh]);
  const changeStorage = useCallback(
    async (id: string, action: "offline" | "release") => {
      if (!window.reader) return;
      const book = data?.books.find((b) => b.id === id);
      try {
        setMessage(
          action === "release" ? "正在释放本地空间…" : "正在更新离线下载…",
        );
        if (action === "release") await window.reader.release(id);
        else await window.reader.offline(id, !book?.storage.offline);
        await refresh();
        setMessage(
          action === "release"
            ? "已释放本地正文，书籍与进度仍在云端"
            : "离线设置已更新",
        );
      } catch (e) {
        showError(e instanceof Error ? e.message : String(e));
      }
    },
    [data, refresh, showError],
  );
  const previewVoice = async () => {
    if (previewing) {
      previewGeneration.current++;
      preview.current?.pause();
      setPreviewing(false);
      return;
    }
    const token = ++previewGeneration.current;
    setPreviewing(true);
    try {
      preview.current?.pause();
      const voice = { ...voiceDefaults, ...settingsRef.current.voice };
      const language =
        voices.find(
          (v) =>
            v.id === voice.voice &&
            v.engine === voice.engine &&
            (v.engine !== "neural" || v.modelId === voice.modelId),
        )?.lang || "zh-CN";
      const result = await window.reader!.synthesize({
        ...voice,
        text: language.startsWith("en")
          ? "Open a book, and let the story come to you."
          : language.startsWith("ja")
            ? "本を開いて、物語に耳を傾けましょう。"
            : "打开一本书，让故事慢慢读给你听。",
      });
      if (token !== previewGeneration.current) return;
      const player = (preview.current = new Audio(result.url));
      player.preservesPitch = true;
      player.playbackRate = result.playbackRate ?? 1;
      player.volume = voice.volume;
      player.onended = () => setPreviewing(false);
      player.onerror = () => {
        setPreviewing(false);
        setMessage("试听音频无法播放");
      };
      await player.play();
    } catch (e) {
      if (token !== previewGeneration.current) return;
      setMessage(`试听失败：${e instanceof Error ? e.message : String(e)}`);
      setPreviewing(false);
    }
  };
  const activeBook = data?.books.find((b) => b.id === active);
  return (
    <>
      {settings.mac?.mode === "sync" ? (
        <main className="sync-dashboard">
          <h1>Books+ · Apple Books 同步</h1>
          <p>关闭此窗口后继续在菜单栏同步。</p>
          <div className="connection">
            <span>{data?.root || "尚未连接书库"}</span>
            <button onClick={choose}>更改云盘书库…</button>
          </div>
          <MacSync
            onError={showError}
            onMode={(mac) => changeSettings({ mac })}
          />
        </main>
      ) : activeBook ? (
        <Suspense
          fallback={
            <main className="welcome-screen">
              <LoaderCircle className="spin" />
              <p>正在打开阅读器…</p>
            </main>
          }
        >
          <Reader
            key={activeBook.id}
            book={activeBook}
            deviceId={data!.deviceId}
            settings={settings}
            voices={voices}
            onClose={closeBook}
            onSave={saveBook}
            onSettings={openSettings}
            onChange={changeSettings}
            onError={showError}
          />
        </Suspense>
      ) : data ? (
        <Library
          key={data.root}
          data={data}
          sync={sync}
          busy={busy}
          onOpen={openBook}
          onRefresh={refresh}
          onChoose={choose}
          onImport={importBooks}
          onSettings={() => setSettingsTab("library")}
          onStatus={onStatus}
          onStorage={changeStorage}
        />
      ) : (
        <main className="welcome-screen">
          <div className="welcome-icon">
            <BookOpen size={48} />
          </div>
          <h1>Books+ · 接着读。</h1>
          <p>
            连接云端书库，
            <br />在 Mac 和 Windows 接着读，也可以听。
          </p>
          {busy ? (
            <LoaderCircle className="spin" size={28} />
          ) : (
            <button
              className="primary"
              onClick={choose}
              disabled={!window.reader}
            >
              <FolderOpen size={17} />
              选择云端书库文件夹
            </button>
          )}
          {!window.reader ? (
            <p className="help">
              这是桌面应用。请运行 npm run dev，或打开打包后的 Books+。
            </p>
          ) : null}
          <small>多格式阅读 · 云端进度 · 神经语音 · 桌面字幕</small>
        </main>
      )}
      {settingsTab ? (
        <Settings
          initialTab={settingsTab}
          settings={settings}
          root={data?.root || ""}
          voices={voices}
          onChange={changeSettings}
          onChoose={choose}
          onClose={closeSettings}
          onPreview={previewVoice}
          onShowOverlay={() => window.reader?.showOverlay(true)}
          onError={showError}
        />
      ) : null}
      {message ? (
        <div className="toast" role="status">
          <AlertCircle size={18} />
          <p>{message}</p>
          <IconButton label="关闭提示" onClick={() => setMessage("")}>
            <X size={16} />
          </IconButton>
        </div>
      ) : null}
      {previewing ? (
        <div className="preview-status" role="status">
          <LoaderCircle size={14} className="spin" />
          正在试听声音
          <button
            onClick={() => {
              preview.current?.pause();
              previewGeneration.current++;
              setPreviewing(false);
            }}
          >
            停止
          </button>
        </div>
      ) : null}
    </>
  );
}
