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
    <section className="model-manager" aria-label="可下载的本地模型">
      <h3>下载本地模型</h3>
      <p className="help">
        下载后可断网朗读，无需安装 Python
        或配置程序路径。模型保存在此电脑，语音合成不会发送正文到云端。
      </p>
      {models.map((m) => {
        const p = progress[m.id] || m.progress,
          busy = p?.phase === "downloading" || p?.phase === "extracting";
        return (
          <article className="model-card" key={m.id}>
            <div>
              <strong>{m.name}</strong>
              <span>
                {m.legacy ? "已安装的旧模型 · " : ""}
                {Math.round(m.size / 1048576)} MiB 下载 · {m.license}
              </span>
              <p>{m.description}</p>
            </div>
            <div className="model-actions">
              {busy ? (
                <>
                  <button
                    onClick={() => window.reader?.cancelModel(m.id)}
                    aria-label={`取消下载 ${m.name}`}
                  >
                    <X size={14} />
                    取消
                  </button>
                  <small>
                    <LoaderCircle size={12} className="spin" />
                    {p.phase === "extracting"
                      ? "校验通过，正在解压…"
                      : `${Math.round(((p.received || 0) / Math.max(1, p.total || m.size)) * 100)}%`}
                  </small>
                </>
              ) : m.installed ? (
                <>
                  <button className="model-use" onClick={() => onUse(m)}>
                    <Check size={14} />
                    使用
                  </button>
                  <button
                    onClick={() =>
                      window.reader
                        ?.removeModel(m.id)
                        .then(() => refresh())
                        .catch((e) => onError(String(e)))
                    }
                    aria-label={`移除模型 ${m.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                <button onClick={() => install(m)}>
                  <Download size={14} />
                  下载
                </button>
              )}
            </div>
            {busy ? (
              <progress
                max={p.total || m.size}
                value={p.received || 0}
                aria-label={`${m.name} 下载进度`}
              />
            ) : null}
            {p?.phase === "error" ? (
              <p className="model-error" role="status">
                {p.error}，可重新下载。
              </p>
            ) : null}
            <div className="model-links">
              <button
                onClick={() => window.reader?.openModelPage(m.id, "source")}
              >
                模型来源
              </button>
              <button
                onClick={() => window.reader?.openModelPage(m.id, "license")}
              >
                许可与模型卡
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
