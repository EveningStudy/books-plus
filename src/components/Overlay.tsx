import { useEffect, useState } from "react";
import {
  Lock,
  Pause,
  Play,
  Settings2,
  SkipBack,
  SkipForward,
  X,
  GripHorizontal,
  LoaderCircle,
} from "lucide-react";
import type { OverlayState } from "../types";
import { subtitleDefaults } from "../defaults";
import { IconButton } from "./Primitives";
export function Overlay() {
  const [state, setState] = useState<OverlayState>({
    text: "",
    playing: false,
    start: 0,
    length: 0,
    settings: subtitleDefaults,
  });
  const [locked, setLocked] = useState(false);
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    document.documentElement.classList.add("overlay-document");
    const off = window.reader?.onOverlay((value) =>
      setState((previous) => ({ ...previous, ...value })),
    );
    const offLock = window.reader?.onLock(setLocked);
    const resized = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resized);
    window.reader?.overlayState().then((value) => {
      setState((previous) => ({ ...previous, ...value }));
      setLocked(!!value.locked);
    });
    return () => {
      off?.();
      offLock?.();
      window.removeEventListener("resize", resized);
    };
  }, []);
  const s = { ...subtitleDefaults, ...state.settings };
  const capacity = Math.max(
    12,
    Math.floor((width - 65) / s.size) * s.lines - 4,
  );
  const stride = Math.max(8, capacity - 12);
  const begin =
    state.text.length > capacity
      ? Math.max(0, Math.floor(state.start / stride) * stride - 4)
      : 0;
  const text = state.text.slice(begin, begin + capacity);
  const start = Math.max(0, state.start - begin);
  return (
    <main
      className={"desktop-subtitle" + (locked ? " locked" : "")}
      style={
        {
          "--subtitle-size": s.size + "px",
          "--subtitle-color": s.color,
          "--subtitle-active": s.activeColor,
          "--subtitle-outline": s.outline + "px",
          "--subtitle-background": `rgba(25,24,23,${s.background})`,
        } as React.CSSProperties
      }
    >
      <div className="overlay-drag">
        <GripHorizontal size={18} />
      </div>
      <div
        className="subtitle-text"
        style={{
          fontSize: s.size,
          fontFamily: s.font,
          textAlign: s.align,
          WebkitLineClamp: s.lines,
        }}
        aria-live="off"
      >
        {state.text ? (
          <>
            {begin > 0 ? "…" : ""}
            {text.slice(0, start)}
            <mark>{text.slice(start, start + state.length)}</mark>
            {text.slice(start + state.length)}
            {begin + capacity < state.text.length ? "…" : ""}
          </>
        ) : (
          "打开一本书，开始朗读"
        )}
      </div>
      <div className="overlay-controls">
        <IconButton
          label="上一句"
          onClick={() => window.reader?.control("previous")}
        >
          <SkipBack />
        </IconButton>
        <IconButton
          label={state.playing ? "暂停" : "播放"}
          onClick={() => window.reader?.control("toggle")}
        >
          {state.loading ? (
            <LoaderCircle className="spin" />
          ) : state.playing ? (
            <Pause />
          ) : (
            <Play />
          )}
        </IconButton>
        <IconButton
          label="下一句"
          onClick={() => window.reader?.control("next")}
        >
          <SkipForward />
        </IconButton>
        <span />
        <IconButton
          label="字幕设置"
          onClick={() => window.reader?.control("settings")}
        >
          <Settings2 />
        </IconButton>
        <IconButton
          label="锁定并穿透鼠标（Ctrl+Shift+L 解锁）"
          onClick={() => window.reader?.lockOverlay(true)}
        >
          <Lock />
        </IconButton>
        <IconButton
          label="隐藏字幕"
          onClick={() => window.reader?.showOverlay(false)}
        >
          <X />
        </IconButton>
      </div>
    </main>
  );
}
