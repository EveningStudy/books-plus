import { t, useLocale } from "../i18n";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  Cloud,
  Volume2,
  Captions,
  Monitor,
  Check,
  Download,
} from "lucide-react";
import type {
  AppSettings,
  SubtitleSettings,
  Voice,
  VoiceSettings,
} from "../types";
import { subtitleDefaults, voiceDefaults } from "../defaults";
import { Dialog, Range, Switch } from "./Primitives";
import { ModelManager } from "./ModelManager";
import { FormatSettings } from "./FormatSettings";
import { MacSync } from "./MacSync";
import { Updates } from "./Updates";
export function Settings({
  initialTab = "voice",
  settings,
  root,
  voices,
  onChange,
  onChoose,
  onClose,
  onPreview,
  onShowOverlay,
  onError,
}: {
  initialTab?: string;
  settings: AppSettings;
  root: string;
  voices: Voice[];
  onChange: (patch: Partial<AppSettings>) => void;
  onChoose: () => void;
  onClose: () => void;
  onPreview: () => void;
  onShowOverlay: () => void;
  onError: (message: string) => void;
}) {
  useLocale();
  const [tab, setTab] = useState(initialTab);
  const voice = { ...voiceDefaults, ...settings.voice };
  const subtitle = { ...subtitleDefaults, ...settings.subtitles };
  const updateVoice = (patch: Partial<VoiceSettings>) =>
    onChange({ voice: { ...voice, ...patch } });
  const updateSubtitle = (patch: Partial<SubtitleSettings>) =>
    onChange({ subtitles: { ...subtitle, ...patch } });
  const pick = async (kind: "program" | "model") => {
    try {
      const file = await window.reader?.pick(kind);
      if (file)
        updateVoice(
          kind === "program" ? { piperPath: file } : { modelPath: file },
        );
    } catch (e) {
      onError(String(e));
    }
  };
  const [models, setModels] = useState<import("../types").ModelInfo[]>([]);
  const selectedModel = models.find((m) => m.id === voice.modelId);
  const engineVoices =
    voice.engine === "neural" && selectedModel
      ? selectedModel.voices.map(([id, name, lang]) => ({
          id: String(id),
          name,
          lang,
        }))
      : voices.filter(
          (v) =>
            v.engine === voice.engine &&
            (v.engine !== "neural" || v.modelId === voice.modelId),
        );
  useEffect(() => {
    const refresh = () =>
      window.reader
        ?.models()
        .then(setModels)
        .catch(() => {});
    refresh();
    return window.reader?.onModelProgress((p) => {
      if (p.phase === "installed" || p.phase === "removed") refresh();
    });
  }, []);
  return (
    <Dialog title={t("设置")} onClose={onClose} wide>
      <div className="settings-tabs">
        {[
          ["library", t("书库"), FolderOpen],
          ["mac", t("Mac 同步"), Cloud],
          ["formats", t("格式支持"), FolderOpen],
          ["voice", t("朗读"), Volume2],
          ["subtitles", t("桌面字幕"), Captions],
          ["updates", t("软件更新"), Download],
        ].map(([id, text, Icon]) => (
          <button
            key={String(id)}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(String(id))}
          >
            {typeof Icon !== "string" ? <Icon size={18} /> : null}
            {String(text)}
          </button>
        ))}
      </div>
      <div className="settings-content">
        {tab === "updates" ? (
          <Updates settings={settings} onChange={onChange} onError={onError} />
        ) : null}
        {tab === "mac" ? (
          <MacSync onError={onError} onMode={(mac) => onChange({ mac })} />
        ) : null}
        {tab === "library" ? (
          <>
            <h3>{t("云端书库")}</h3>
            <div className="connection">
              <Cloud />
              <div>
                <strong>Books Export</strong>
                <p>{root}</p>
              </div>
              <button onClick={onChoose}>{t("更改…")}</button>
            </div>
            <p className="help">
              {t(
                "支持 iCloud Drive、OneDrive、Dropbox、Google Drive、坚果云、Syncthing 等客户端同步的本地文件夹。Mac 与 Windows 请选择同一份云端书库的本地副本， 不需要在 Books+ 登录云盘。书籍与 reader-state 都要同步；建议将 JSON 目录保留离线。",
              )}
            </p>
            <div className="notice">
              <Check size={17} />
              <p>
                {t(
                  "写入同步文件后，上传由云盘客户端负责。Mac 可在“Mac 同步”中启用 Apple Books 后台同步与位置回写。",
                )}
              </p>
            </div>
            <h3>{t("下载与本地空间")}</h3>
            <label className="setting-row">
              <span>{t("闲置后释放本地正文")}</span>
              <select
                aria-label={t("闲置后释放本地正文")}
                value={settings.storage?.retentionDays ?? 7}
                onChange={(e) =>
                  onChange({
                    storage: { retentionDays: Number(e.target.value) },
                  })
                }
              >
                <option value="0">{t("仅手动释放")}</option>
                {[1, 7, 14, 30, 90].map((n) => (
                  <option value={n} key={n}>
                    {t("{0} 天未阅读", [n])}
                  </option>
                ))}
              </select>
            </label>
            <p className="help">
              {t(
                "书库只读取书目与小封面；点击图书才读取正文。可在图书的更多选项中“下载并保留离线”。自动清理跳过正在阅读、固定离线或尚未同步的文件，只在应用运行时检查。",
              )}
            </p>
            <button
              className="storage-clean"
              onClick={() =>
                window.reader
                  ?.sweep()
                  .then((r) =>
                    onError(
                      t("已释放 {0} 本；{1} 本因云盘状态或离线设置暂未释放", [
                        r.released,
                        r.skipped,
                      ]),
                    ),
                  )
                  .catch((e) => onError(String(e)))
              }
            >
              {t("立即清理到期下载")}
            </button>
            <p className="help">
              {t(
                "Windows 使用 Cloud Files，Mac iCloud Drive 使用系统的移除本机下载接口。其他云盘请使用客户端“移除下载”。仅释放已上传且无冲突的正文；“保留离线”由 Books+ 保护，不会删除云端书籍。目录、封面、进度和批注会保留。",
              )}
            </p>
            <h3>{t("快捷键")}</h3>
            <dl className="shortcuts">
              <dt>{t("上一页 / 下一页")}</dt>
              <dd>← / →</dd>
              <dt>{t("播放 / 暂停朗读")}</dt>
              <dd>Space</dd>
              <dt>{t("全局播放 / 暂停")}</dt>
              <dd>Ctrl / ⌘ + Shift + Space</dd>
              <dt>{t("显示 / 隐藏字幕")}</dt>
              <dd>Ctrl / ⌘ + Shift + D</dd>
              <dt>{t("锁定 / 解锁字幕")}</dt>
              <dd>Ctrl / ⌘ + Shift + L</dd>
              <dt>{t("返回书库 / 关闭面板")}</dt>
              <dd>Esc</dd>
            </dl>
          </>
        ) : tab === "formats" ? (
          <FormatSettings
            settings={settings}
            onChange={onChange}
            onError={onError}
          />
        ) : tab === "voice" ? (
          <>
            <h3>{t("朗读声音")}</h3>
            <div className="engine-tabs">
              {[
                ["edge", t("Edge · 首选")],
                ["neural", t("神经离线")],
                ["native", t("系统离线")],
                ["piper", t("Piper 本地")],
              ].map(([id, label]) => (
                <button
                  className={voice.engine === id ? "selected" : ""}
                  key={id}
                  onClick={() => {
                    const first =
                      voices.find(
                        (v) =>
                          v.engine === id &&
                          (id !== "neural" || v.modelId === voice.modelId) &&
                          v.lang.startsWith("zh"),
                      ) ||
                      voices.find(
                        (v) =>
                          v.engine === id &&
                          (id !== "neural" || v.modelId === voice.modelId),
                      );
                    updateVoice({
                      engine: id as VoiceSettings["engine"],
                      voice:
                        id === "neural"
                          ? String(selectedModel?.defaultVoice ?? 0)
                          : first?.id || "",
                    });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="help">
              {voice.engine === "native"
                ? t(
                    "使用已安装的系统语音，无需网络或独立模型。Windows 的系统语音音高由音色决定。",
                  )
                : voice.engine === "neural"
                  ? t(
                      "中文和中英混读选 ZipVoice；英文可试听 Pocket TTS 或轻量的 Kitten Mini。全部使用 CPU，无需显卡。请按听感选择。",
                    )
                  : voice.engine === "edge"
                    ? t(
                        "使用 Edge 在线语音。朗读文本会发送到微软服务，需要网络；该接口可能因服务变动而不可用。",
                      )
                    : t(
                        "使用 Piper 的 CPU 语音模型。选择已有的 Piper 程序、ONNX 模型及同目录下的模型配置，无需显卡。逐句同步字幕。",
                      )}
            </p>
            {voice.engine === "neural" ? (
              <>
                <label className="setting-row">
                  <span>{t("本地模型")}</span>
                  <select
                    aria-label={t("本地语音模型")}
                    value={voice.modelId}
                    onChange={(e) => {
                      const model = models.find((m) => m.id === e.target.value);
                      updateVoice({
                        modelId: e.target.value,
                        voice: String(model?.defaultVoice ?? 0),
                      });
                    }}
                  >
                    {models.map((m) => (
                      <option value={m.id} key={m.id}>
                        {t(m.name)}
                        {m.installed ? "" : t("（未下载）")}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedModel?.qualitySteps ? (
                  <label className="setting-row">
                    <span>{t("合成质量")}</span>
                    <select
                      aria-label={t("合成质量")}
                      value={voice.quality}
                      onChange={(e) =>
                        updateVoice({
                          quality: e.target.value as VoiceSettings["quality"],
                        })
                      }
                    >
                      <option value="fast">{t("快速 · 减少等待")}</option>
                      <option value="balanced">{t("均衡")}</option>
                      <option value="high">{t("细致 · 等待更久")}</option>
                    </select>
                  </label>
                ) : null}
                <label className="setting-row">
                  <span>{t("性能偏好")}</span>
                  <select
                    aria-label={t("本地语音性能")}
                    value={voice.threads}
                    onChange={(e) =>
                      updateVoice({ threads: Number(e.target.value) })
                    }
                  >
                    <option value="1">{t("省资源 · 1 线程")}</option>
                    <option value="2">{t("均衡 · 2 线程")}</option>
                    <option value="4">{t("快速 · 4 线程")}</option>
                  </select>
                </label>
                <p className="help">
                  {t(
                    "模型在朗读时加载，闲置 2 分钟后释放内存。首次合成较慢，后续会预取下一句。字幕使用真实音频逐句同步。",
                  )}
                </p>
              </>
            ) : null}
            {voice.engine !== "piper" ? (
              <label className="setting-row">
                <span>{t("音色")}</span>
                <select
                  aria-label={t("朗读音色")}
                  value={voice.voice}
                  onChange={(e) => updateVoice({ voice: e.target.value })}
                >
                  <option value="">
                    {engineVoices.length ? t("选择音色") : t("未找到系统语音")}
                  </option>
                  {engineVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {t(v.name)} · {v.lang}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="setting-row path-setting">
                  <span>{t("Piper 程序")}</span>
                  <button
                    title={voice.piperPath}
                    onClick={() => pick("program")}
                  >
                    {voice.piperPath?.split(/[\\/]/).pop() || t("选择程序…")}
                  </button>
                </label>
                <label className="setting-row path-setting">
                  <span>{t("音色模型")}</span>
                  <button title={voice.modelPath} onClick={() => pick("model")}>
                    {voice.modelPath?.split(/[\\/]/).pop() || t("选择 .onnx…")}
                  </button>
                </label>
              </>
            )}
            <Range
              label={t("语速")}
              min={0.5}
              max={3}
              step={0.05}
              value={voice.rate}
              suffix="×"
              onChange={(rate) => updateVoice({ rate })}
            />
            {voice.engine === "neural" &&
            ["pocket-en", "zipvoice-distill"].includes(voice.modelId) ? (
              <p className="help">
                {t("此模型的语速通过保持音调的播放变速调整。")}
              </p>
            ) : null}
            <Range
              label={t("音高")}
              min={-50}
              max={50}
              step={1}
              value={voice.pitch}
              suffix=" Hz"
              disabled={voice.engine !== "edge"}
              onChange={(pitch) => updateVoice({ pitch })}
            />
            <Range
              label={t("音量")}
              min={0}
              max={100}
              value={Math.round(voice.volume * 100)}
              suffix="%"
              onChange={(volume) => updateVoice({ volume: volume / 100 })}
            />
            <label className="setting-row">
              <span>{t("睡眠定时")}</span>
              <select
                aria-label={t("睡眠定时")}
                value={voice.sleep}
                onChange={(e) => updateVoice({ sleep: Number(e.target.value) })}
              >
                {[0, 5, 10, 15, 30, 45, 60, 90].map((n) => (
                  <option key={n} value={n}>
                    {n ? t("{0} 分钟后停止", [n]) : t("不使用")}
                  </option>
                ))}
              </select>
            </label>
            <div className="setting-row">
              <span>{t("阅读页面跟随朗读")}</span>
              <Switch
                label={t("阅读页面跟随朗读")}
                checked={voice.follow}
                onChange={(follow) => updateVoice({ follow })}
              />
            </div>
            <button
              className="primary preview-button"
              onClick={onPreview}
              disabled={
                voice.engine === "neural" &&
                !models.some((m) => m.id === voice.modelId && m.installed)
              }
            >
              <Volume2 size={16} />
              {t("试听声音")}
            </button>
            <p className="help">
              {t(
                "系统与 Edge 可按返回的词时间点高亮字幕。本地模型和 macOS 系统语音按实际音频逐句切换。",
              )}
            </p>
            <ModelManager
              onError={onError}
              onUse={(m) =>
                updateVoice({
                  engine: "neural",
                  modelId: m.id,
                  voice: String(m.defaultVoice),
                })
              }
            />
          </>
        ) : tab === "subtitles" ? (
          <>
            <h3>{t("桌面字幕")}</h3>
            <div
              className="subtitle-preview"
              style={{
                background: `rgba(30,28,26,${Math.max(0.5, subtitle.background)})`,
                color: subtitle.color,
                fontFamily: subtitle.font,
              }}
            >
              <span>{t("把阅读，留在生活里。")}</span>
              <strong style={{ color: subtitle.activeColor }}>
                {t("随时抬头，接着听下去。")}
              </strong>
            </div>
            <Range
              label={t("字号")}
              min={16}
              max={64}
              value={subtitle.size}
              suffix=" px"
              onChange={(size) => updateSubtitle({ size })}
            />
            <Range
              label={t("背景不透明度")}
              min={0}
              max={90}
              value={Math.round(subtitle.background * 100)}
              suffix="%"
              onChange={(background) =>
                updateSubtitle({ background: background / 100 })
              }
            />
            <Range
              label={t("文字描边")}
              min={0}
              max={4}
              step={0.5}
              value={subtitle.outline}
              suffix=" px"
              onChange={(outline) => updateSubtitle({ outline })}
            />
            <label className="setting-row">
              <span>{t("字幕行数")}</span>
              <select
                aria-label={t("字幕行数")}
                value={subtitle.lines}
                onChange={(e) =>
                  updateSubtitle({ lines: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 4].map((n) => (
                  <option value={n} key={n}>
                    {t("{0} 行", [n])}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-row">
              <span>{t("字体")}</span>
              <select
                aria-label={t("字幕字体")}
                value={subtitle.font}
                onChange={(e) => updateSubtitle({ font: e.target.value })}
              >
                <option value="sans-serif">{t("系统黑体")}</option>
                <option value="serif">{t("宋体")}</option>
                <option value="monospace">{t("等宽字体")}</option>
              </select>
            </label>
            <label className="setting-row">
              <span>{t("对齐方式")}</span>
              <select
                aria-label={t("字幕对齐方式")}
                value={subtitle.align}
                onChange={(e) =>
                  updateSubtitle({
                    align: e.target.value as SubtitleSettings["align"],
                  })
                }
              >
                <option value="center">{t("居中")}</option>
                <option value="left">{t("左对齐")}</option>
              </select>
            </label>
            <div className="setting-row">
              <span>{t("文字 / 当前词颜色")}</span>
              <div className="colors">
                <input
                  type="color"
                  aria-label={t("字幕文字颜色")}
                  value={subtitle.color}
                  onChange={(e) => updateSubtitle({ color: e.target.value })}
                />
                <input
                  type="color"
                  aria-label={t("字幕高亮颜色")}
                  value={subtitle.activeColor}
                  onChange={(e) =>
                    updateSubtitle({ activeColor: e.target.value })
                  }
                />
              </div>
            </div>
            <button className="primary preview-button" onClick={onShowOverlay}>
              <Monitor size={16} />
              {t("显示桌面字幕")}
            </button>
            <p className="help">
              {t(
                "拖动字幕移动位置，拖动窗口边缘调整大小。锁定后鼠标穿透；按 Ctrl / ⌘ + Shift + L 解锁。字幕始终置顶，设置仅作用于字幕。",
              )}
            </p>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
