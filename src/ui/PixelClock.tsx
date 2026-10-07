import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { COLORS, type IconName } from "./icons";
import { iconRuns } from "./Px";
import { BANDS } from "./Sky";

export const CLOCK_PX = 200;
export const CENTER = CLOCK_PX / 2;
export const MARK_R = 76;
const DIAL_R = 64;
const ORBIT_R = 88;
const SWAP_MS = 1200;
const STAR_DENSITY = 0.0024;
const BED_BASE = 100;
const BED_HALO = 9;
const SPARKS = 50;

export type Tone = "done" | "now" | "next" | "todo";
export type ClockMark = { hour: number; label: string; tone: Tone };
export type Slot = { hour: number; label: string };
type Swap = { from: number; to: number; start: number };
export type DayNight = { turn: number; swap: Swap | null; paints: Set<() => void> };

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
const SPARK_COLORS = [COLORS.y, COLORS.c, COLORS.w];
const BED_SHADES = [COLORS.w, "#dfe8ef", "#c3d4e0"];
const DUST_SHADES = ["#6b52a8", "#4c3c8a", "#322b68"];
const DUST_TOP = "#8d72c9";
const DUST_RIM = "#211d4a";
const DUST_PINK = "#9b4f8f";
const DUST_GLOW = "#5d4a9e";

const CLOUD_XL = [
  "..............wwwwww................",
  "..........wwwwwwwwwwww..............",
  "........wwwwwwwwwwwwwww...wwwww.....",
  "......wwwwwwwwwwwwwwwwwwwwwwwwwww...",
  "...wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww.",
  ".wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
  "ewwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwe",
  ".eewwwwwwwwwwwwwwwwwwwwwwwwwwwwwwee.",
  "...eeeeeeeeeeeeeeeeeeeeeeeeeeeeee...",
];
const CLOUD_L = [
  ".........wwww...........",
  "......wwwwwwwww.........",
  "....wwwwwwwwwwwww.www...",
  "..wwwwwwwwwwwwwwwwwwwww.",
  ".wwwwwwwwwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwwwwwwwwwww",
  "ewwwwwwwwwwwwwwwwwwwwwwe",
  ".eeeeeeeeeeeeeeeeeeeeee.",
];
const CLOUD_M = [".....wwww.......", "...wwwwwwww.ww..", ".wwwwwwwwwwwwwww", "wwwwwwwwwwwwwwww", "ewwwwwwwwwwwwwwe", ".eeeeeeeeeeeeee."];
const CLOUD_S = ["...wwww...", ".wwwwwwww.", "wwwwwwwwww", ".eeeeeeee."];
const CLOUDS = [
  { map: CLOUD_L, at: 0.06, x: 40, speed: 1.6 },
  { map: CLOUD_XL, at: 0.14, x: 300, speed: 1.1 },
  { map: CLOUD_S, at: 0.22, x: 150, speed: 2.2 },
  { map: CLOUD_M, at: 0.31, x: 420, speed: 1.4 },
  { map: CLOUD_L, at: 0.42, x: 220, speed: 1.9 },
  { map: CLOUD_S, at: 0.5, x: 60, speed: 1.2 },
  { map: CLOUD_XL, at: 0.6, x: 500, speed: 1.3 },
  { map: CLOUD_M, at: 0.7, x: 110, speed: 2 },
  { map: CLOUD_L, at: 0.8, x: 360, speed: 1.5 },
  { map: CLOUD_S, at: 0.88, x: 260, speed: 1.1 },
  { map: CLOUD_M, at: 0.95, x: 10, speed: 1.7 },
];
const BED: [number, number, number][] = [
  [0, 64, 44],
  [-52, 66, 34],
  [52, 66, 34],
  [-92, 78, 22],
  [92, 78, 22],
  [-26, 84, 30],
  [26, 84, 30],
];

type Star = { x: number; y: number; period: number; phase: number; big: boolean };
type Cloud = { img: HTMLCanvasElement; at: number; x: number; speed: number };
type Ctx = CanvasRenderingContext2D;
type Box = { x: number; y: number; w: number; h: number };
type Sprite = { img: HTMLCanvasElement; box: Box };
type Bed = { cloud: Sprite; dust: Sprite; sparks: Star[] };
type SkyLayers = { w: number; h: number; day: HTMLCanvasElement; night: HTMLCanvasElement; stars: Star[]; clouds: Cloud[]; mix: Ctx };

