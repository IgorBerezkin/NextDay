import { ICONS, type IconName } from "../ui/icons";

export const BASE_W = 1280;
export const BASE_H = 800;
export const MAX_W = 5120;
export const MAX_H = 3200;
export const GROW_W = 320;
export const GROW_H = 200;
export const CELL = 4;

export const PALETTE = [
  "#1a1c2c",
  "#5d275d",
  "#b13e53",
  "#ef7d57",
  "#ffcd75",
  "#a7f070",
  "#38b764",
  "#257179",
  "#29366f",
  "#3b5dc9",
  "#41a6f6",
  "#73eff7",
  "#f4f4f4",
  "#94b0c2",
  "#566c86",
  "#333c57",
];

export const TEXT_SIZES = [16, 30, 50] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const TASK_COLOR = 5;

type Base = { id: string; x: number; y: number; w: number; h: number; z: number };
export type NoteItem = Base & { kind: "note"; text: string; color: number; size: TextSize };
export type TaskItem = Base & { kind: "task"; ref: string; title: string; text: string; color: number; size: TextSize };
export type ImageItem = Base & { kind: "image"; src: string; nw: number; nh: number };
export type StickerItem = Base & { kind: "sticker"; icon: IconName };
export type Item = NoteItem | TaskItem | ImageItem | StickerItem;
export type TextItem = NoteItem | TaskItem;

export type Rect = { x: number; y: number; w: number; h: number };
export type Board = { v: 1; w: number; h: number; items: Item[]; ink: string };

export const emptyBoard = (): Board => ({ v: 1, w: BASE_W, h: BASE_H, items: [], ink: "" });

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

const side = (v: unknown, base: number, max: number) => Math.min(max, Math.max(base, Math.round(num(v, base) / CELL) * CELL));

const textSize = (x: Record<string, unknown>): TextSize => {
  const s = num(x.size, x.big ? 50 : 30);
  return TEXT_SIZES.reduce((best, t) => (Math.abs(t - s) < Math.abs(best - s) ? t : best), TEXT_SIZES[1]);
};

export function parseBoard(raw: unknown): Board {
  if (!raw || typeof raw !== "object") return emptyBoard();
  const r = raw as Record<string, unknown>;
  const items: Item[] = [];
  if (Array.isArray(r.items)) {
    for (const x of r.items as Record<string, unknown>[]) {
      if (!x || typeof x !== "object" || typeof x.id !== "string") continue;
      const base = {
        id: x.id,
        x: num(x.x, 0),
        y: num(x.y, 0),
        w: Math.max(12, num(x.w, 200)),
        h: Math.max(12, num(x.h, 120)),
        z: num(x.z, 1),
      };
      if (x.kind === "note") items.push({ ...base, kind: "note", text: String(x.text ?? ""), color: num(x.color, 4) | 0, size: textSize(x) });
      else if (x.kind === "task" && typeof x.ref === "string")
        items.push({
          ...base,
          kind: "task",
          ref: x.ref,
          title: String(x.title ?? ""),
          text: String(x.text ?? ""),
          color: num(x.color, TASK_COLOR) | 0,
          size: textSize(x),
        });
      else if (x.kind === "image" && typeof x.src === "string")
        items.push({ ...base, kind: "image", src: x.src, nw: num(x.nw, base.w), nh: num(x.nh, base.h) });
      else if (x.kind === "sticker" && typeof x.icon === "string" && x.icon in ICONS)
        items.push({ ...base, kind: "sticker", icon: x.icon as IconName });
    }
  }
  return {
    v: 1,
    w: side(r.w, BASE_W, MAX_W),
    h: side(r.h, BASE_H, MAX_H),
    items,
    ink: typeof r.ink === "string" ? r.ink : "",
  };
}

export const boardHasContent = (b: Board) => b.items.length > 0 || !!b.ink;

export const isText = (it: Item): it is TextItem => it.kind === "note" || it.kind === "task";

export function textOn(colorIndex: number): string {
  const hex = PALETTE[colorIndex] ?? PALETTE[4];
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.55 ? "#1a1c2c" : "#f4f4f4";
}

export const topZ = (items: Item[]) => items.reduce((m, i) => Math.max(m, i.z), 0);

export function newId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function clampItem<T extends Item>(it: T, bw: number, bh: number): T {
  const x = Math.min(bw - 40, Math.max(40 - it.w, it.x));
  const y = Math.min(bh - 40, Math.max(40 - it.h, it.y));
  return { ...it, x: Math.round(x), y: Math.round(y) };
}

export function grownSize(items: Item[], bw: number, bh: number) {
  const right = items.reduce((m, i) => Math.max(m, i.x + i.w), 0) + 80;
  const bottom = items.reduce((m, i) => Math.max(m, i.y + i.h), 0) + 80;
  const w = right > bw ? Math.min(MAX_W, Math.ceil(right / GROW_W) * GROW_W) : bw;
  const h = bottom > bh ? Math.min(MAX_H, Math.ceil(bottom / GROW_H) * GROW_H) : bh;
  return { w, h };
}

export function fitImage(nw: number, nh: number, maxW = 560, maxH = 380) {
  const k = Math.min(1, maxW / nw, maxH / nh);
  return { w: Math.max(16, Math.round(nw * k)), h: Math.max(16, Math.round(nh * k)) };
}

export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const r = Math.max(...rects.map((q) => q.x + q.w));
  const b = Math.max(...rects.map((q) => q.y + q.h));
  return { x, y, w: r - x, h: b - y };
}

export function contentArea(b: Board, ink: Rect | null, aspect = 1.6): Rect {
  const used = unionRect([...b.items.map(({ x, y, w, h }) => ({ x, y, w, h })), ...(ink ? [ink] : [])]);
  if (!used) return { x: 0, y: 0, w: BASE_W, h: BASE_H };
  let w = Math.max(used.w + 80, BASE_W / 2);
  let h = Math.max(used.h + 80, BASE_H / 2);
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  const fit = (start: number, len: number, total: number) => (len >= total ? (total - len) / 2 : Math.min(total - len, Math.max(0, start)));
  return {
    x: fit(used.x + used.w / 2 - w / 2, w, b.w),
    y: fit(used.y + used.h / 2 - h / 2, h, b.h),
    w,
    h,
  };
}
