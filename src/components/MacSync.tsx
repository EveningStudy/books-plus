import { useEffect, useState } from "react";
import type { MacSettings, MacStatus } from "../types";
import { Switch } from "./Primitives";
export function MacSync({
  onError,
  onMode,
}: {
  onError: (text: string) => void;
  onMode?: (settings: MacSettings) => void;
}) {
  const [status, setStatus] = useState<MacStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [cloudId, setCloudId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [books, setBooks] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    window.reader
      ?.macStatus()
      .then(setStatus)
      .catch((e) => onError(e.message));
    window.reader
      ?.load()
      .then((data) => setBooks(data.books))
      .catch(() => {});
    return window.reader?.onMacStatus(setStatus);
  }, []);
  async function perform(work: () => Promise<MacStatus> | undefined) {
    setBusy(true);
    try {
      const next = await work();
      if (next) setStatus(next);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const update = (patch: Partial<MacSettings>) =>
    perform(async () => {
      const next = await window.reader!.macSettings({
        ...status!.settings,
        ...patch,
      });
      onMode?.(next.settings);
      return next;
    });
  if (!status) return <p>正在读取同步状态…</p>;
  if (status.platform !== "darwin")
    return (
      <p>
        Apple Books 同步与菜单栏常驻适用于
        macOS。此设备可以通过云盘共享阅读进度。
      </p>
    );
  return (
    <section className="mac-sync">
      <h3>Mac 运行模式</h3>
      <label className="setting-row">
        <span>使用方式</span>
        <select
          aria-label="Mac 运行模式"
          disabled={busy}
          value={status.settings.mode}
          onChange={(e) =>
            update({ mode: e.target.value as MacSettings["mode"] })
          }
        >
          <option value="sync">只同步 · 菜单栏常驻</option>
          <option value="reader">只阅读</option>
          <option value="both">两者都用</option>
        </select>
      </label>
      <p className="help">
        只同步模式仅保留菜单栏图标；关闭此设置窗口后继续同步。两者都用时，关闭阅读器窗口也会继续同步，⌘Q
        才退出。
      </p>
      <div className="setting-row">
        <span>登录后自动同步</span>
        <Switch
          label="登录后自动同步"
          checked={status.settings.login}
          onChange={(value) => {
            if (!busy) update({ login: value });
          }}
        />
      </div>
      <p className="help">
        {!status.packaged
          ? "开发模式不注册登录项；请使用打包后的 Books+.app。"
          : `系统登录项：${status.login?.status || (status.login?.openAtLogin ? "已启用" : "未启用")}。可在系统设置 → 通用 → 登录项中管理。`}
      </p>
      <div className="setting-row">
        <span>自动回写 Apple Books 阅读位置</span>
        <Switch
          label="自动回写 Apple Books 阅读位置"
          checked={status.settings.writeback}
          onChange={(value) => {
            if (!busy) update({ writeback: value });
          }}
        />
      </div>
      <p className="help">
        同修订 EPUB 使用 CFI 深链接，Books
        会打开并自行保存位置，可能切到前台。关闭此项后仍自动导入新书、导出进度，也可手动点“在
        Books 中继续”。PDF
        仅导入书籍与导出百分比，不回写页码。批注和完成状态仅从 Books 导出。
      </p>
      <h3>Apple Books 同步</h3>
      <div className="notice">
        <p role="status">
          {status.error ||
            (status.running
              ? "正在同步…"
              : status.enabled
                ? `已映射 ${status.mappings.length} 本 · ${status.pending} 个位置待确认`
                : "同步已停用")}
          {status.lastSyncedAt
            ? ` · 上次完成 ${new Date(status.lastSyncedAt).toLocaleTimeString()}`
            : ""}
        </p>
      </div>
      {status.watchError ? (
        <p className="help">
          文件监听：{status.watchError}；每 30 秒仍会重试检查。
        </p>
      ) : null}
      <div className="format-actions">
        <button
          disabled={busy || status.running || !status.enabled}
          onClick={() => perform(() => window.reader?.macSync())}
        >
          立即同步
        </button>
        <button
          onClick={() =>
            window.reader?.macPermissions().catch((e) => onError(e.message))
          }
        >
          打开完全磁盘访问设置
        </button>
      </div>
      <p className="help">
        首次使用需允许 Books+ 读取 Apple Books
        容器，修改权限后重启。写入云盘文件夹后由云盘客户端上传，当前状态不代表服务器或其他
        Apple 设备已收到。
      </p>
      {status.issues.length ? (
        <details open>
          <summary>需要处理（{status.issues.length}）</summary>
          <ul>
            {status.issues.map((issue, i) => (
              <li key={i}>
                <strong>
                  {issue.title || issue.id || issue.assetId || "书库"}
                </strong>
                <p>{issue.error}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {status.mappings.length ? (
        <details>
          <summary>书籍映射与回写</summary>
          <ul>
            {status.mappings.map((mapping) => (
              <li key={mapping.id}>
                <strong>{mapping.title}</strong>
                <p className="help">
                  云书 {mapping.id}
                  <br />
                  Apple asset {mapping.assetId}
                </p>
                <div className="format-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      perform(() =>
                        window.reader?.macAction("continue", mapping.id),
                      )
                    }
                  >
                    在 Books 中继续
                  </button>
                  {mapping.pending ? (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          perform(() =>
                            window.reader?.macAction("retry", mapping.id),
                          )
                        }
                      >
                        重试定位
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          perform(() =>
                            window.reader?.macAction("cancel", mapping.id),
                          )
                        }
                      >
                        取消待确认回写
                      </button>
                      {mapping.observedProgress != null ? (
                        <>
                          <p className="help">
                            Books 可能按页面保存位置，请先在 Books 中核对。
                            <br />
                            请求：{mapping.requestedCfi}
                            <br />
                            实际保存：
                            {mapping.observedCfi ||
                              `进度 ${Math.round((mapping.observedProgress || 0) * 100)}%（Books 未保存 CFI）`}
                          </p>
                          <button
                            disabled={busy}
                            onClick={() =>
                              perform(() =>
                                window.reader?.macAction("accept", mapping.id),
                              )
                            }
                          >
                            已核对，确认 Books 显示的位置
                          </button>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {status.imports?.length ? (
        <details>
          <summary>等待 Books 确认导入</summary>
          <ul>
            {status.imports.map((id) => (
              <li key={id}>
                {id}{" "}
                <button
                  disabled={busy}
                  onClick={() =>
                    perform(() => window.reader?.macAction("retry-import", id))
                  }
                >
                  重新提交导入
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <details>
        <summary>手动核对映射</summary>
        <p className="help">
          只允许内容一致且未被其他云书占用的 Apple
          asset。内容不同的修订需要重新导入。
        </p>
        <label className="setting-row">
          <span>云端图书</span>
          <select
            aria-label="映射云书"
            value={cloudId}
            onChange={(e) => setCloudId(e.target.value)}
          >
            <option value="">选择云书…</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title} · {book.id}
              </option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>Apple Books 图书</span>
          <select
            aria-label="映射 Apple asset"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
          >
            <option value="">选择 Apple asset…</option>
            {status.assets?.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.title} · {asset.id}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !cloudId || !assetId}
          onClick={() =>
            perform(() => window.reader?.macAction("map", cloudId, assetId))
          }
        >
          校验正文并建立映射
        </button>
      </details>
    </section>
  );
}
