import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  List,
  Search,
  Bookmark,
  Headphones,
  Settings2,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  LoaderCircle,
  Captions,
  Maximize2,
  X,
  Highlighter,
  Trash2,
  Check,
  BookOpen,
} from "lucide-react";
import type {
  AppSettings,
  BookItem,
  BookState,
  Mark,
  Reading,
  ReadSettings,
  Sentence,
  SubtitleSettings,
  Voice,
} from "../types";
import type { ReaderHandle, SearchHit, Toc } from "../reader/engine";
import {
  readingDefaults,
  subtitleDefaults,
  themes,
  voiceDefaults,
} from "../defaults";
import { EpubView } from "../reader/EpubView";
import { useNarration } from "../speech/useNarration";
import { IconButton, Switch } from "./Primitives";
import { Themes } from "./Themes";
import { usePageTurn } from "../reader/usePageTurn";
const PdfView = lazy(() =>
  import("../reader/PdfView").then((module) => ({ default: module.PdfView })),
);

export function Reader({
  book,
  deviceId,
  settings,
  voices,
  onClose,
  onSave,
  onSettings,
  onChange,
  onError,
}: {
  book: BookItem;
  deviceId: string;
  settings: AppSettings;
  voices: Voice[];
  onClose: () => void;
  onSave: (
    id: string,
    patch: {
      reading?: Reading;
      preferences?: ReadSettings;
      mark?: Mark;
      status?: BookState["status"];
    },
  ) => Promise<void>;
  onSettings: (tab: string) => void;
  onChange: (patch: Partial<AppSettings>) => void;
  onError: (message: string) => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const [drawer, setDrawer] = useState<"contents" | "marks" | "search" | null>(
    null,
  );
  const [toc, setToc] = useState<Toc[]>([]);
  const [location, setLocation] = useState<Reading & { label?: string }>(
    book.state.reading || { progress: book.appleProgress },
  );
  const [reading, setReading] = useState<ReadSettings>(() => ({
    ...readingDefaults,
    ...settings.reading,
    ...book.state.preferences,
  }));
  const [selection, setSelection] = useState<{
    cfi: string;
    text: string;
  } | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [note, setNote] = useState("");
  const engine = useRef<ReaderHandle>(null);
  const locationRef = useRef(location);
  locationRef.current = location;
  const savedNarration = useRef(book.state.reading?.narration);
  const initial = useRef(
    book.state.reading || { progress: book.appleProgress },
  );
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReading = useRef<Reading | null>(null);
  const localAt = useRef(Date.parse(book.state.reading?.updatedAt || "") || 0);
  const [remoteReading, setRemoteReading] = useState<Reading | null>(null);
  const [viewGeneration, setViewGeneration] = useState(0);
  useEffect(() => {
    const incoming = book.state.reading;
    if (
      !incoming?.updatedAt ||
      incoming.originDeviceId === deviceId ||
      Date.parse(incoming.updatedAt) <= localAt.current
    )
      return;
    if (
      incoming.contentRevision &&
      incoming.contentRevision !== book.contentRevision
    )
      return;
    setRemoteReading(incoming);
  }, [book.state.reading, book.contentRevision, deviceId]);
  const latestSave = useRef(onSave);
  latestSave.current = onSave;
  const marks = useMemo(
    () => [
      ...book.annotations,
      ...Object.values(book.state.marks || {}).filter((m) => !m.deleted),
    ],
    [book.annotations, book.state.marks],
  );
  const voice = useMemo(
    () => ({ ...voiceDefaults, ...settings.voice }),
    [settings.voice],
  );
  const subtitle = useMemo(
    () => ({ ...subtitleDefaults, ...settings.subtitles }),
    [settings.subtitles],
  );
  const handleLocation = useCallback(
    (value: Reading & { label?: string }, userInitiated = false) => {
      const next = { ...value, narration: savedNarration.current };
      locationRef.current = next;
      setLocation(next);
      if (!userInitiated) return; // Restore, indexing and layout changes are not reading activity.
      localAt.current = Date.now();
      setRemoteReading(null);
      pendingReading.current = next;
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        pending.current = null;
        const reading = pendingReading.current;
        pendingReading.current = null;
        if (reading) latestSave.current(book.id, { reading }).catch(onError);
      }, 450);
    },
    [book.id],
  );
  const onSentence = (s: Sentence) => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    pendingReading.current = null;
    savedNarration.current = { spine: s.spine, index: s.index, href: s.href };
    const next = {
      ...locationRef.current,
      ...(s.cfi ? { cfi: s.cfi } : {}),
      narration: savedNarration.current,
    };
    localAt.current = Date.now();
    setRemoteReading(null);
    locationRef.current = next;
    setLocation(next);
    latestSave.current(book.id, { reading: next }).catch(onError);
  };
  const narration = useNarration({
    engine: () => engine.current,
    settings: voice,
    title: book.title,
    onSentence,
    onError,
  });
  const narrationRef = useRef(narration);
  narrationRef.current = narration;
  const movePage = useCallback(async (direction: number) => {
    narrationRef.current.stop();
    savedNarration.current = undefined;
    if (direction > 0) await engine.current?.next();
    else await engine.current?.previous();
  }, []);
  const pageTurn = usePageTurn(
    { ...reading, spread: book.format === "epub" && reading.spread },
    movePage,
  );
  const turnRef = useRef(pageTurn);
  turnRef.current = pageTurn;
  const turnPage = useCallback(
    (direction: number) => {
      turnRef.current.turn(direction).catch((error) => onError(String(error)));
    },
    [onError],
  );
  useEffect(() => {
    let cancelled = false;
    window.reader
      ?.read(book.id)
      .then((value) => {
        if (!cancelled) setBytes(value);
      })
      .catch((e) => {
        if (!cancelled) setFatal(e.message);
      });
    return () => {
      cancelled = true;
      window.reader?.closeBook(book.id).catch(() => {});
      if (pending.current) {
        clearTimeout(pending.current);
        latestSave
          .current(book.id, {
            reading: pendingReading.current || locationRef.current,
          })
          .catch(() => {});
      }
      window.reader?.publish({
        text: "",
        playing: false,
        start: 0,
        length: 0,
        settings: subtitle,
      });
    };
  }, [book.id]);
  useEffect(() => {
    const off = window.reader?.onOverlayVisibility(setOverlay);
    const offClosing = window.reader?.onClosing(() => {
      if (pending.current) {
        clearTimeout(pending.current);
        pending.current = null;
      }
      const reading = pendingReading.current;
      pendingReading.current = null;
      if (reading)
        latestSave
          .current(book.id, { reading })
          .finally(() => window.reader?.finishClose());
      else window.reader?.finishClose();
    });
    const offControl = window.reader?.onControl((command) => {
      if (command === "toggle") narrationRef.current.toggle();
      else if (command === "next") narrationRef.current.skip(1);
      else if (command === "previous") narrationRef.current.skip(-1);
      else if (command === "settings") onSettings("subtitles");
    });
    return () => {
      off?.();
      offControl?.();
      offClosing?.();
    };
  }, [onSettings]);
  useEffect(() => {
    window.reader?.publish({
      text: narration.sentence?.text || "",
      start: narration.cue?.start || 0,
      length: narration.cue?.length || 0,
      playing: narration.playing,
      loading: narration.loading,
      settings: subtitle,
      title: book.title,
    });
  }, [
    narration.sentence,
    narration.cue,
    narration.playing,
    narration.loading,
    subtitle,
    book.title,
  ]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          'input,select,textarea,button,[role="dialog"]',
        )
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        narrationRef.current.toggle();
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        turnPage(1);
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        turnPage(-1);
      }
      if (e.key === "Escape") {
        if (themeOpen) setThemeOpen(false);
        else if (drawer) setDrawer(null);
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [themeOpen, drawer, onClose, turnPage]);
  useEffect(() => {
    if (!query.trim() || drawer !== "search") {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await engine.current?.search(
          query.trim(),
          () => cancelled,
        );
        if (!cancelled) setHits(result || []);
      } catch (e) {
        if (!cancelled) onError(String(e));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, drawer]);
  const changeReading = (value: ReadSettings) => {
    setReading(value);
    onChange({ reading: value });
    latestSave.current(book.id, { preferences: value }).catch(onError);
  };
  const navigate = async (target: {
    cfi?: string;
    href?: string;
    page?: number;
  }) => {
    await pageTurn.cancel();
    narration.stop();
    savedNarration.current = undefined;
    try {
      await engine.current?.navigate(target);
    } catch (e) {
      onError(`此位置无法定位：${String(e)}`);
    }
  };
  const seek = async (progress: number) => {
    await pageTurn.cancel();
    narration.stop();
    savedNarration.current = undefined;
    await engine.current?.seek(progress);
  };
  const addBookmark = () => {
    const cfi = locationRef.current.cfi;
    const page = locationRef.current.page;
    latestSave
      .current(book.id, {
        mark: {
          id: crypto.randomUUID(),
          cfi,
          page,
          text:
            toc.find((t) => narration.sentence?.href === t.href)?.label ||
            (page
              ? `第 ${page} 页`
              : `${Math.round(location.progress * 100)}% 的位置`),
          type: "bookmark",
        },
      })
      .catch(onError);
  };
  const saveHighlight = () => {
    if (!selection) return;
    latestSave
      .current(book.id, {
        mark: {
          ...selection,
          id: crypto.randomUUID(),
          type: "highlight",
          note,
        },
      })
      .catch(onError);
    setSelection(null);
    setNote("");
  };
  const resumeNarration = async () => {
    if (!narration.sentence && savedNarration.current) {
      try {
        const saved = savedNarration.current;
        const values = await engine.current?.sentences(saved.spine);
        const target = values?.[saved.index];
        if (target) {
          await narration.start(target);
          return;
        }
      } catch {}
    }
    await narration.toggle();
  };
  const currentTheme = themes[reading.theme];
  return (
    <div
      className={
        "reader-layout" + (reading.theme === "focus" ? " dark-reader" : "")
      }
      style={
        {
          "--page-background": currentTheme.bg,
          "--page-text": currentTheme.fg,
        } as React.CSSProperties
      }
    >
      <header className="reader-toolbar">
        <button
          className="back-button"
          onClick={() => {
            narration.stop();
            onClose();
          }}
        >
          <ArrowLeft size={18} />
          <span>图书</span>
        </button>
        <IconButton
          label="目录与批注"
          active={!!drawer}
          onClick={() => {
            setDrawer(drawer ? null : "contents");
            setThemeOpen(false);
          }}
        >
          <List />
        </IconButton>
        <div className="reader-title" title={book.title}>
          {book.title}
        </div>
        <IconButton
          label="搜索书中内容"
          active={drawer === "search"}
          onClick={() => {
            setDrawer(drawer === "search" ? null : "search");
            setThemeOpen(false);
          }}
        >
          <Search />
        </IconButton>
        <IconButton
          label="主题与设置"
          active={themeOpen}
          onClick={() => {
            setThemeOpen(!themeOpen);
            setDrawer(null);
          }}
        >
          <span className="aa">Aa</span>
        </IconButton>
        <IconButton label="添加书签" onClick={addBookmark} disabled={!ready}>
          <Bookmark />
        </IconButton>
        <IconButton label="朗读设置" onClick={() => onSettings("voice")}>
          <Headphones />
        </IconButton>
        <IconButton
          label="全屏阅读"
          onClick={() => window.reader?.fullscreen()}
        >
          <Maximize2 size={17} />
        </IconButton>
      </header>
      {remoteReading ? (
        <div className="remote-reading" role="status">
          <span>
            其他设备有更新的阅读位置（{Math.round(remoteReading.progress * 100)}
            %）
          </span>
          <button
            onClick={async () => {
              narration.stop();
              await pageTurn.cancel();
              if (pending.current) clearTimeout(pending.current);
              pending.current = null;
              pendingReading.current = null;
              initial.current = remoteReading;
              savedNarration.current = remoteReading.narration;
              localAt.current =
                Date.parse(remoteReading.updatedAt || "") || Date.now();
              setLocation(remoteReading);
              locationRef.current = remoteReading;
              setRemoteReading(null);
              setReady(false);
              setViewGeneration((n) => n + 1);
            }}
          >
            接着读
          </button>
          <button
            onClick={() => {
              localAt.current =
                Date.parse(remoteReading.updatedAt || "") || Date.now();
              setRemoteReading(null);
            }}
          >
            留在此处
          </button>
        </div>
      ) : null}
      <div className="reading-body">
        {drawer ? (
          <aside className="reader-drawer">
            <div className="drawer-tabs">
              <button
                className={drawer === "contents" ? "selected" : ""}
                onClick={() => setDrawer("contents")}
              >
                目录
              </button>
              <button
                className={drawer === "marks" ? "selected" : ""}
                onClick={() => setDrawer("marks")}
              >
                书签与批注
              </button>
              <IconButton label="关闭侧栏" onClick={() => setDrawer(null)}>
                <X size={16} />
              </IconButton>
            </div>
            {drawer === "contents" ? (
              <div className="toc-list">
                {toc.map((item, i) => (
                  <button
                    key={item.id + i}
                    style={{ paddingLeft: 16 + Math.min(item.depth, 4) * 14 }}
                    onClick={() =>
                      navigate(
                        book.format === "pdf"
                          ? { page: Number(item.href) }
                          : { href: item.href },
                      )
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : drawer === "marks" ? (
              <div className="marks-list">
                {marks.length ? (
                  marks.map((mark) => (
                    <article key={mark.id}>
                      <button onClick={() => navigate(mark)}>
                        <small>
                          {mark.imported ? "Apple Books · " : ""}
                          {mark.type === "bookmark" ? "书签" : "标注"}
                        </small>
                        <p>{mark.text || "此处的书签"}</p>
                        {mark.note ? <em>{mark.note}</em> : null}
                      </button>
                      {!mark.imported ? (
                        <IconButton
                          label="删除此记录"
                          onClick={() =>
                            latestSave
                              .current(book.id, {
                                mark: { ...mark, deleted: true },
                              })
                              .catch(onError)
                          }
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="drawer-empty">
                    还没有书签或批注。选中文字可以添加标注。
                  </p>
                )}
              </div>
            ) : (
              <div className="book-search">
                <label className="search-field">
                  <Search size={16} />
                  <input
                    autoFocus
                    aria-label="搜索书中内容"
                    placeholder="搜索书中内容"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <small>
                  {searching
                    ? "正在搜索…"
                    : query
                      ? `${hits.length} 个结果${hits.length >= 100 ? "（最多显示 100 个）" : ""}`
                      : "在整本书中查找文字"}
                </small>
                {hits.map((hit, i) => (
                  <button key={i} onClick={() => navigate(hit)}>
                    {hit.page ? <small>第 {hit.page} 页</small> : null}
                    {hit.excerpt}
                  </button>
                ))}
              </div>
            )}
          </aside>
        ) : null}
        <div
          className="reading-canvas"
          style={{ filter: `brightness(${reading.brightness})` }}
        >
          {fatal ? (
            <div className="empty-state error">
              <BookOpen size={40} />
              <h2>无法打开这本书</h2>
              <p>{fatal}</p>
              <button onClick={onClose}>返回书库</button>
            </div>
          ) : bytes ? (
            book.format === "pdf" ? (
              <Suspense
                fallback={
                  <div className="reader-loading">
                    <LoaderCircle className="spin" />
                    正在载入 PDF 阅读器…
                  </div>
                }
              >
                <PdfView
                  key={viewGeneration}
                  ref={engine}
                  bookId={book.id}
                  bytes={bytes}
                  initial={initial.current}
                  settings={reading}
                  marks={marks}
                  onLocation={handleLocation}
                  onToc={setToc}
                  onReady={() => setReady(true)}
                  onError={onError}
                  onSelection={setSelection}
                  onArrow={turnPage}
                />
              </Suspense>
            ) : (
              <EpubView
                key={viewGeneration}
                ref={engine}
                bookId={book.id}
                bytes={bytes}
                initial={initial.current}
                appleCfi={book.appleCfi}
                settings={reading}
                marks={marks}
                onLocation={handleLocation}
                onToc={setToc}
                onReady={() => setReady(true)}
                onError={onError}
                onSelection={setSelection}
                onArrow={turnPage}
                onShortcut={(key) => {
                  if (key === "play" && ready) resumeNarration();
                  else if (key === "find") setDrawer("search");
                  else if (key === "escape") {
                    if (themeOpen) setThemeOpen(false);
                    else if (drawer) setDrawer(null);
                    else onClose();
                  }
                }}
              />
            )
          ) : (
            <div className="reader-loading">
              <LoaderCircle className="spin" size={28} />
              <p>正在从云端打开图书…</p>
              <small>仅在云端的文件首次打开需要下载</small>
            </div>
          )}
          {ready ? (
            <>
              <button
                className="page-arrow previous"
                aria-label="上一页"
                onClick={() => turnPage(-1)}
              >
                <ChevronLeft />
              </button>
              <button
                className="page-arrow next"
                aria-label="下一页"
                onClick={() => turnPage(1)}
              >
                <ChevronRight />
              </button>
            </>
          ) : null}
        </div>
      </div>
      {themeOpen ? (
        <>
          <div
            className="popover-dismiss"
            onClick={() => setThemeOpen(false)}
          />
          <Themes settings={reading} onChange={changeReading} />
        </>
      ) : null}
      {selection?.text ? (
        <div className="selection-toolbar">
          <Highlighter size={17} />
          <span>
            {selection.text.slice(0, 55)}
            {selection.text.length > 55 ? "…" : ""}
          </span>
          <input
            aria-label="标注笔记"
            placeholder="添加笔记（可选）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="primary" onClick={saveHighlight}>
            标注
          </button>
          <IconButton label="取消选中" onClick={() => setSelection(null)}>
            <X size={16} />
          </IconButton>
        </div>
      ) : null}
      <div className="reading-progress">
        <span>{location.label || (ready ? "阅读位置已恢复" : "正在载入")}</span>
        <input
          aria-label="阅读进度"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(location.progress * 1000)}
          disabled={!ready}
          onChange={(e) =>
            setLocation((l) => ({
              ...l,
              progress: Number(e.target.value) / 1000,
            }))
          }
          onPointerUp={(e) => {
            seek(Number(e.currentTarget.value) / 1000).catch(onError);
          }}
          onKeyUp={(e) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
              seek(Number(e.currentTarget.value) / 1000).catch(onError);
            }
          }}
        />
        <span>{Math.round(location.progress * 100)}%</span>
      </div>
      <footer className="narration-bar">
        <button className="voice-selector" onClick={() => onSettings("voice")}>
          <Headphones size={16} />
          <span>
            {voices.find(
              (v) =>
                v.id === voice.voice &&
                v.engine === voice.engine &&
                (v.engine !== "neural" || v.modelId === voice.modelId),
            )?.name ||
              (voice.engine === "piper" ? "Piper 本地语音" : "选择朗读声音")}
          </span>
          <Settings2 size={14} />
        </button>
        <div className="playback-controls">
          <IconButton
            label="上一句"
            disabled={!ready}
            onClick={() => narration.skip(-1)}
          >
            <SkipBack size={19} />
          </IconButton>
          <button
            className="play-button"
            aria-label={
              narration.loading
                ? "取消语音合成"
                : narration.playing
                  ? "暂停朗读"
                  : "开始朗读"
            }
            disabled={!ready}
            onClick={() =>
              narration.loading ? narration.pause() : resumeNarration()
            }
          >
            {narration.loading ? (
              <LoaderCircle className="spin" size={22} />
            ) : narration.playing ? (
              <Pause size={22} fill="currentColor" />
            ) : (
              <Play size={22} fill="currentColor" />
            )}
          </button>
          <IconButton
            label="下一句"
            disabled={!ready}
            onClick={() => narration.skip(1)}
          >
            <SkipForward size={19} />
          </IconButton>
        </div>
        <div className="narration-tools">
          <select
            aria-label="快捷语速"
            value={voice.rate}
            onChange={(e) =>
              onChange({ voice: { ...voice, rate: Number(e.target.value) } })
            }
          >
            {[
              ...new Set([
                0.5,
                0.75,
                1,
                1.25,
                1.5,
                1.75,
                2,
                2.5,
                3,
                voice.rate,
              ]),
            ]
              .sort((a, b) => a - b)
              .map((rate) => (
                <option key={rate} value={rate}>
                  {rate}×
                </option>
              ))}
          </select>
          <button
            className="subtitle-settings-button"
            aria-label="桌面字幕设置"
            onClick={() => onSettings("subtitles")}
          >
            <Captions size={18} />
            <span>桌面字幕</span>
          </button>
          <Switch
            label="显示桌面字幕"
            checked={overlay}
            onChange={(value) => {
              window.reader?.showOverlay(value);
              setOverlay(value);
            }}
          />
        </div>
      </footer>
      {narration.sentence ? (
        <div className="now-speaking" title={narration.sentence.text}>
          <span>
            {narration.loading
              ? "正在合成"
              : narration.playing
                ? "正在朗读"
                : "已暂停"}{" "}
            · {narration.timing === "word" ? "逐词同步" : "逐句同步"}
          </span>
          <p>{narration.sentence.text}</p>
        </div>
      ) : null}
    </div>
  );
}
