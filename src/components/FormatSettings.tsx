import { useEffect, useState } from "react";
import type { AppSettings } from "../types";
export function FormatSettings({
  settings,
  onChange,
  onError,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onError: (text: string) => void;
}) {
  const [info, setInfo] = useState<{
    builtin: string[];
    calibre: string[];
    converter: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    window.reader
      ?.formats()
      .then((v) => {
        if (active) setInfo(v);
      })
      .catch((e) => onError(e.message));
    return () => {
      active = false;
    };
  }, [settings.formats?.calibrePath]);
  const update = (patch: NonNullable<AppSettings["formats"]>) =>
    onChange({ formats: { ...settings.formats, ...patch } });
  return (
    <>
      <h3>直接阅读</h3>
      <p className="format-list">
        {info?.builtin.map((f) => f.toUpperCase()).join(" · ")}
      </p>
      <p className="help">
        正文在打开时转换为可排版的阅读内容，原文件保存在云盘。TXT 支持自动识别
        UTF-8、UTF-16 和 GB18030；漫画按自然页码排序。扫描版 PDF
        和纯图片漫画暂不支持文字朗读。
      </p>
      <label className="setting-row">
        <span>文本文件编码</span>
        <select
          aria-label="文本文件编码"
          value={settings.formats?.textEncoding || "auto"}
          onChange={(e) => update({ textEncoding: e.target.value })}
        >
          {[
            ["auto", "自动识别"],
            ["utf-8", "UTF-8"],
            ["utf-16le", "UTF-16 LE"],
            ["gb18030", "GB18030 / GBK"],
            ["big5", "Big5"],
            ["shift_jis", "Shift JIS"],
          ].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <h3>通过 Calibre 打开</h3>
      <p className="format-list">
        {info?.calibre.map((f) => f.toUpperCase()).join(" · ")}
      </p>
      <div className="notice">
        <p>
          {info?.converter
            ? "已检测到转换组件：" + info.converter
            : "尚未检测到 Calibre。安装后可自动识别，也可以手动选择 ebook-convert。"}
        </p>
      </div>
      <div className="format-actions">
        <button
          onClick={() =>
            window.reader
              ?.pickConverter()
              .then((p) => {
                if (p) update({ calibrePath: p });
              })
              .catch((e) => onError(e.message))
          }
        >
          选择 ebook-convert…
        </button>
        <button
          onClick={() =>
            window.reader?.downloadConverter().catch((e) => onError(e.message))
          }
        >
          下载 Calibre
        </button>
        {settings.formats?.calibrePath ? (
          <button onClick={() => update({ calibrePath: "" })}>自动检测</button>
        ) : null}
      </div>
      <p className="help">
        Calibre 单独安装，首次打开时转换。版式可能与原稿不同；受 DRM
        保护的书不能打开。DJVU 需要已有文字层；HTML/Markdown
        的远程图片不会联网加载。本地相对图片需与文档一起存放在云盘。
      </p>
    </>
  );
}
