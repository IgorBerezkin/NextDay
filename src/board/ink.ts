import { CELL, type Rect } from "./model";

export function stampCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string | null) {
  const o = Math.floor((size - 1) / 2);
  if (color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - o, cy - o, size, size);
  } else {
    ctx.clearRect(cx - o, cy - o, size, size);
  }
}

export function line(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
  color: string | null,
) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    stampCell(ctx, x0, y0, size, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function rgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function flood(ctx: CanvasRenderingContext2D, x: number, y: number, hex: string): boolean {
  const { width: w, height: h } = ctx.canvas;
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const at = (i: number) => d[i * 4] | (d[i * 4 + 1] << 8) | (d[i * 4 + 2] << 16) | (d[i * 4 + 3] << 24);
  const start = y * w + x;
  const target = at(start);
  const [r, g, b, a] = rgba(hex);
  const fill = r | (g << 8) | (b << 16) | (a << 24);
  if (target === fill) return false;
  const stack = [start];
  const seen = new Uint8Array(w * h);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    if (at(i) !== target) continue;
    d[i * 4] = r;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = b;
    d[i * 4 + 3] = a;
    const px = i % w;
    if (px > 0) stack.push(i - 1);
    if (px < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

export function inkEmpty(ctx: CanvasRenderingContext2D): boolean {
  const d = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
  return true;
}

export function inkBounds(ctx: CanvasRenderingContext2D): Rect | null {
  const { width, height } = ctx.canvas;
  const d = ctx.getImageData(0, 0, width, height).data;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (d[(y * width + x) * 4 + 3] !== 0) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  return x1 < 0 ? null : { x: x0 * CELL, y: y0 * CELL, w: (x1 - x0 + 1) * CELL, h: (y1 - y0 + 1) * CELL };
}

export function resizeInk(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const c = ctx.canvas;
  if (c.width === width && c.height === height) return;
  const old = ctx.getImageData(0, 0, c.width, c.height);
  c.width = width;
  c.height = height;
  ctx.putImageData(old, 0, 0);
}

export function loadInk(ctx: CanvasRenderingContext2D, src: string): Promise<void> {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!src) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}
