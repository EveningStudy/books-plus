import { useEffect, useRef } from "react";
import type { ReadSettings } from "../types";
import { themes } from "../defaults";
import { createCurlTexture } from "./curlTexture";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
function load(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}
function texture(image: HTMLImageElement, mirror: boolean) {
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const ctx = c.getContext("2d")!;
  if (mirror) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(image, 0, 0);
  return c;
}
function triangle(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  source: number[][],
  dest: number[][],
) {
  const [[x0, y0], [x1, y1], [x2, y2]] = source,
    [[u0, v0], [u1, v1], [u2, v2]] = dest;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < 0.00001) return;
  const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / det;
  const c = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / det;
  const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det;
  const d = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / det;
  const cx = (u0 + u1 + u2) / 3,
    cy = (v0 + v1 + v2) / 3;
  const clip = [
    [u0, v0],
    [u1, v1],
    [u2, v2],
  ].map(([x, y]) => {
    const length = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / length) * 0.7, y + ((y - cy) / length) * 0.7];
  });
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(clip[0][0], clip[0][1]);
  ctx.lineTo(clip[1][0], clip[1][1]);
  ctx.lineTo(clip[2][0], clip[2][1]);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, u0 - a * x0 - c * y0, v0 - b * x0 - d * y0);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}
