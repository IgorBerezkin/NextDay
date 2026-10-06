import { ICONS, type IconName } from "../ui/icons";

export const BW = 1280;
export const BH = 800;
export const INK_W = 320;
export const INK_H = 200;
export const CELL = BW / INK_W;

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

type Base = { id: string; x: number; y: number; w: number; h: number; z: number };
export type NoteItem = Base & { kind: "note"; text: string; color: number; big?: boolean };
export type ImageItem = Base & { kind: "image"; src: string; nw: number; nh: number };
export type StickerItem = Base & { kind: "sticker"; icon: IconName };
export type Item = NoteItem | ImageItem | StickerItem;

export type Board = { v: 1; items: Item[]; ink: string };

export const emptyBoard = (): Board => ({ v: 1, items: [], ink: "" });

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

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
        w: Math.max(16, num(x.w, 200)),
        h: Math.max(16, num(x.h, 120)),
        z: num(x.z, 1),
      };
      if (x.kind === "note") items.push({ ...base, kind: "note", text: String(x.text ?? ""), color: num(x.color, 4) | 0, big: !!x.big });
      else if (x.kind === "image" && typeof x.src === "string")
        items.push({ ...base, kind: "image", src: x.src, nw: num(x.nw, base.w), nh: num(x.nh, base.h) });
      else if (x.kind === "sticker" && typeof x.icon === "string" && x.icon in ICONS)
        items.push({ ...base, kind: "sticker", icon: x.icon as IconName });
    }
  }
  return { v: 1, items, ink: typeof r.ink === "string" ? r.ink : "" };
}

export const boardHasContent = (b: Board) => b.items.length > 0 || !!b.ink;

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

export function clampItem<T extends Item>(it: T): T {
  const x = Math.min(BW - 40, Math.max(40 - it.w, it.x));
  const y = Math.min(BH - 40, Math.max(40 - it.h, it.y));
  return { ...it, x: Math.round(x), y: Math.round(y) };
}

export function fitImage(nw: number, nh: number, maxW = 560, maxH = 380) {
  const k = Math.min(1, maxW / nw, maxH / nh);
  return { w: Math.max(40, Math.round(nw * k)), h: Math.max(40, Math.round(nh * k)) };
}
