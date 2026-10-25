import { t, tm, useLocale } from "../i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  Clock3,
  Bookmark,
  LibraryBig,
  CircleCheck,
  FileText,
  Star,
  Settings,
  Cloud,
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  MoreHorizontal,
  FolderOpen,
  Headphones,
  Plus,
  ArrowDownWideNarrow,
  Trash2,
} from "lucide-react";
import type { BookItem, LibraryData } from "../types";
import { Dialog, IconButton } from "./Primitives";
const coverCache = new Map<string, string | null>();
let coverQueue: (() => Promise<void>)[] = [],
  coverBusy = 0;
function schedule(work: () => Promise<void>) {
  coverQueue.push(work);
  pump();
}
function pump() {
  while (coverBusy < 2 && coverQueue.length) {
    coverBusy++;
    coverQueue.shift()!().finally(() => {
      coverBusy--;
      pump();
    });
  }
}
function Cover({ book }: { book: BookItem }) {
  useLocale();
  const [url, setUrl] = useState(coverCache.get(book.coverKey));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setUrl(coverCache.get(book.coverKey));
    if (coverCache.has(book.coverKey) || !book.valid || !window.reader) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        schedule(async () => {
          if (cancelled) return;
          try {
            const image = await window.reader!.cover(book.id);
            coverCache.set(book.coverKey, image);
            if (!cancelled) setUrl(image);
          } catch {
            coverCache.set(book.coverKey, null);
          }
        });
      },
      { rootMargin: "180px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [book.id, book.coverKey, book.valid, book.format]);
  const hue =
    [...book.title].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
  return (
    <div
      className="cover"
      ref={ref}
      style={{ "--cover-hue": hue } as React.CSSProperties}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <div className="cover-fallback">
          <small>{book.format.toUpperCase()}</small>
          <strong>{book.title}</strong>
          <span>
            {book.author === "未知作者" ? t("未知作者") : book.author}
          </span>
        </div>
      )}
      <span className="spine" />
      {!book.valid ? (
        <span className="unvalidated">{t("未验证备份")}</span>
      ) : null}
    </div>
  );
}
const BookCard = memo(function BookCard({
  book,
  onOpen,
  onStatus,
  onStorage,
  onDelete,
}: {
  book: BookItem;
  onOpen: (b: BookItem) => void;
  onStatus: (id: string, status: BookItem["state"]["status"]) => void;
  onStorage: (id: string, action: "offline" | "release") => void;
  onDelete: (book: BookItem) => void;
}) {
  useLocale();
  const progress = Math.round(
    (book.state.reading?.progress ?? book.appleProgress) * 100,
  );
  const deleted = !!book.state.lifecycle?.deleted;
  return (
    <article className="book-card">
      <button
        className="open-book"
        onClick={() => onOpen(book)}
        aria-label={t("阅读 {0}", [book.title])}
        disabled={!book.valid || deleted}
      >
        <Cover book={book} />
      </button>
      <div className="book-meta">
        <button
          className="book-title"
          title={book.title}
          onClick={() => onOpen(book)}
          disabled={!book.valid || deleted}
        >
          {book.title}
        </button>
        <p>{book.author === "未知作者" ? t("未知作者") : book.author}</p>
        <span
          className={"book-storage " + book.storage.state}
          title={
            book.storage.supported
              ? t("由云盘客户端管理正文下载")
              : t("此云盘未提供按需释放接口")
          }
        >
          <Cloud size={11} />
          {book.storage.offline
            ? t("保留离线")
            : book.storage.state === "cloud"
              ? t("云端")
              : book.storage.state === "downloaded"
                ? t("已下载")
                : book.storage.state === "local"
                  ? t("本地文件")
                  : book.storage.state === "missing"
                    ? t("等待云盘同步")
                    : t("状态待确认")}
        </span>
        <div
          className="book-progress"
          title={
            book.state.reading
              ? t("阅读器进度")
              : t("从 Apple Books 导入的进度")
          }
        >
          <span>
            {book.finished ? <CircleCheck size={12} /> : `${progress}%`}
          </span>
          <div>
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <details className="book-menu">
        <summary aria-label={t("{0} 的更多选项", [book.title])}>
          <MoreHorizontal size={18} />
        </summary>
        <div>
          {deleted ? (
            <button onClick={() => onDelete(book)}>{t("恢复图书")}</button>
          ) : (
            <>
              <button
                onClick={() => onStorage(book.id, "offline")}
                disabled={!book.valid}
              >
                {book.storage.offline ? t("取消保留离线") : t("下载并保留离线")}
              </button>
              <button
                onClick={() => onStorage(book.id, "release")}
                disabled={
                  !book.storage.supported ||
                  book.storage.offline ||
                  book.storage.state === "cloud"
                }
              >
                {t("释放本地空间")}
              </button>
              <button
                onClick={() =>
                  onStatus(book.id, { favorite: !book.state.status?.favorite })
                }
              >
                {book.state.status?.favorite
                  ? t("移出我的收藏")
                  : t("加入我的收藏")}
              </button>
              <button
                onClick={() =>
                  onStatus(book.id, { want: !book.state.status?.want })
                }
              >
                {book.state.status?.want ? t("移出想读") : t("加入想读")}
              </button>
              <button
                onClick={() => onStatus(book.id, { finished: !book.finished })}
              >
                {book.finished ? t("标记为未读完") : t("标记为已读完")}
              </button>
              <button className="danger-text" onClick={() => onDelete(book)}>
                {t("删除图书…")}
              </button>
            </>
          )}
        </div>
      </details>
    </article>
  );
});
const nav = [
  ["recent", "最近阅读", Clock3],
  ["want", "想读", Bookmark],
  ["all", "全部图书", LibraryBig],
  ["finished", "已读完", CircleCheck],
  ["pdf", "PDF", FileText],
  ["favorites", "我的收藏", Star],
  ["trash", "最近删除", Trash2],
] as const;
export function Library({
  data,
  sync,
  busy,
  onOpen,
  onRefresh,
  onChoose,
  onImport,
  onSettings,
  onStatus,
  onStorage,
  onDelete,
}: {
  data: LibraryData;
  sync: string;
  busy: boolean;
  onOpen: (b: BookItem) => void;
  onRefresh: () => void;
  onChoose: () => void;
  onImport: () => void;
  onSettings: () => void;
  onStatus: (id: string, status: BookItem["state"]["status"]) => void;
  onStorage: (id: string, action: "offline" | "release") => void;
  onDelete: (id: string, deleted: boolean) => Promise<void>;
}) {
  const locale = useLocale();
  const [deleting, setDeleting] = useState<BookItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const handleDelete = (book: BookItem) => {
    if (book.state.lifecycle?.deleted) void onDelete(book.id, false);
    else setDeleting(book);
  };
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [view, setView] = useState(data.settings.view || "grid");
  const [sort, setSort] = useState(data.settings.sort || "recent");
  const collections = useMemo(
    () =>
      [...new Set(data.books.flatMap((b) => b.collections))].filter(
        (c) =>
          ![
            "书库",
            "图书",
            "已下载",
            "已读完",
            "想读",
            "我的试读版",
            "有声书",
            "PDF",
          ].includes(c),
      ),
    [data.books],
  );
  const books = useMemo(() => {
    const q = deferredQuery.toLocaleLowerCase().trim();
    return (tab === "trash" ? data.trash || [] : data.books)
      .filter((b) => {
        if (q && !`${b.title} ${b.author}`.toLocaleLowerCase().includes(q))
          return false;
        if (tab === "recent")
          return !!b.state.reading || (b.appleProgress > 0 && !b.finished);
        if (tab === "want")
          return b.state.status?.want || b.collections.includes("想读");
        if (tab === "finished") return b.finished;
        if (tab === "pdf") return b.format === "pdf";
        if (tab === "favorites") return b.state.status?.favorite;
        if (tab.startsWith("collection:"))
          return b.collections.includes(tab.slice(11));
        return true;
      })
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title, locale === "en" ? "en" : "zh-CN")
          : sort === "author"
            ? a.author.localeCompare(b.author, locale === "en" ? "en" : "zh-CN")
            : sort === "progress"
              ? (b.state.reading?.progress ?? b.appleProgress) -
                (a.state.reading?.progress ?? a.appleProgress)
              : (b.lastOpened || "").localeCompare(a.lastOpened || ""),
      );
  }, [data.books, data.trash, tab, deferredQuery, sort, locale]);
  const title = tab.startsWith("collection:")
    ? tab.slice(11)
    : nav.find((n) => n[0] === tab)?.[1] || t("全部图书");
  return (
    <div className="library-layout">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <BookOpen size={26} />
          </div>
          <strong>Books+</strong>
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "selected" : ""}
              onClick={() => setTab(id)}
            >
              <Icon />
              <span>{t(label)}</span>
              {id === "all" ? <small>{data.books.length}</small> : null}
            </button>
          ))}
        </nav>
        {collections.length ? (
          <div className="collections">
            <h3>{t("我的精选集")}</h3>
            {collections.map((c) => (
              <button
                className={tab === "collection:" + c ? "selected" : ""}
                key={c}
                onClick={() => setTab("collection:" + c)}
              >
                <FolderOpen size={16} />
                <span>{c}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="sidebar-bottom">
          <div className="cloud-status">
            <Cloud size={20} />
            <div>
              <span>{t("云端书库")}</span>
              <small title={tm(sync)}>{tm(sync)}</small>
            </div>
            <IconButton
              label={t("刷新书库")}
              disabled={busy}
              onClick={onRefresh}
            >
              <RefreshCw className={busy ? "spin" : ""} size={14} />
            </IconButton>
          </div>
          <button onClick={onSettings}>
            <Settings />
            <span>{t("设置")}</span>
          </button>
          <LanguageSwitcher />
        </div>
      </aside>
      <main className="library-main">
        <header className="library-header">
          <div>
            <h1>{tab.startsWith("collection:") ? title : t(title)}</h1>
            <p>
              {deferredQuery
                ? t("找到 {0} 本图书", [books.length])
                : t("共 {0} 本图书", [books.length])}
            </p>
          </div>
          <label className="search-field">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("搜索图书或作者")}
              aria-label={t("搜索图书或作者")}
            />
            {query ? (
              <button onClick={() => setQuery("")} aria-label={t("清除搜索")}>
                ×
              </button>
            ) : null}
          </label>
        </header>
        <div className="shelf-toolbar">
          <span>{tab === "recent" ? t("接着上次的地方读下去") : ""}</span>
          <div>
            <ArrowDownWideNarrow size={15} />
            <select
              value={sort}
              aria-label={t("图书排序")}
              onChange={(e) => {
                setSort(e.target.value);
                window.reader?.saveSettings({ sort: e.target.value });
              }}
            >
              <option value="recent">{t("最近阅读")}</option>
              <option value="title">{t("书名")}</option>
              <option value="author">{t("作者")}</option>
              <option value="progress">{t("阅读进度")}</option>
            </select>
            <div className="segmented">
              <IconButton
                label={t("网格视图")}
                active={view === "grid"}
                onClick={() => {
                  setView("grid");
                  window.reader?.saveSettings({ view: "grid" });
                }}
              >
                <LayoutGrid size={17} />
              </IconButton>
              <IconButton
                label={t("列表视图")}
                active={view === "list"}
                onClick={() => {
                  setView("list");
                  window.reader?.saveSettings({ view: "list" });
                }}
              >
                <List size={19} />
              </IconButton>
            </div>
          </div>
        </div>
        {books.length ? (
          <div className={"book-shelf " + view}>
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onOpen={onOpen}
                onStatus={onStatus}
                onStorage={onStorage}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <BookOpen size={44} />
            <h2>{query ? t("没有找到这本书") : t("这里还没有图书")}</h2>
            <p>
              {query
                ? t("试试其他书名或作者。")
                : tab === "want"
                  ? t("在图书的更多选项中，将它加入想读。")
                  : tab === "favorites"
                    ? t("在图书的更多选项中，将它加入收藏。")
                    : t("换一个分类看看。")}
            </p>
            <button
              onClick={() => {
                setTab("all");
                setQuery("");
              }}
            >
              {t("查看全部图书")}
            </button>
          </div>
        )}
        <footer className="library-footer">
          <span>
            {t("{0} 本未验证备份保留在书库中", [
              data.books.filter((b) => !b.valid).length,
            ])}
          </span>
          <button onClick={onImport} disabled={busy}>
            <Plus size={14} />
            {t("加入图书")}
          </button>
        </footer>
      </main>
      {deleting ? (
        <Dialog
          title={t("删除图书")}
          onClose={() => {
            if (!deletingBusy) setDeleting(null);
          }}
        >
          <div className="delete-confirm">
            <p>{t("将《{0}》移到最近删除？", [deleting.title])}</p>
            <p className="help">
              {t(
                "此操作会同步到连接此书库的新版 Books+。原文件、阅读进度和批注保留，可在最近删除中恢复。不会删除 Apple Books（含 iPhone）里的原书。",
              )}
            </p>
            <div className="dialog-actions">
              <button disabled={deletingBusy} onClick={() => setDeleting(null)}>
                {t("取消")}
              </button>
              <button
                className="danger-button"
                disabled={deletingBusy}
                onClick={async () => {
                  setDeletingBusy(true);
                  try {
                    await onDelete(deleting.id, true);
                    setDeleting(null);
                  } finally {
                    setDeletingBusy(false);
                  }
                }}
              >
                {deletingBusy ? t("正在删除…") : t("移到最近删除")}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
