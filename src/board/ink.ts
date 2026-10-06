import { INK_H, INK_W } from "./model";

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
  if (x < 0 || y < 0 || x >= INK_W || y >= INK_H) return false;
  const img = ctx.getImageData(0, 0, INK_W, INK_H);
  const d = img.data;
  const at = (i: number) => d[i * 4] | (d[i * 4 + 1] << 8) | (d[i * 4 + 2] << 16) | (d[i * 4 + 3] << 24);
  const start = y * INK_W + x;
  const target = at(start);
  const [r, g, b, a] = rgba(hex);
  const fill = r | (g << 8) | (b << 16) | (a << 24);
  if (target === fill) return false;
  const stack = [start];
  const seen = new Uint8Array(INK_W * INK_H);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    if (at(i) !== target) continue;
    d[i * 4] = r;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = b;
    d[i * 4 + 3] = a;
    const px = i % INK_W;
    if (px > 0) stack.push(i - 1);
    if (px < INK_W - 1) stack.push(i + 1);
    if (i >= INK_W) stack.push(i - INK_W);
    if (i < INK_W * (INK_H - 1)) stack.push(i + INK_W);
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

export function inkEmpty(ctx: CanvasRenderingContext2D): boolean {
  const d = ctx.getImageData(0, 0, INK_W, INK_H).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
  return true;
}

export function loadInk(ctx: CanvasRenderingContext2D, src: string): Promise<void> {
  ctx.clearRect(0, 0, INK_W, INK_H);
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
