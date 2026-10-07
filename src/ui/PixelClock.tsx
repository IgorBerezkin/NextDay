import { useEffect, useMemo, useRef } from "react";
import { COLORS, type IconName } from "./icons";
import { iconRuns } from "./Px";

export const CLOCK_PX = 200;
export const CENTER = CLOCK_PX / 2;
export const MARK_R = 76;
const DIAL_R = 64;
const ORBIT_R = 88;

export type Tone = "done" | "now" | "next" | "todo";
export type ClockMark = { hour: number; label: string; tone: Tone };

const DIGITS = [
  "111101101101111",
  "010110010010111",
  "111001111100111",
  "111001011001111",
  "101101111001001",
  "111100111001111",
  "111100111101111",
  "111001001010010",
  "111101111101111",
  "111101111001111",
];
const TONES: Record<Tone, string> = { done: COLORS.g, now: COLORS.c, next: COLORS.y, todo: COLORS.e };
const STAR_LEVELS = [COLORS.m, COLORS.d, COLORS.e, COLORS.w];

type Star = { x: number; y: number; period: number; phase: number; big: boolean };
type Ctx = CanvasRenderingContext2D;

export function polar(r: number, turn: number): [number, number] {
  const a = turn * Math.PI * 2;
  return [CENTER + r * Math.sin(a), CENTER - r * Math.cos(a)];
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function digits(ctx: Ctx, s: string, cx: number, cy: number, color: string) {
  let x = Math.round(cx - (s.length * 4 - 1) / 2);
  const y = Math.round(cy - 2.5);
  ctx.fillStyle = color;
  for (const ch of s) {
    const bits = DIGITS[Number(ch)] ?? "";
    for (let i = 0; i < 15; i++) if (bits[i] === "1") ctx.fillRect(x + (i % 3), y + Math.floor(i / 3), 1, 1);
    x += 4;
  }
}

function line(ctx: Ctx, to: [number, number], size: number, color: string) {
  let x0 = CENTER;
  let y0 = CENTER;
  const x1 = Math.round(to[0]);
  const y1 = Math.round(to[1]);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  const o = Math.floor(size / 2);
  let err = dx + dy;
  ctx.fillStyle = color;
  for (;;) {
    ctx.fillRect(x0 - o, y0 - o, size, size);
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

function sprite(ctx: Ctx, name: IconName, at: [number, number], scale: number) {
  const x0 = Math.round(at[0] - 6 * scale);
  const y0 = Math.round(at[1] - 6 * scale);
  for (const r of iconRuns(name)) rect(ctx, x0 + r.x * scale, y0 + r.y * scale, r.w * scale, scale, r.fill);
}

function makeStars(): Star[] {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out: Star[] = [];
  while (out.length < 80) {
    const x = Math.floor(rnd() * CLOCK_PX);
    const y = Math.floor(rnd() * CLOCK_PX);
    if (Math.hypot(x - CENTER, y - CENTER) < DIAL_R + 3) continue;
    out.push({ x, y, period: 1.4 + rnd() * 2.6, phase: rnd(), big: rnd() < 0.12 });
  }
  return out;
}

function layer(draw: (ctx: Ctx) => void) {
  const c = document.createElement("canvas");
  c.width = CLOCK_PX;
  c.height = CLOCK_PX;
  draw(c.getContext("2d")!);
  return c;
}

function background() {
  return layer((ctx) => {
    rect(ctx, 0, 0, CLOCK_PX, CLOCK_PX, COLORS.k);
    for (let i = 0; i < 90; i++) {
      const [x, y] = polar(ORBIT_R, i / 90);
      rect(ctx, Math.round(x), Math.round(y), 1, 1, COLORS.m);
    }
  });
}

function dial() {
  return layer((ctx) => {
    for (let y = 0; y < CLOCK_PX; y++)
      for (let x = 0; x < CLOCK_PX; x++) {
        const d = Math.hypot(x + 0.5 - CENTER, y + 0.5 - CENTER);
        if (d > DIAL_R) continue;
        rect(ctx, x, y, 1, 1, d > DIAL_R - 3 ? COLORS.k : d > DIAL_R - 4 ? COLORS.e : COLORS.h);
      }
    for (let h = 0; h < 12; h++) {
      const major = h % 3 === 0;
      for (let r = DIAL_R - (major ? 12 : 10); r <= DIAL_R - 6; r++) {
        const [x, y] = polar(r, h / 12);
        const s = major ? 2 : 1;
        rect(ctx, Math.round(x - s / 2), Math.round(y - s / 2), s, s, major ? COLORS.k : COLORS.d);
      }
      const [nx, ny] = polar(DIAL_R - 20, h / 12);
      digits(ctx, String(h === 0 ? 12 : h), nx, ny, COLORS.m);
    }
  });
}

function mark(ctx: Ctx, m: ClockMark, blink: boolean) {
  const [x, y] = polar(MARK_R, (m.hour % 12) / 12);
  const w = m.label.length * 4 + 3;
  const h = 9;
  const x0 = Math.round(x - w / 2);
  const y0 = Math.round(y - h / 2);
  rect(ctx, x0, y0 - 1, w, 1, COLORS.w);
  rect(ctx, x0, y0 + h, w, 1, COLORS.w);
  rect(ctx, x0 - 1, y0, 1, h, COLORS.w);
  rect(ctx, x0 + w, y0, 1, h, COLORS.w);
  const lit = (m.tone === "now" || m.tone === "next") && blink;
  rect(ctx, x0, y0, w, h, lit ? COLORS.w : TONES[m.tone]);
  digits(ctx, m.label, x0 + w / 2, y0 + h / 2, COLORS.k);
}

function frame(ctx: Ctx, layers: { bg: HTMLCanvasElement; dial: HTMLCanvasElement; stars: Star[] }, now: Date, marks: ClockMark[]) {
  const t = now.getTime() / 1000;
  ctx.drawImage(layers.bg, 0, 0);
  for (const s of layers.stars) {
    const level = Math.floor(((((t / s.period + s.phase) % 1) + 1) % 1) * 4);
    const color = STAR_LEVELS[level];
    rect(ctx, s.x, s.y, 1, 1, color);
    if (s.big && level >= 2) {
      rect(ctx, s.x - 1, s.y, 3, 1, color);
      rect(ctx, s.x, s.y - 1, 1, 3, color);
    }
  }
  ctx.drawImage(layers.dial, 0, 0);
  const blink = Math.floor(t / 0.6) % 2 === 0;
  for (const m of marks) mark(ctx, m, blink);
  const h = now.getHours();
  const min = now.getMinutes();
  const sec = now.getSeconds();
  line(ctx, polar(38, ((h % 12) + min / 60) / 12), 3, COLORS.k);
  line(ctx, polar(50, (min + sec / 60) / 60), 2, COLORS.n);
  rect(ctx, CENTER - 2, CENTER - 2, 4, 4, COLORS.r);
  const turn = (h + min / 60 + sec / 3600) / 24 - 0.5;
  sprite(ctx, "sunColor", polar(ORBIT_R, turn), 2);
  sprite(ctx, "moonColor", polar(ORBIT_R, turn + 0.5), 2);
}

export function PixelClock({ now, marks, scale }: { now: Date; marks: ClockMark[]; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const layers = useMemo(() => ({ bg: background(), dial: dial(), stars: makeStars() }), []);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) frame(ctx, layers, now, marks);
  }, [layers, now, marks]);
  return (
    <canvas
      ref={ref}
      className="pixel-clock"
      width={CLOCK_PX}
      height={CLOCK_PX}
      style={{ width: CLOCK_PX * scale, height: CLOCK_PX * scale }}
    />
  );
}