const parity = (n: number) => ((n % 2) + 2) % 2;
const ease = (k: number) => (1 - Math.cos(Math.PI * k)) / 2;
const nightness = (turn: number) => 1 - Math.abs(parity(turn) - 1);
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function blend(a: string, b: string, k: number) {
  const x = rgb(a);
  const y = rgb(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(",")})`;
}

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

function layer(draw: (ctx: Ctx) => void, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  return c;
}

function bitmap(map: string[]) {
  return layer(
    (ctx) => {
      for (let y = 0; y < map.length; y++)
        for (let x = 0; x < map[y].length; x++) if (map[y][x] !== ".") rect(ctx, x, y, 1, 1, COLORS[map[y][x]]);
    },
    map[0].length,
    map.length,
  );
}

function gradient(w: number, h: number, bands: string[]) {
  return layer(
    (ctx) => {
      for (let y = 0; y < h; y++) {
        const k = ((y + 0.5) / h) * (bands.length - 1);
        const i = Math.min(bands.length - 2, Math.floor(k));
        rect(ctx, 0, y, w, 1, blend(bands[i], bands[i + 1], k - i));
      }
    },
    w,
    h,
  );
}

function makeStars(w: number, h: number): Star[] {
  const rnd = rng(7);
  return Array.from({ length: Math.round(w * h * STAR_DENSITY) }, () => ({
    x: Math.floor(rnd() * w),
    y: Math.floor(rnd() * h),
    period: 1.4 + rnd() * 2.6,
    phase: rnd(),
    big: rnd() < 0.12,
  }));
}

function makeSky(w: number, h: number): SkyLayers {
  return {
    w,
    h,
    day: gradient(w, h, BANDS.day),
    night: gradient(w, h, BANDS.night),
    stars: makeStars(w, h),
    clouds: CLOUDS.map(({ map, ...c }) => ({ ...c, img: bitmap(map) })),
    mix: layer(() => {}, w, h).getContext("2d")!,
  };
}

function depth(x: number, y: number) {
  let d = -Infinity;
  for (const [px, py, r] of BED) d = Math.max(d, r - Math.hypot(x - px, y - py));
  return d;
}

function inBed(x: number, y: number) {
  return y <= BED_BASE && depth(x, y) >= 0;
}

function bedBox(margin: number): Box {
  const x = Math.floor(Math.min(...BED.map(([px, , r]) => px - r))) - margin;
  const y = Math.floor(Math.min(...BED.map(([, py, r]) => py - r))) - margin;
  const w = Math.ceil(Math.max(...BED.map(([px, , r]) => px + r))) + margin - x + 1;
  return { x, y, w, h: BED_BASE + margin - y + 1 };
}

type Shade = (x: number, y: number, gap: number, top: number) => string;

function paintPuffs(ctx: Ctx, box: Box, shade: Shade) {
  for (const [px, py, r] of [...BED].sort((a, b) => a[2] - b[2]))
    for (let y = Math.ceil(py - r); y <= Math.min(BED_BASE, py + r); y++)
      for (let x = Math.ceil(px - r); x <= px + r; x++) {
        if ((x - px) ** 2 + (y - py) ** 2 > r * r) continue;
        const half = Math.sqrt(r * r - (x - px) ** 2);
        rect(ctx, x - box.x, y - box.y, 1, 1, shade(x, y, Math.min(BED_BASE, py + half) - y, y - py + half));
      }
}

function paintBase(ctx: Ctx, box: Box, shade: Shade) {
  for (let x = box.x; x < box.x + box.w; x++)
    if (inBed(x, BED_BASE))
      for (let y = BED_BASE - 6; y <= BED_BASE; y++) if (inBed(x, y)) rect(ctx, x - box.x, y - box.y, 1, 1, shade(x, y, BED_BASE - y, 99));
}

function paintRim(ctx: Ctx, box: Box, color: string) {
  for (let y = box.y; y < box.y + box.h; y++)
    for (let x = box.x; x < box.x + box.w; x++) if (inBed(x, y) && !inBed(x, y + 2)) rect(ctx, x - box.x, y - box.y, 1, 1, color);
}

function cloudBed(): Sprite {
  const box = bedBox(0);
  const img = layer(
    (ctx) => {
      const shade: Shade = (_x, _y, gap) => BED_SHADES[gap < 3 ? 2 : gap < 7 ? 1 : 0];
      paintPuffs(ctx, box, shade);
      paintBase(ctx, box, shade);
      paintRim(ctx, box, COLORS.e);
    },
    box.w,
    box.h,
  );
  return { img, box };
}

function dustBed(): Sprite {
  const box = bedBox(BED_HALO);
  const glow = rgb(DUST_GLOW);
  const img = layer(
    (ctx) => {
      const data = ctx.createImageData(box.w, box.h);
      for (let y = 0; y < box.h; y++)
        for (let x = 0; x < box.w; x++) {
          const out = Math.max(-depth(x + box.x, y + box.y), y + box.y - BED_BASE);
          if (out <= 0 || out >= BED_HALO) continue;
          const i = (y * box.w + x) * 4;
          for (let j = 0; j < 3; j++) data.data[i + j] = glow[j];
          data.data[i + 3] = Math.round(150 * (1 - out / BED_HALO) ** 2 * (0.5 + 0.5 * noise((x + box.x) / 5, (y + box.y) / 4)));
        }
      ctx.putImageData(data, 0, 0);
      const shade: Shade = (x, y, gap, top) => {
        const g = gap + (noise(x / 5, y / 4) - 0.5) * 6;
        if (top < 2 && g >= 7) return DUST_TOP;
        if (g >= 9 && noise(x / 6 + 7, y / 4) > 0.74) return DUST_PINK;
        return DUST_SHADES[g < 3 ? 2 : g < 7 ? 1 : 0];
      };
      paintPuffs(ctx, box, shade);
      paintBase(ctx, box, shade);
      paintRim(ctx, box, DUST_RIM);
    },
    box.w,
    box.h,
  );
  return { img, box };
}

function makeSparks(): Star[] {
  const rnd = rng(11);
  const box = bedBox(4);
  const out: Star[] = [];
  while (out.length < SPARKS) {
    const x = box.x + Math.floor(rnd() * box.w);
    const y = box.y + Math.floor(rnd() * box.h);
    if (Math.max(-depth(x, y), y - BED_BASE) > 3) continue;
    out.push({ x, y, period: 1.2 + rnd() * 2.4, phase: rnd(), big: rnd() < 0.15 });
  }
  return out;
}

function makeBed(): Bed {
  return { cloud: cloudBed(), dust: dustBed(), sparks: makeSparks() };
}

function dial() {
  return layer(
    (ctx) => {
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
    },
    CLOCK_PX,
    CLOCK_PX,
  );
}

function badge(ctx: Ctx, label: string, tone: Tone, cx: number, cy: number, lit: boolean) {
  const w = label.length * 4 + 3;
  const h = 9;
  const x0 = Math.round(cx - w / 2);
  const y0 = Math.round(cy - h / 2);
  rect(ctx, x0, y0 - 1, w, 1, COLORS.w);
  rect(ctx, x0, y0 + h, w, 1, COLORS.w);
  rect(ctx, x0 - 1, y0, 1, h, COLORS.w);
  rect(ctx, x0 + w, y0, 1, h, COLORS.w);
  rect(ctx, x0, y0, w, h, lit ? COLORS.w : TONES[tone]);
  digits(ctx, label, x0 + w / 2, y0 + h / 2, COLORS.k);
}

function mark(ctx: Ctx, m: ClockMark, blink: boolean) {
  const [x, y] = polar(MARK_R, (m.hour % 12) / 12);
  badge(ctx, m.label, m.tone, x, y, (m.tone === "now" || m.tone === "next") && blink);
}

function ring(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  rect(ctx, x + 1, y, w - 2, 1, color);
  rect(ctx, x + 1, y + h - 1, w - 2, 1, color);
  rect(ctx, x, y + 1, 1, h - 2, color);
  rect(ctx, x + w - 1, y + 1, 1, h - 2, color);
}

function slotFrame(ctx: Ctx, slot: Slot) {
  const [x, y] = polar(MARK_R, (slot.hour % 12) / 12);
  const w = slot.label.length * 4 + 3;
  const x0 = Math.round(x - w / 2);
  const y0 = Math.round(y - 4.5);
  ring(ctx, x0 - 4, y0 - 4, w + 8, 17, COLORS.k);
  ring(ctx, x0 - 3, y0 - 3, w + 6, 15, COLORS.y);
}

function drawStars(ctx: Ctx, stars: Star[], t: number) {
  for (const s of stars) {
    const level = Math.floor(((((t / s.period + s.phase) % 1) + 1) % 1) * 4);
    const color = STAR_LEVELS[level];
    rect(ctx, s.x, s.y, 1, 1, color);
    if (s.big && level >= 2) {
      rect(ctx, s.x - 1, s.y, 3, 1, color);
      rect(ctx, s.x, s.y - 1, 1, 3, color);
    }
  }
}

function drawSparks(ctx: Ctx, sparks: Star[], x0: number, y0: number, t: number) {
  sparks.forEach((s, i) => {
    const level = Math.floor(((((t / s.period + s.phase) % 1) + 1) % 1) * 4);
    if (level === 0) return;
    const color = level === 3 ? COLORS.w : SPARK_COLORS[i % SPARK_COLORS.length];
    rect(ctx, x0 + s.x, y0 + s.y, 1, 1, color);
    if (s.big && level === 3) {
      rect(ctx, x0 + s.x - 1, y0 + s.y, 3, 1, color);
      rect(ctx, x0 + s.x, y0 + s.y - 1, 1, 3, color);
    }
  });
}

function drawSprite(ctx: Ctx, sprite: Sprite, at: [number, number]) {
  ctx.drawImage(sprite.img, at[0] + sprite.box.x, at[1] + sprite.box.y);
}

function drawClouds(ctx: Ctx, sky: SkyLayers, t: number) {
  for (const c of sky.clouds) {
    const w = c.img.width;
    const span = sky.w + w;
    ctx.drawImage(c.img, Math.floor((c.x + c.speed * t) % span) - w, Math.round(c.at * sky.h - c.img.height / 2));
  }
}

function drawSky(ctx: Ctx, sky: SkyLayers, bed: Bed, at: [number, number] | null, now: Date, turn: number) {
  const t = now.getTime() / 1000;
  const night = nightness(turn);
  if (night > 0) {
    ctx.drawImage(sky.night, 0, 0);
    drawStars(ctx, sky.stars, t);
    if (at) {
      drawSprite(ctx, bed.dust, at);
      drawSparks(ctx, bed.sparks, at[0], at[1], t);
    }
  }
  if (night >= 1) return;
  const day = night > 0 ? sky.mix : ctx;
  day.drawImage(sky.day, 0, 0);
  drawClouds(day, sky, t);
  if (at) drawSprite(day, bed.cloud, at);
  if (day === ctx) return;
  ctx.globalAlpha = 1 - night;
  ctx.drawImage(day.canvas, 0, 0);
  ctx.globalAlpha = 1;
}

function drawClock(ctx: Ctx, face: HTMLCanvasElement, now: Date, marks: ClockMark[], slot: Slot | null, turn: number) {
  const t = now.getTime() / 1000;
  ctx.clearRect(0, 0, CLOCK_PX, CLOCK_PX);
  ctx.drawImage(face, 0, 0);
  const blink = Math.floor(t / 0.6) % 2 === 0;
  for (const m of marks) mark(ctx, m, blink);
  if (slot) slotFrame(ctx, slot);
  const h = now.getHours();
  const min = now.getMinutes();
  const sec = now.getSeconds();
  line(ctx, polar(38, ((h % 12) + min / 60) / 12), 3, COLORS.k);
  line(ctx, polar(50, (min + sec / 60) / 60), 2, COLORS.n);
  rect(ctx, CENTER - 2, CENTER - 2, 4, 4, COLORS.r);
  const sun = 1 / 8 + turn / 2;
  sprite(ctx, "sunColor", polar(ORBIT_R, sun), 2);
  sprite(ctx, "moonColor", polar(ORBIT_R, sun + 0.5), 2);
}

function swapTarget(from: number, night: boolean) {
  const want = night ? 1 : 0;
  const up = Math.ceil(from);
  const down = Math.floor(from);
  const ahead = parity(up) === want ? up : up + 1;
  const back = parity(down) === want ? down : down - 1;
  return ahead - from <= from - back ? ahead : back;
}

function advance(dn: DayNight, ts: number) {
  const s = dn.swap;
  if (!s) return false;
  const k = Math.max(0, Math.min(1, (ts - s.start) / (SWAP_MS * Math.abs(s.to - s.from))));
  dn.turn = s.from + (s.to - s.from) * ease(k);
  if (k === 1) dn.swap = null;
  return k < 1;
}

export function useDayNight(night: boolean) {
  const ref = useRef<DayNight | null>(null);
  if (!ref.current) ref.current = { turn: night ? 1 : 0, swap: null, paints: new Set() };
  const dn = ref.current;
  useEffect(() => {
    advance(dn, performance.now());
    const to = swapTarget(dn.turn, night);
    dn.swap = to === dn.turn ? null : { from: dn.turn, to, start: performance.now() };
    if (!dn.swap) return;
    let id = 0;
    const step = () => {
      const moving = advance(dn, performance.now());
      dn.paints.forEach((paint) => paint());
      id = moving ? requestAnimationFrame(step) : 0;
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [dn, night]);
  return dn;
}

function usePaints(dn: DayNight, paint: () => void) {
  useEffect(() => {
    dn.paints.add(paint);
    return () => {
      dn.paints.delete(paint);
    };
  }, [dn, paint]);
}

export function PixelClock({
  dn,
  now,
  marks,
  slot,
  scale,
}: {
  dn: DayNight;
  now: Date;
  marks: ClockMark[];
  slot: Slot | null;
  scale: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const face = useMemo(dial, []);
  const latest = useRef({ now, marks, slot });

  const paint = useCallback(() => {
    advance(dn, performance.now());
    const ctx = ref.current?.getContext("2d");
    const v = latest.current;
    if (ctx) drawClock(ctx, face, v.now, v.marks, v.slot, dn.turn);
  }, [dn, face]);

  useEffect(() => {
    latest.current = { now, marks, slot };
    paint();
  }, [now, marks, slot, paint]);
  usePaints(dn, paint);

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

export function ClockSky({ dn, now, scale, anchor }: { dn: DayNight; now: Date; scale: number; anchor: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<{ w: number; h: number; at: [number, number] | null }>({ w: 0, h: 0, at: null });
  const latest = useRef(now);

  useLayoutEffect(() => {
    const screen = ref.current!.parentElement!;
    const fit = () => {
      const s = screen.getBoundingClientRect();
      const a = anchor.current?.getBoundingClientRect();
      const w = Math.ceil(screen.clientWidth / scale);
      const h = Math.ceil(screen.clientHeight / scale);
      const at: [number, number] | null = a
        ? [Math.round((a.left + a.width / 2 - s.left) / scale), Math.round((a.top + a.height / 2 - s.top) / scale)]
        : null;
      setView((v) => (v.w === w && v.h === h && v.at?.[0] === at?.[0] && v.at?.[1] === at?.[1] ? v : { w, h, at }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(screen);
    if (anchor.current) ro.observe(anchor.current);
    return () => ro.disconnect();
  }, [scale, anchor]);

  const { w, h, at } = view;
  const sky = useMemo(() => (w && h ? makeSky(w, h) : null), [w, h]);
  const bed = useMemo(makeBed, []);
  const paint = useCallback(() => {
    advance(dn, performance.now());
    const ctx = ref.current?.getContext("2d");
    if (ctx && sky) drawSky(ctx, sky, bed, at, latest.current, dn.turn);
  }, [dn, sky, bed, at]);

  useEffect(() => {
    latest.current = now;
    paint();
  }, [now, paint]);
  usePaints(dn, paint);

  return <canvas ref={ref} className="clk-sky" width={w} height={h} style={{ width: w * scale, height: h * scale }} />;
}

export function MarkBadge({ label, tone, scale }: { label: string; tone: Tone; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = label.length * 4 + 5;

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, 11);
    badge(ctx, label, tone, w / 2, 5.5, false);
  }, [label, tone, w]);

  return <canvas ref={ref} className="mark-badge" width={w} height={11} style={{ width: w * scale, height: 11 * scale }} />;
}
