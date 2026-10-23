import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import ePub, { EpubCFI } from "epubjs";
import type Book from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";
import type { Location } from "epubjs/types/rendition";
import type Contents from "epubjs/types/contents";
import type { ReaderHandle, ReaderProps, Toc, SearchHit } from "./engine";
import type { Sentence } from "../types";
import { themes, fontFamilies } from "../defaults";
import { sectionSentences } from "./text";

function point(cfi: string) {
  const value = new EpubCFI(cfi);
  value.collapse(true);
  return value.toString();
}
export const EpubView = forwardRef<ReaderHandle, ReaderProps>(
  function EpubView(props, ref) {
    const container = useRef<HTMLDivElement>(null);
    const bookRef = useRef<Book | null>(null);
    const renditionRef = useRef<Rendition | null>(null);
    const latest = useRef(props);
    latest.current = props;
    const locationRef = useRef<Location | null>(null);
    const cache = useRef(new Map<number, Sentence[]>());
    const speechCfi = useRef<string | null>(null);
    const locationsReady = useRef(false);
    const userNavigation = useRef(false);
    const interacted = useRef(false);
    const [rendered, setRendered] = useState(false);

    const sentences = async (index: number) => {
      if (cache.current.has(index)) return cache.current.get(index)!;
      const book = bookRef.current;
      const section = book?.spine.get(index);
      if (!book || !section) return [];
      await section.load(book.load.bind(book));
      const result = sectionSentences(section);
      cache.current.set(index, result);
      if (cache.current.size > 4)
        cache.current.delete(cache.current.keys().next().value!);
      return result;
    };
    const clearSpeech = () => {
      if (speechCfi.current)
        renditionRef.current?.annotations.remove(
          speechCfi.current,
          "highlight",
        );
      speechCfi.current = null;
    };
    const navigate = async (target: { cfi?: string; href?: string }) => {
      if (target.cfi || target.href) {
        userNavigation.current = interacted.current = true;
        await renditionRef.current?.display(
          target.cfi ? point(target.cfi) : target.href,
        );
      }
    };
    useImperativeHandle(ref, () => ({
      next() {
        userNavigation.current = interacted.current = true;
        return renditionRef.current
          ?.next()
          .catch((e) => latest.current.onError(String(e)));
      },
      previous() {
        userNavigation.current = interacted.current = true;
        return renditionRef.current
          ?.prev()
          .catch((e) => latest.current.onError(String(e)));
      },
      async seek(progress) {
        const book = bookRef.current;
        if (!book) return;
        userNavigation.current = interacted.current = true;
        if (locationsReady.current)
          await renditionRef.current?.display(
            book.locations.cfiFromPercentage(progress),
          );
        else {
          const count = (book.spine as unknown as { spineItems: unknown[] })
            .spineItems.length;
          await renditionRef.current?.display(
            Math.min(count - 1, Math.floor(progress * count)),
          );
        }
      },
      navigate,
      sentences,
      clearSpeech,
      async current() {
        const location = locationRef.current;
        if (!location) return null;
        const values = await sentences(location.start.index);
        const compare = new EpubCFI();
        const index = values.findIndex(
          (s) =>
            s.cfi && compare.compare(point(s.cfi), location.start.cfi) >= 0,
        );
        return (
          values[index >= 0 ? index : Math.max(0, values.length - 1)] || {
            text: "",
            spine: location.start.index,
            index: -1,
          }
        );
      },
      async advance(sentence, direction) {
        const values = await sentences(sentence.spine);
        if (values[sentence.index + direction])
          return values[sentence.index + direction];
        const count =
          (bookRef.current?.spine as unknown as { spineItems: unknown[] })
            ?.spineItems.length || 0;
        for (
          let index = sentence.spine + direction;
          index >= 0 && index < count;
          index += direction
        ) {
          const next = await sentences(index);
          if (next.length)
            return direction > 0 ? next[0] : next[next.length - 1];
        }
        return null;
      },
      async follow(sentence) {
        clearSpeech();
        if (!sentence.cfi) return;
        await navigate(sentence);
        renditionRef.current?.annotations.highlight(
          sentence.cfi,
          {},
          undefined,
          "spoken-sentence",
          {
            fill: "#e89a35",
            "fill-opacity": ".22",
            "mix-blend-mode": "multiply",
          },
        );
        speechCfi.current = sentence.cfi;
      },
      async search(query, cancelled) {
        const book = bookRef.current;
        if (!book || !query.trim()) return [];
        const count = (book.spine as unknown as { spineItems: unknown[] })
          .spineItems.length;
        const hits: SearchHit[] = [];
        for (let i = 0; i < count && !cancelled() && hits.length < 100; i++) {
          const section = book.spine.get(i);
          await section.load(book.load.bind(book));
          const result = section.find(query) as unknown as {
            cfi: string;
            excerpt: string;
          }[];
          hits.push(...result.map((r) => ({ cfi: r.cfi, excerpt: r.excerpt })));
          if (i !== locationRef.current?.start.index) section.unload();
        }
        return hits.slice(0, 100);
      },
    }));
    const applyTheme = () => {
      const rendition = renditionRef.current;
      if (!rendition) return;
      const s = latest.current.settings;
      const t = themes[s.theme];
      rendition.themes.default({
        body: {
          color: `${t.fg} !important`,
          background: `${t.bg} !important`,
          "font-family": `${fontFamilies[s.font] || fontFamilies.serif} !important`,
          "font-size": `${s.size}px !important`,
          "line-height": `${s.lineHeight} !important`,
          "letter-spacing": `${s.letterSpacing}px !important`,
          "font-weight": s.theme === "bold" ? "600 !important" : "normal",
          "text-align": `${s.alignment} !important`,
          padding:
            (bookRef.current?.packaging?.metadata?.layout === "pre-paginated"
              ? "0"
              : "0 30px") + " !important",
        },
        p: {
          "font-size": "1em !important",
          "line-height": `${s.lineHeight} !important`,
          "margin-bottom": `${s.paragraphSpacing}em !important`,
        },
        "h1,h2,h3": { "line-height": "1.5 !important" },
        a: { color: "inherit" },
      });
      rendition.themes.fontSize(s.size + "px");
    };
    useEffect(() => {
      let disposed = false;
      const book = ePub();
      bookRef.current = book;
      cache.current.clear();
      locationsReady.current = false;
      const setup = async () => {
        const buffer = props.bytes.slice().buffer as ArrayBuffer;
        await book.open(buffer, "binary");
        if (disposed || !container.current) return;
        book.spine.hooks.content.register((doc: Document) => {
          // Keep element positions intact for imported CFIs while making scripts inert.
          doc
            .querySelectorAll("script")
            .forEach((node) =>
              node.setAttribute("type", "application/reader-disabled"),
            );
          doc.querySelectorAll("*").forEach((node) => {
            for (const attr of [...node.attributes])
              if (attr.name.toLowerCase().startsWith("on"))
                node.removeAttribute(attr.name);
          });
        });
        const rendition = book.renderTo(container.current, {
          width: "100%",
          height: "100%",
          spread: latest.current.settings.spread ? "auto" : "none",
          minSpreadWidth: 900,
          flow: latest.current.settings.scroll ? "scrolled-doc" : "paginated",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;
        rendition.hooks.content.register((contents: Contents) => {
          for (const event of ["wheel", "touchmove"])
            contents.document.addEventListener(
              event,
              () => {
                if (latest.current.settings.scroll)
                  userNavigation.current = interacted.current = true;
              },
              { passive: true },
            );
          contents.document.addEventListener("keydown", (event) => {
            if (
              event.code === "Space" ||
              event.key === "Escape" ||
              ((event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "f")
            ) {
              event.preventDefault();
              latest.current.onShortcut?.(
                event.code === "Space"
                  ? "play"
                  : event.key === "Escape"
                    ? "escape"
                    : "find",
              );
              return;
            }
            if (
              ["ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(
                event.key,
              )
            ) {
              event.preventDefault();
              latest.current.onArrow(
                ["ArrowRight", "PageDown"].includes(event.key) ? 1 : -1,
              );
            }
          });
          contents.document.addEventListener(
            "click",
            (event) => {
              const link = (event.target as Element).closest?.("a");
              if (link) userNavigation.current = interacted.current = true;
              if (
                link &&
                /^(https?:|mailto:|javascript:)/i.test(
                  link.getAttribute("href") || "",
                )
              ) {
                event.preventDefault();
                event.stopPropagation();
              }
            },
            true,
          );
        });
        const nav = await book.loaded.navigation;
        const flatten = (items: typeof nav.toc, depth = 0): Toc[] =>
          items.flatMap((item) => [
            { id: item.id, label: item.label.trim(), href: item.href, depth },
            ...flatten(item.subitems || [], depth + 1),
          ]);
        latest.current.onToc(flatten(nav.toc));
        applyTheme();
        rendition.on("selected", async (cfi: string) => {
          try {
            const range = await book.getRange(cfi);
            latest.current.onSelection({ cfi, text: range.toString().trim() });
          } catch {}
        });
        let initialDisplay = true;
        const report = (location: Location) => {
          locationRef.current = location;
          if (initialDisplay || disposed) return;
          const fraction = locationsReady.current
            ? book.locations.percentageFromCfi(location.start.cfi)
            : latest.current.initial.progress;
          const persist = userNavigation.current;
          userNavigation.current = false;
          latest.current.onLocation(
            {
              cfi: location.start.cfi,
              progress: Math.max(0, Math.min(1, fraction || 0)),
              label: `${location.start.displayed.page} / ${location.start.displayed.total} · 本章${locationsReady.current ? "" : "（正在索引）"}`,
            },
            persist,
          );
        };
        rendition.on("relocated", report);
        const initial = latest.current.initial.cfi || latest.current.appleCfi;
        let exact = false;
        if (initial) {
          try {
            await rendition.display(point(initial));
            exact = true;
          } catch {
            await rendition.display();
            latest.current.onError(
              "原阅读位置与此 EPUB 不匹配，正在按导出进度定位",
            );
          }
        } else await rendition.display();
        if (disposed) return;
        initialDisplay = false;
        // A restored CFI takes precedence over approximate percentage import.
        if (exact || latest.current.initial.progress === 0) {
          const current = rendition.location;
          if (current?.start) report(current);
        }
        latest.current.onReady();
        setRendered(true);
        (book.locations as unknown as { pause: number }).pause = 5;
        await book.locations.generate(150);
        if (disposed) return;
        locationsReady.current = true;
        if (
          !exact &&
          !interacted.current &&
          latest.current.initial.progress > 0
        )
          await rendition.display(
            book.locations.cfiFromPercentage(latest.current.initial.progress),
          );
        if (rendition.location?.start) report(rendition.location);
      };
      setup().catch((e) => {
        if (!disposed)
          latest.current.onError(`无法打开 EPUB：${e.message || e}`);
      });
      return () => {
        disposed = true;
        bookRef.current = null;
        renditionRef.current = null;
        try {
          book.destroy();
        } catch {}
      };
    }, [props.bookId, props.bytes]);
    useEffect(() => {
      const rendition = renditionRef.current;
      if (!rendition) return;
      const cfi = locationRef.current?.start.cfi;
      applyTheme();
      if (cfi)
        requestAnimationFrame(() => rendition.display(cfi).catch(() => {}));
    }, [
      props.settings.theme,
      props.settings.font,
      props.settings.size,
      props.settings.lineHeight,
      props.settings.letterSpacing,
      props.settings.paragraphSpacing,
      props.settings.alignment,
    ]);
    useEffect(() => {
      const rendition = renditionRef.current;
      if (!rendition) return;
      const cfi = locationRef.current?.start.cfi;
      rendition.spread(props.settings.spread ? "auto" : "none", 900);
      if (cfi) rendition.display(cfi).catch(() => {});
    }, [props.settings.spread]);
    useEffect(() => {
      const rendition = renditionRef.current;
      if (!rendition) return;
      const cfi = locationRef.current?.start.cfi;
      rendition.flow(props.settings.scroll ? "scrolled-doc" : "paginated");
      if (cfi) rendition.display(cfi).catch(() => {});
    }, [props.settings.scroll]);
    useEffect(() => {
      const rendition = renditionRef.current;
      if (!rendition) return;
      const cfis: string[] = [];
      for (const mark of props.marks.filter(
        (m) => m.type === "highlight" && !m.deleted && m.cfi,
      )) {
        try {
          rendition.annotations.highlight(
            mark.cfi!,
            {},
            undefined,
            "book-highlight",
            { fill: "#efc74a", "fill-opacity": ".3" },
          );
          cfis.push(mark.cfi!);
        } catch {}
      }
      return () => {
        for (const cfi of cfis)
          try {
            rendition.annotations.remove(cfi, "highlight");
          } catch {}
      };
    }, [props.marks, rendered]);
    return <div className="epub-container" ref={container} />;
  },
);
