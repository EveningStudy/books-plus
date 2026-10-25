import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ReaderHandle, ReaderProps } from "./engine";
import { splitText } from "./text";
import type { Sentence } from "../types";
import { t, useLocale } from "../i18n";
GlobalWorkerOptions.workerSrc = workerUrl;
export const PdfView = forwardRef<ReaderHandle, ReaderProps>(
  function PdfView(props, ref) {
    useLocale();
    const canvas = useRef<HTMLCanvasElement>(null);
    const docRef = useRef<PDFDocumentProxy | null>(null);
    const [page, setPage] = useState(props.initial.page || 1);
    const [width, setWidth] = useState(750);
    const latest = useRef(props);
    latest.current = props;
    const renderTask = useRef<RenderTask | null>(null);
    const userNavigation = useRef(false);
    const pageRef = useRef(page);
    pageRef.current = page;
    const renderWait = useRef<
      { page: number; resolve: () => void; reject: (e: Error) => void }[]
    >([]);
    const turnTo = (target: number) => {
      target = Math.min(docRef.current?.numPages || 1, Math.max(1, target));
      if (target === pageRef.current) return Promise.resolve();
      userNavigation.current = true;
      return new Promise<void>((resolve, reject) => {
        renderWait.current.push({ page: target, resolve, reject });
        setPage(target);
      });
    };
    const textCache = useRef(new Map<number, Sentence[]>());
    const getSentences = async (spine: number) => {
      if (textCache.current.has(spine)) return textCache.current.get(spine)!;
      const doc = docRef.current;
      if (!doc || spine < 0 || spine >= doc.numPages) return [];
      const source = await doc.getPage(spine + 1);
      const content = await source.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("");
      const values = splitText(text).map((part, index) => ({
        text: part.text,
        spine,
        index,
        page: spine + 1,
      }));
      textCache.current.set(spine, values);
      if (textCache.current.size > 8)
        textCache.current.delete(textCache.current.keys().next().value!);
      return values;
    };
    useImperativeHandle(ref, () => ({
      next() {
        return turnTo(pageRef.current + 1);
      },
      previous() {
        return turnTo(pageRef.current - 1);
      },
      async seek(progress) {
        userNavigation.current = true;
        setPage(
          Math.max(
            1,
            Math.round(progress * ((docRef.current?.numPages || 1) - 1)) + 1,
          ),
        );
      },
      async navigate(target) {
        if (target.page) {
          userNavigation.current = true;
          setPage(target.page);
        }
      },
      sentences: getSentences,
      async current() {
        const values = await getSentences(page - 1);
        return values[0] || { text: "", spine: page - 1, index: -1, page };
      },
      async advance(sentence, direction) {
        const values = await getSentences(sentence.spine);
        if (values[sentence.index + direction])
          return values[sentence.index + direction];
        for (
          let i = sentence.spine + direction;
          i >= 0 && i < (docRef.current?.numPages || 0);
          i += direction
        ) {
          const next = await getSentences(i);
          if (next.length)
            return direction > 0 ? next[0] : next[next.length - 1];
        }
        return null;
      },
      async follow(sentence) {
        if (sentence.page && sentence.page !== pageRef.current) {
          userNavigation.current = true;
          setPage(sentence.page);
        }
      },
      clearSpeech() {},
      async search(query, cancelled) {
        const hits = [];
        for (
          let i = 0;
          i < (docRef.current?.numPages || 0) &&
          !cancelled() &&
          hits.length < 100;
          i++
        ) {
          const values = await getSentences(i);
          hits.push(
            ...values
              .filter((s) =>
                s.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
              )
              .map((s) => ({ page: i + 1, excerpt: s.text })),
          );
        }
        return hits.slice(0, 100);
      },
    }));
    useEffect(() => {
      let disposed = false;
      const task = getDocument({
        data: props.bytes.slice(),
        useSystemFonts: true,
      });
      task.promise
        .then(async (doc) => {
          if (disposed) {
            task.destroy();
            return;
          }
          docRef.current = doc;
          const restored = Math.min(
            doc.numPages,
            Math.max(
              1,
              props.initial.page ||
                Math.round(props.initial.progress * (doc.numPages - 1)) + 1,
            ),
          );
          setPage(restored);
          latest.current.onToc(
            Array.from({ length: doc.numPages }, (_, i) => ({
              id: String(i + 1),
              label: `第 ${i + 1} 页`,
              href: String(i + 1),
              depth: 0,
            })),
          );
          setWidth((w) => w + 0.01);
          latest.current.onReady();
        })
        .catch((e) => {
          if (!disposed) latest.current.onError(`无法打开 PDF：${e.message}`);
        });
      const observer = new ResizeObserver((entries) =>
        setWidth(Math.min(1100, entries[0].contentRect.width - 64)),
      );
      if (canvas.current?.parentElement)
        observer.observe(canvas.current.parentElement);
      return () => {
        disposed = true;
        observer.disconnect();
        renderTask.current?.cancel();
        task.destroy();
        docRef.current = null;
        renderWait.current.splice(0).forEach((w) => w.resolve());
      };
    }, [props.bookId, props.bytes]);
    useEffect(() => {
      const doc = docRef.current;
      if (!doc || !canvas.current) return;
      let disposed = false;
      renderTask.current?.cancel();
      doc
        .getPage(page)
        .then(async (source) => {
          if (disposed || !canvas.current) return;
          const viewport = source.getViewport({ scale: 1 });
          const scale = width / viewport.width;
          const ratio = window.devicePixelRatio || 1;
          const sized = source.getViewport({ scale: scale * ratio });
          const node = canvas.current;
          node.width = sized.width;
          node.height = sized.height;
          node.style.width = width + "px";
          node.style.height = sized.height / ratio + "px";
          const task = source.render({
            canvas: node,
            canvasContext: node.getContext("2d")!,
            viewport: sized,
          });
          renderTask.current = task;
          await task.promise;
          if (!disposed) {
            const done = renderWait.current.filter((w) => w.page === page);
            renderWait.current = renderWait.current.filter(
              (w) => w.page !== page,
            );
            done.forEach((w) => w.resolve());
          }
          if (!disposed) {
            const persist = userNavigation.current;
            userNavigation.current = false;
            latest.current.onLocation(
              {
                page,
                progress:
                  doc.numPages > 1 ? (page - 1) / (doc.numPages - 1) : 1,
                label: `${page} / ${doc.numPages} 页`,
              },
              persist,
            );
          }
        })
        .catch((e) => {
          if (!disposed && e.name !== "RenderingCancelledException")
            renderWait.current.splice(0).forEach((w) => w.reject(e));
          if (e.name !== "RenderingCancelledException" && !disposed)
            latest.current.onError(e.message);
        });
      return () => {
        disposed = true;
        renderTask.current?.cancel();
      };
    }, [page, width]);
    return (
      <div
        className={
          "pdf-container" +
          (props.settings.theme === "focus" ? " pdf-dark" : "")
        }
      >
        <canvas ref={canvas} aria-label={t("PDF 第 {0} 页", [page])} />
      </div>
    );
  },
);
