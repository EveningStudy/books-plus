import { useState } from "react";
import { FolderPlus, FolderOpen } from "lucide-react";
import { t, tm, useLocale } from "../i18n";
import type { LibraryData } from "../types";

export function Sources({
  data,
  onData,
  onError,
}: {
  data: LibraryData | null;
  onData: (data: LibraryData) => void;
  onError: (message: string) => void;
}) {
  useLocale();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  async function perform(work: () => Promise<LibraryData | null>) {
    setBusy(true);
    try {
      const next = await work();
      if (next) onData(next);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const sources = data?.sources || [];
  return (
    <section className="source-settings">
      <h3>{t("书库文件夹")}</h3>
      <p className="help">
        {t(
          "添加多个本地或云盘文件夹，在同一个书架浏览。原文件保留在各自目录，普通文件夹会自动扫描支持的格式及子文件夹。",
        )}
      </p>
      <div className="source-list">
        {sources.map((source) => (
          <article className="source-card" key={source.id}>
            <FolderOpen size={18} />
            <div className="source-details">
              <strong>{source.name}</strong>
              <p className="source-path">{source.root}</p>
              <small>
                {source.appleBooks
                  ? t("Apple Books 同步文件夹")
                  : t("独立书库文件夹")}{" "}
                · {t("共 {0} 本图书", [source.count])}
              </small>
              {source.error ? (
                <p role="status" className="source-error">
                  {tm(source.error)}
                </p>
              ) : null}
              {!source.appleBooks && removing !== source.id ? (
                <button disabled={busy} onClick={() => setRemoving(source.id)}>
                  {t("移除文件夹…")}
                </button>
              ) : null}
              {removing === source.id ? (
                <div className="source-remove-confirm">
                  <p>
                    {t(
                      "仅从此设备的书架移除文件夹。原文件、阅读进度和批注保留，可随时重新添加。",
                    )}
                  </p>
                  <button disabled={busy} onClick={() => setRemoving(null)}>
                    {t("取消")}
                  </button>
                  <button
                    className="danger-text"
                    disabled={busy}
                    onClick={() =>
                      perform(async () => {
                        const next = await window.reader!.removeSource(
                          source.id,
                        );
                        setRemoving(null);
                        return next;
                      })
                    }
                  >
                    {t("确认移除文件夹")}
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      <button
        className="source-add"
        disabled={busy}
        onClick={() => perform(() => window.reader!.addSource())}
      >
        <FolderPlus size={16} />
        {busy ? t("正在读取书库…") : t("添加文件夹…")}
      </button>
      {sources.length ? (
        <>
          <label className="setting-row">
            <span>{t("Apple Books 同步文件夹")}</span>
            <select
              aria-label={t("Apple Books 同步文件夹")}
              disabled={busy}
              value={sources.find((s) => s.appleBooks)?.id || ""}
              onChange={(e) =>
                perform(() => window.reader!.setBridgeSource(e.target.value))
              }
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <p className="help">
            {t(
              "Mac 的 Apple Books 只与上面选中的一个文件夹同步。其他文件夹的书不会导入 Apple Books；云端传输由各自的云盘客户端完成。",
            )}
          </p>
          <label className="setting-row">
            <span>{t("加入图书的默认位置")}</span>
            <select
              aria-label={t("加入图书的默认位置")}
              disabled={busy}
              value={data?.importSourceId || ""}
              onChange={(e) =>
                perform(() => window.reader!.setImportSource(e.target.value))
              }
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
    </section>
  );
}
