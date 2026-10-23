import { useEffect, useRef, useState } from "react";
import type { ReaderHandle } from "../reader/engine";
import type { Cue, Sentence, VoiceSettings } from "../types";

export function useNarration(options: {
  engine: () => ReaderHandle | null;
  settings: VoiceSettings;
  title: string;
  onSentence: (s: Sentence) => void;
  onError: (message: string) => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const [audio] = useState(() => {
    const player = new Audio();
    player.preload = "auto";
    return player;
  });
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [cue, setCue] = useState<Cue | null>(null);
  const [timing, setTiming] = useState("sentence");
  const current = useRef<Sentence | null>(null);
  const cues = useRef<Cue[]>([]);
  const generation = useRef(0);
  const running = useRef(false);
  const nextSentence = useRef<Sentence | null>(null);
  const deadline = useRef<number | null>(null);
  const loadRef = useRef<(s: Sentence) => Promise<void>>(async () => {});

  const pause = () => {
    generation.current++;
    running.current = false;
    audio.pause();
    setPlaying(false);
    setLoading(false);
  };
  const stop = () => {
    pause();
    audio.removeAttribute("src");
    audio.load();
    current.current = null;
    nextSentence.current = null;
    setSentence(null);
    setCue(null);
    latest.current.engine()?.clearSpeech();
    deadline.current = null;
  };
  const load = async (target: Sentence) => {
    if (!window.reader) return;
    const token = ++generation.current;
    running.current = true;
    audio.pause();
    setPlaying(false);
    setLoading(true);
    setCue(null);
    current.current = target;
    setSentence(target);
    try {
      const settings = latest.current.settings;
      const result = await window.reader.synthesize({
        ...settings,
        text: target.text,
      });
      if (token !== generation.current) return;
      cues.current = result.cues || [];
      setTiming(result.timing);
      audio.src = result.url;
      audio.preservesPitch = true;
      audio.playbackRate = result.playbackRate ?? 1;
      audio.volume = settings.volume;
      if (settings.follow) await latest.current.engine()?.follow(target);
      if (token !== generation.current) return;
      latest.current.onSentence(target);
      await audio.play();
      if (token !== generation.current) {
        audio.pause();
        return;
      }
      setPlaying(true);
      setLoading(false);
      if (settings.sleep && !deadline.current)
        deadline.current = Date.now() + settings.sleep * 60000;
      // Only one sentence ahead; the native worker and cache are reused.
      latest.current
        .engine()
        ?.advance(target, 1)
        .then((next) => {
          if (token !== generation.current) return;
          nextSentence.current = next;
          if (next)
            window
              .reader!.synthesize({
                ...latest.current.settings,
                text: next.text,
              })
              .catch(() => {});
        })
        .catch(() => {});
    } catch (error) {
      if (token !== generation.current) return;
      pause();
      latest.current.onError(
        `朗读失败：${error instanceof Error ? error.message : String(error)}。可以切换到系统离线语音后重试。`,
      );
    }
  };
  loadRef.current = load;
  const toggle = async () => {
    if (running.current) {
      pause();
      return;
    }
    if (current.current && audio.src && !audio.ended && audio.currentTime > 0) {
      try {
        await audio.play();
        running.current = true;
        setPlaying(true);
        if (latest.current.settings.sleep && !deadline.current)
          deadline.current = Date.now() + latest.current.settings.sleep * 60000;
      } catch (e) {
        latest.current.onError(String(e));
      }
      return;
    }
    let first = current.current || (await latest.current.engine()?.current());
    if (first && !first.text)
      first = await latest.current.engine()?.advance(first, 1);
    if (!first) {
      latest.current.onError(
        "此处没有可朗读的文字。扫描版 PDF 需要先进行 OCR。",
      );
      return;
    }
    await load(first);
  };
  const skip = async (direction: number) => {
    const base = current.current || (await latest.current.engine()?.current());
    if (!base) return;
    const next = await latest.current.engine()?.advance(base, direction);
    if (next) await load(next);
    else stop();
  };
  useEffect(() => {
    audio.ontimeupdate = () => {
      const values = cues.current;
      let match: Cue | null = null;
      for (const item of values) {
        if (item.time <= audio.currentTime) match = item;
        else break;
      }
      setCue((previous) =>
        previous?.start === match?.start && previous?.length === match?.length
          ? previous
          : match,
      );
    };
    audio.onended = async () => {
      if (!running.current) return;
      if (deadline.current && Date.now() >= deadline.current) {
        pause();
        return;
      }
      const token = generation.current;
      const next =
        nextSentence.current ||
        (current.current &&
          (await latest.current.engine()?.advance(current.current, 1)));
      if (token !== generation.current) return;
      nextSentence.current = null;
      if (next) await loadRef.current(next);
      else stop();
    };
    audio.onerror = () => {
      if (running.current && audio.getAttribute("src")) {
        pause();
        latest.current.onError("音频无法播放，请重试或更换语音引擎");
      }
    };
    return () => {
      generation.current++;
      running.current = false;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, [audio]);
  useEffect(() => {
    audio.volume = options.settings.volume;
  }, [options.settings.volume, audio]);
  useEffect(() => {
    if (current.current) {
      const wasPlaying = running.current;
      pause();
      audio.removeAttribute("src");
      if (wasPlaying) loadRef.current(current.current);
    }
  }, [
    options.settings.engine,
    options.settings.voice,
    options.settings.rate,
    options.settings.pitch,
    options.settings.modelId,
    options.settings.quality,
    options.settings.threads,
  ]);
  useEffect(() => {
    deadline.current =
      options.settings.sleep && running.current
        ? Date.now() + options.settings.sleep * 60000
        : null;
  }, [options.settings.sleep]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (running.current && deadline.current && Date.now() >= deadline.current)
        pause();
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!navigator.mediaSession) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: options.title,
      artist: "Books Reader",
    });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", () => {
      if (!running.current) toggle();
    });
    navigator.mediaSession.setActionHandler("pause", pause);
    navigator.mediaSession.setActionHandler("nexttrack", () => skip(1));
    navigator.mediaSession.setActionHandler("previoustrack", () => skip(-1));
    return () => {
      for (const key of [
        "play",
        "pause",
        "nexttrack",
        "previoustrack",
      ] as MediaSessionAction[])
        navigator.mediaSession.setActionHandler(key, null);
    };
  }, [playing, options.title]);
  return {
    playing,
    loading,
    sentence,
    cue,
    timing,
    toggle,
    skip,
    pause,
    stop,
    start: load,
  };
}