function curl(
  ctx: CanvasRenderingContext2D,
  before: HTMLCanvasElement,
  p: number,
  spread: boolean,
  paper: string,
  mesh: ReturnType<typeof createCurlTexture>,
) {
  const w = before.width,
    h = before.height,
    hinge = spread ? w / 2 : 0,
    leaf = w - hinge;
  if (spread) {
    ctx.save();
    ctx.globalAlpha = 1 - Math.max(0, Math.min(1, (p - 0.35) / 0.4));
    ctx.drawImage(before, 0, 0, hinge, h, 0, 0, hinge, h);
    ctx.restore();
  }
  const bend = 0.72 * Math.sin(Math.PI * p),
    count = 56,
    points = [];
  let x = hinge,
    z = 0;
  for (let i = 0; i <= count; i++) {
    const scale = (w * 3) / (w * 3 - z);
    points.push([
      hinge + (x - hinge) * scale,
      h / 2 - (h / 2) * scale,
      h / 2 + (h / 2) * scale,
    ]);
    const theta = Math.PI * p - bend * Math.cos((Math.PI * (i + 0.5)) / count);
    x += (leaf / count) * Math.cos(theta);
    z += (leaf / count) * Math.sin(theta);
  }
  const edge = points[count][0],
    shadow = ctx.createLinearGradient(edge - 40, 0, edge + 55, 0);
  shadow.addColorStop(0, "#0000");
  shadow.addColorStop(0.45, `rgba(0,0,0,${0.2 * Math.sin(Math.PI * p)})`);
  shadow.addColorStop(1, "#0000");
  ctx.fillStyle = shadow;
  ctx.fillRect(edge - 40, 0, 95, h);
  if (mesh) {
    ctx.drawImage(mesh.draw(points, p, hinge, paper), 0, 0);
    return;
  }
  const back = p > 0.5;
  ctx.save();
  if (back) ctx.globalAlpha = Math.min(1, (1 - p) / 0.18);
  for (let i = 0; i < count; i++) {
    const a = points[i],
      b = points[i + 1],
      sx0 = back ? w - (i / count) * leaf : hinge + (i / count) * leaf,
      sx1 = back
        ? w - ((i + 1) / count) * leaf
        : hinge + ((i + 1) / count) * leaf;
    triangle(
      ctx,
      before,
      [
        [sx0, 0],
        [sx1, 0],
        [sx1, h],
      ],
      [
        [a[0], a[1]],
        [b[0], b[1]],
        [b[0], b[2]],
      ],
    );
    triangle(
      ctx,
      before,
      [
        [sx0, 0],
        [sx1, h],
        [sx0, h],
      ],
      [
        [a[0], a[1]],
        [b[0], b[2]],
        [a[0], a[2]],
      ],
    );
  }
  // Shade the whole leaf once: separate translucent strips leave bright seams.
  ctx.beginPath();
  points.forEach((a, i) =>
    i ? ctx.lineTo(a[0], a[1]) : ctx.moveTo(a[0], a[1]),
  );
  for (let i = count; i >= 0; i--) ctx.lineTo(points[i][0], points[i][2]);
  ctx.closePath();
  ctx.clip();
  if (back) {
    ctx.save();
    ctx.globalAlpha *= 0.94;
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  const xs = points.map((a) => a[0]),
    shade = ctx.createLinearGradient(
      Math.min(...xs),
      0,
      Math.max(...xs) + 1,
      0,
    ),
    strength = Math.sin(Math.PI * p);
  shade.addColorStop(0, `rgba(40,27,12,${0.035 * strength})`);
  shade.addColorStop(0.6, `rgba(40,27,12,${0.12 * strength})`);
  shade.addColorStop(1, `rgba(40,27,12,${0.045 * strength})`);
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
export function usePageTurn(
  settings: ReadSettings,
  move: (direction: number) => Promise<void>,
) {
  const latest = useRef({ settings, move });
  latest.current = { settings, move };
  const active = useRef<{
    canvas: HTMLCanvasElement;
    cancelled: boolean;
  } | null>(null);
  const busy = useRef(false);
  const sequence = useRef(0);
  const cancel = () => {
    sequence.current++;
    if (active.current) {
      active.current.cancelled = true;
      active.current.canvas.remove();
      active.current = null;
    }
  };
  useEffect(() => cancel, []);
  const turn = async (direction: number) => {
    if (busy.current) return;
    const { settings: s, move } = latest.current;
    const element = document.querySelector(".reading-canvas");
    if (
      s.scroll ||
      s.pageTurn === "none" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !window.reader ||
      !element
    ) {
      await move(direction);
      return;
    }
    busy.current = true;
    const token = sequence.current;
    let operation: typeof active.current = null,
      moved = false,
      mesh: ReturnType<typeof createCurlTexture> = null;
    try {
      const rect = element.getBoundingClientRect(),
        bounds = {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      const before = await load(await window.reader.capture(bounds));
      if (token !== sequence.current) return;
      const canvas = document.createElement("canvas");
      canvas.width = before.width;
      canvas.height = before.height;
      canvas.className = "page-turn-canvas";
      canvas.dataset.mode = s.pageTurn;
      Object.assign(canvas.style, {
        left: rect.x + "px",
        top: rect.y + "px",
        width: rect.width + "px",
        height: rect.height + "px",
      });
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(before, 0, 0);
      document.body.appendChild(canvas);
      operation = { canvas, cancelled: false };
      active.current = operation;
      moved = true;
      await move(direction);
      await frame();
      await frame();
      if (operation.cancelled) return;
      // Reveal the live, already-rendered next page beneath the old page.
      // Never hide the overlay for a second screenshot: that exposes a flash.
      canvas.dataset.phase = "animating";
      const previous = texture(before, direction < 0),
        w = canvas.width,
        h = canvas.height;
      if (s.pageTurn === "curl") mesh = createCurlTexture(previous);
      const spread = s.spread && rect.width - 88 >= 900;
      const started = performance.now(),
        duration = Math.max(250, Math.min(1000, s.turnDuration || 550));
      await new Promise<void>((resolve) => {
        const draw = (now: number) => {
          if (operation!.cancelled) {
            resolve();
            return;
          }
          const raw = Math.min(1, (now - started) / duration),
            p = raw * raw * (3 - 2 * raw);
          ctx.save();
          ctx.clearRect(0, 0, w, h);
          if (direction < 0) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
          }
          if (s.pageTurn === "curl")
            curl(ctx, previous, p, spread, themes[s.theme].bg, mesh);
          else if (s.pageTurn === "slide") ctx.drawImage(previous, -p * w, 0);
          else {
            ctx.globalAlpha = 1 - p;
            ctx.drawImage(previous, 0, 0);
          }
          ctx.restore();
          if (raw < 1) requestAnimationFrame(draw);
          else resolve();
        };
        requestAnimationFrame(draw);
      });
    } catch {
      if (!moved) await move(direction);
    } finally {
      mesh?.dispose();
      operation?.canvas.remove();
      if (active.current === operation) active.current = null;
      busy.current = false;
    }
  };
  return { turn, cancel };
}
