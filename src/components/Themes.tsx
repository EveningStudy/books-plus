import { t, useLocale } from "../i18n";
import type { ReadSettings } from "../types";
import { themes } from "../defaults";
import { Check, Minus, Plus } from "lucide-react";
import { Range, Switch, IconButton } from "./Primitives";
export function Themes({
  settings: s,
  onChange,
}: {
  settings: ReadSettings;
  onChange: (s: ReadSettings) => void;
}) {
  useLocale();
  const update = (patch: Partial<ReadSettings>) => onChange({ ...s, ...patch });
  return (
    <div className="theme-popover" role="dialog" aria-label={t("主题与设置")}>
      <div className="text-size">
        <IconButton
          label={t("减小字号")}
          disabled={s.size <= 14}
          onClick={() => update({ size: Math.max(14, s.size - 1) })}
        >
          <span style={{ fontSize: 15 }}>A</span>
        </IconButton>
        <input
          aria-label={t("阅读字号")}
          type="range"
          min={14}
          max={38}
          value={s.size}
          onChange={(e) => update({ size: Number(e.target.value) })}
        />
        <IconButton
          label={t("增大字号")}
          disabled={s.size >= 38}
          onClick={() => update({ size: Math.min(38, s.size + 1) })}
        >
          <span style={{ fontSize: 24 }}>A</span>
        </IconButton>
      </div>
      <div className="theme-grid">
        {Object.entries(themes).map(([id, theme]) => (
          <button
            aria-label={t("{0}主题", [t(theme.name)])}
            aria-pressed={s.theme === id}
            key={id}
            className={s.theme === id ? "selected" : ""}
            onClick={() => update({ theme: id as ReadSettings["theme"] })}
          >
            <span style={{ background: theme.bg, color: theme.fg }}>
              {s.theme === id ? <Check /> : "Aa"}
            </span>
            <small>{t(theme.name)}</small>
          </button>
        ))}
      </div>
      <label className="setting-row">
        <span>{t("翻页效果")}</span>
        <select
          aria-label={t("翻页效果")}
          value={s.pageTurn}
          disabled={s.scroll}
          onChange={(e) =>
            update({ pageTurn: e.target.value as ReadSettings["pageTurn"] })
          }
        >
          <option value="curl">{t("拟真卷页")}</option>
          <option value="slide">{t("滑动")}</option>
          <option value="fade">{t("淡入淡出")}</option>
          <option value="none">{t("无动画")}</option>
        </select>
      </label>
      <Range
        label={t("翻页时长")}
        min={250}
        max={1000}
        step={50}
        value={s.turnDuration}
        suffix=" ms"
        disabled={s.scroll || s.pageTurn === "none"}
        onChange={(turnDuration) => update({ turnDuration })}
      />
      {s.scroll ? (
        <p className="help">{t("垂直滚动时不播放翻页动画。")}</p>
      ) : null}
      <label className="setting-row">
        <span>{t("字体")}</span>
        <select
          value={s.font}
          aria-label={t("阅读字体")}
          onChange={(e) => update({ font: e.target.value })}
        >
          <option value="serif">{t("宋体 / 衬线体")}</option>
          <option value="sans">{t("黑体 / 无衬线体")}</option>
          <option value="georgia">Georgia</option>
          <option value="kai">{t("楷体")}</option>
        </select>
      </label>
      <Range
        label={t("行间距")}
        min={1.2}
        max={2.6}
        step={0.1}
        value={s.lineHeight}
        onChange={(lineHeight) => update({ lineHeight })}
      />
      <Range
        label={t("字间距")}
        min={0}
        max={4}
        step={0.2}
        value={s.letterSpacing}
        onChange={(letterSpacing) => update({ letterSpacing })}
      />
      <Range
        label={t("段落间距")}
        min={0}
        max={2}
        step={0.1}
        value={s.paragraphSpacing}
        onChange={(paragraphSpacing) => update({ paragraphSpacing })}
      />
      <Range
        label={t("页面亮度")}
        min={0.4}
        max={1}
        step={0.05}
        value={s.brightness}
        onChange={(brightness) => update({ brightness })}
      />
      <div className="setting-row">
        <span>{t("允许双页显示")}</span>
        <Switch
          label={t("允许双页显示")}
          checked={s.spread}
          onChange={(spread) => update({ spread })}
        />
      </div>
      <div className="setting-row">
        <span>{t("垂直滚动")}</span>
        <Switch
          label={t("垂直滚动")}
          checked={s.scroll}
          onChange={(scroll) => update({ scroll })}
        />
      </div>
      <label className="setting-row">
        <span>{t("文字对齐")}</span>
        <select
          aria-label={t("阅读文字对齐")}
          value={s.alignment}
          onChange={(e) =>
            update({ alignment: e.target.value as ReadSettings["alignment"] })
          }
        >
          <option value="justify">{t("两端对齐")}</option>
          <option value="left">{t("左对齐")}</option>
        </select>
      </label>
    </div>
  );
}
