import { t, tm, useLocale } from "../i18n";
import { useEffect, useState } from "react";
import type { AppSettings, UpdateStatus } from "../types";
import { Switch } from "./Primitives";
function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    let live = true;
    let receivedEvent = false;
    const off = window.reader?.onUpdate((s) => {
      receivedEvent = true;
      if (live) setStatus(s);
    });
    window.reader
      ?.updateStatus()
      .then((s) => {
        if (live && !receivedEvent) setStatus(s);
      })
      .catch(() => {});
    return () => {
      live = false;
      off?.();
    };
  }, []);
  return status;
}
export function UpdateNotice({ onOpen }: { onOpen: () => void }) {
  useLocale();
  const status = useUpdateStatus();
  if (!status || !["available", "downloaded"].includes(status.phase))
    return null;
  return (
    <button className="update-notice" onClick={onOpen}>
      Books+ {status.version}{" "}
      {status.phase === "downloaded"
        ? t("已下载 · 重启更新")
        : t("可用 · 查看更新")}
    </button>
  );
}
export function Updates({
  settings,
  onChange,
  onError,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onError: (message: string) => void;
}) {
  useLocale();
  const status = useUpdateStatus();
  const [working, setWorking] = useState(false);
  const perform = async (work: () => Promise<unknown> | undefined) => {
    setWorking(true);
    try {
      await work();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };
  if (!status) return <p>{t("正在读取更新状态…")}</p>;
  const labels = {
    idle: t("尚未检查"),
    checking: t("正在检查更新…"),
    current: t("当前已是最新版本"),
    available: t("发现新版本 {0}", [status.version]),
    downloading: t("正在下载 {0}%", [Math.floor(status.percent || 0)]),
    downloaded: t("版本 {0} 已就绪", [status.version]),
    error: t("更新失败，可重试"),
  };
  return (
    <section className="update-settings">
      <h3>{t("软件更新")}</h3>
      <p>{t("当前版本：Books+ {0}", [status.currentVersion])}</p>
      <div className="setting-row">
        <span>{t("自动检查更新")}</span>
        <Switch
          label={t("自动检查更新")}
          checked={settings.updates?.autoCheck !== false}
          onChange={(autoCheck) =>
            onChange({ updates: { ...settings.updates, autoCheck } })
          }
        />
      </div>
      {status.mode === "automatic" ? (
        <div className="setting-row">
          <span>{t("自动下载更新")}</span>
          <Switch
            label={t("自动下载更新")}
            checked={settings.updates?.autoDownload !== false}
            onChange={(autoDownload) =>
              onChange({ updates: { ...settings.updates, autoDownload } })
            }
          />
        </div>
      ) : null}
      <p className="help">
        {t(
          "启动后及每 6 小时检查正式版。安装更新前保存阅读进度，需要时由你重启。",
        )}
      </p>
      {status.mode === "migration" ? (
        <p className="help">
          {t(
            "这是便携版。下载并安装新版后，将迁移到支持自动更新的安装版，现有配置与书库保留。",
          )}
        </p>
      ) : null}
      {status.mode === "manual" ? (
        <p className="help">
          {t(
            "当前 Mac 测试包使用本地签名，仅支持检查更新。自动安装需要 Developer ID 签名版本；可前往发布页下载。",
          )}
        </p>
      ) : null}
      {status.mode === "development" ? (
        <p className="help">
          {t("开发模式仅检查版本；安装更新请使用正式安装包。")}
        </p>
      ) : null}
      <p role="status">{labels[status.phase]}</p>
      {status.phase === "downloading" ? (
        <progress
          aria-label={t("更新下载进度")}
          max={100}
          value={status.percent || 0}
        />
      ) : null}
      {status.error ? (
        <p role="alert" className="update-error">
          {tm(status.error)}
        </p>
      ) : null}
      <div className="dialog-actions">
        <button
          disabled={
            working ||
            ["checking", "downloading", "downloaded"].includes(status.phase)
          }
          onClick={() => perform(() => window.reader?.checkUpdates())}
        >
          {t("检查更新")}
        </button>
        {["available", "error"].includes(status.phase) &&
        status.version &&
        ["automatic", "migration"].includes(status.mode) ? (
          <button
            className="primary"
            disabled={working}
            onClick={() => perform(() => window.reader?.downloadUpdate())}
          >
            {t("下载更新")}
          </button>
        ) : null}
        {status.phase === "downloaded" ? (
          <button
            className="primary"
            disabled={working}
            onClick={() => perform(() => window.reader?.installUpdate())}
          >
            {t("保存并重启安装")}
          </button>
        ) : null}
        <button onClick={() => perform(() => window.reader?.updatePage())}>
          {t("版本发布页")}
        </button>
      </div>
    </section>
  );
}
