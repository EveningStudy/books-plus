import { t, tm, useLocale } from "../i18n";
import { useCallback, useEffect, useState } from "react";
import { Download, Check, Trash2, X, LoaderCircle } from "lucide-react";
import type { ModelInfo, ModelProgress } from "../types";
export function ModelManager({
  onError,
  onUse,
}: {
  onError: (text: string) => void;
  onUse: (model: ModelInfo) => void;
}) {
  useLocale();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [progress, setProgress] = useState<Record<string, ModelProgress>>({});
  const refresh = useCallback(
    () =>
      window.reader
        ?.models()
        .then(setModels)
        .catch((e) => onError(String(e))),
    [onError],
  );
  useEffect(() => {
    refresh();
    return window.reader?.onModelProgress((p) => {
      setProgress((old) => ({ ...old, [p.id]: p }));
      if (["installed", "removed", "error", "cancelled"].includes(p.phase))
        refresh();
    });
  }, [refresh]);
  const install = async (model: ModelInfo) => {
    try {
      await window.reader?.installModel(model.id);
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="model-manager" aria-label={t("可下载的本地模型")}>
      <h3>{t("下载本地模型")}</h3>
      <p className="help">
        {t(
          "下载后可断网朗读，无需安装 Python 或配置程序路径。模型保存在此电脑，语音合成不会发送正文到云端。",
        )}
      </p>
      {models.map((m) => {
        const p = progress[m.id] || m.progress,
          busy = p?.phase === "downloading" || p?.phase === "extracting";
        return (
          <article className="model-card" key={m.id}>
            <div>
              <strong>{t(m.name)}</strong>
              <span>
                {t("{0}{1} MiB 下载 · {2}", [
                  m.legacy ? t("已安装的旧模型 · ") : "",
                  Math.round(m.size / 1048576),
                  t(m.license),
                ])}
              </span>
              <p>{t(m.description)}</p>
            </div>
            <div className="model-actions">
              {busy ? (
                <>
                  <button
                    onClick={() => window.reader?.cancelModel(m.id)}
                    aria-label={t("取消下载 {0}", [t(m.name)])}
                  >
                    <X size={14} />
                    {t("取消")}
                  </button>
                  <small>
                    <LoaderCircle size={12} className="spin" />
                    {p.phase === "extracting"
                      ? t("校验通过，正在解压…")
                      : `${Math.round(((p.received || 0) / Math.max(1, p.total || m.size)) * 100)}%`}
                  </small>
                </>
              ) : m.installed ? (
                <>
                  <button className="model-use" onClick={() => onUse(m)}>
                    <Check size={14} />
                    {t("使用")}
                  </button>
                  <button
                    onClick={() =>
                      window.reader
                        ?.removeModel(m.id)
                        .then(() => refresh())
                        .catch((e) => onError(String(e)))
                    }
                    aria-label={t("移除模型 {0}", [t(m.name)])}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                <button onClick={() => install(m)}>
                  <Download size={14} />
                  {t("下载")}
                </button>
              )}
            </div>
            {busy ? (
              <progress
                max={p.total || m.size}
                value={p.received || 0}
                aria-label={t("{0} 下载进度", [t(m.name)])}
              />
            ) : null}
            {p?.phase === "error" ? (
              <p className="model-error" role="status">
                {t("{0}，可重新下载。", [tm(p.error || "")])}
              </p>
            ) : null}
            <div className="model-links">
              <button
                onClick={() => window.reader?.openModelPage(m.id, "source")}
              >
                {t("模型来源")}
              </button>
              <button
                onClick={() => window.reader?.openModelPage(m.id, "license")}
              >
                {t("许可与模型卡")}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
