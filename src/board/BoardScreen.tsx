import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Nav } from "../App";
import { api, assetUrl, type CheckItem, type Day } from "../api";
import { SealDialog } from "../screens/parts";
import { sfx } from "../sound";
import { STICKERS, type IconName } from "../ui/icons";
import { Button, fileName, Linkify, openTarget, StampOverlay, toast, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { flood, inkEmpty, line, loadInk, resizeInk, stampCell } from "./ink";
import {
  BASE_H,
  BASE_W,
  CELL,
  clampItem,
  emptyBoard,
  fitImage,
  GROW_H,
  GROW_W,
  grownSize,
  isText,
  MAX_H,
  MAX_W,
  newId,
  PALETTE,
  parseBoard,
  TASK_COLOR,
  TEXT_SIZES,
  textOn,
  topZ,
  type Board,
  type ImageItem,
  type Item,
  type NoteItem,
  type TaskItem,
  type TextSize,
} from "./model";
import { BoardViewer, CardHead, ItemView, useZoom, ZoomBar, ZoomStage } from "./Stage";

type Tool = "select" | "note" | "pen" | "eraser" | "fill";
type Size = { w: number; h: number };
type Snap = { items: Item[]; ink: ImageData; size: Size };
type Pt = { x: number; y: number };

const TOOLS: { key: Tool; icon: IconName; label: string; code: string; hk: string }[] = [
  { key: "select", icon: "cursor", label: "Выбор и перенос", code: "KeyV", hk: "V" },
  { key: "note", icon: "note", label: "Заметка", code: "KeyN", hk: "N" },
  { key: "pen", icon: "pencil", label: "Пиксельная кисть", code: "KeyB", hk: "B" },
  { key: "eraser", icon: "eraser", label: "Ластик", code: "KeyE", hk: "E" },
  { key: "fill", icon: "bucket", label: "Заливка", code: "KeyG", hk: "G" },
];

const SIZE_LABELS = ["Мелкий текст", "Обычный текст", "Крупный текст"];
const SIZE_GLYPH = [14, 20, 28];
const NOTE_W = { 16: 220, 30: 380, 50: 560 } as const;
const CARD_W = { 16: 220, 30: 360, 50: 520 } as const;
const IMG_RE = /\.(png|jpe?g|gif|webp|bmp)$/i;

const minW = (s: TextSize) => s * 5;
const minH = (s: TextSize) => Math.round(s * 2.6);
const historyCap = (s: Size) => Math.max(10, Math.min(80, Math.floor(64e6 / ((s.w / CELL) * (s.h / CELL) * 4))));

export function BoardScreen({ nav, date }: { nav: Nav; date: string }) {
  const { ov, go } = nav;
  const day = date === ov.today ? ov.todayDay : date === ov.yesterday ? ov.yesterdayDay : null;
  if (day?.plan && !day.result.sealed) return <Editor nav={nav} date={date} day={day} />;
  return <Closed nav={nav} date={date} day={day} onBack={() => go(day?.plan ? { name: "day", date } : { name: "today" })} />;
}

function doneSet(day: Day | null | undefined) {
  return new Set((day?.plan?.checklist ?? []).filter((c) => c.done).map((c) => c.id));
}

function Closed({ nav, date, day, onBack }: { nav: Nav; date: string; day: Day | null | undefined; onBack: () => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  useEffect(() => {
    api
      .board(date)
      .then((b) => setBoard(parseBoard(b)))
      .catch(toastError);
  }, [date]);
  return (
    <div className="screen board-screen">
      <div className="bd-head">
        <Button kind="ghost" small icon="arrowL" onClick={onBack}>
          Назад
        </Button>
        <div className="bd-title">Доска итогов</div>
        <span className="save-state saved">
          <Px name="lock" scale={1.5} /> только просмотр
        </span>
      </div>
      <div className="bd-stage">{board && <BoardViewer board={board} date={date} dataDir={nav.ov.dataDir} doneRefs={doneSet(day)} />}</div>
    </div>
  );
}

function Editor({ nav, date, day }: { nav: Nav; date: string; day: Day }) {
  const { ov, go, refresh, patchDay } = nav;
  const plan = day.plan!;
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const [size, setSize] = useState<Size>({ w: BASE_W, h: BASE_H });
  const sizeRef = useRef(size);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  readyRef.current = ready;
  const [tool, setTool] = useState<Tool>("select");
  const [penColor, setPenColor] = useState(0);
  const [noteColor, setNoteColor] = useState(4);
  const [textSize, setTextSize] = useState<TextSize>(30);
  const [brush, setBrush] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [stickers, setStickers] = useState(false);
  const [dropHint, setDropHint] = useState(false);
  const [hover, setHover] = useState<{ cx: number; cy: number } | null>(null);
  const [ghost, setGhost] = useState<{ item: CheckItem; x: number; y: number } | null>(null);
  const [sealOpen, setSealOpen] = useState(false);
  const [stampText, setStampText] = useState<string | null>(null);
  const [, setHistTick] = useState(0);

  const boardRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const hist = useRef<{ stack: Snap[]; i: number }>({ stack: [], i: -1 });
  const inkUrl = useRef("");
  const dirty = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const drag = useRef<null | {
    mode: "move" | "resize" | "ink";
    id?: string;
    handle?: string;
    start: Pt;
    orig?: Item;
    last?: { cx: number; cy: number };
    changed: boolean;
    link?: string;
  }>(null);
  const editStart = useRef<{ id: string; text: string; isNew: boolean } | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const cardEditRef = useRef<HTMLDivElement>(null);
  const sealedDay = useRef<Day | null>(null);

  const zoom = useZoom(size.w, size.h, (e) => tool === "select" && !(e.target as HTMLElement).closest("[data-id], [data-handle], .note-edit, .task-edit"));

  const ink = () => inkRef.current!.getContext("2d", { willReadFrequently: true })!;
  const inkData = () => ink().getImageData(0, 0, inkRef.current!.width, inkRef.current!.height);

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    setSaveState("saving");
    try {
      const { w, h } = sizeRef.current;
      await api.saveBoard(date, { v: 1, w, h, items: itemsRef.current, ink: inkUrl.current });
      setSaveState(dirty.current ? "dirty" : "saved");
    } catch (e) {
      dirty.current = true;
      setSaveState("error");
      toastError(e);
    }
  }, [date]);

  const markDirty = useCallback(() => {
    dirty.current = true;
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flush(), 700);
  }, [flush]);

  useEffect(() => () => void flush(), [flush]);

  useEffect(() => {
    const un = listen<boolean>("window-visibility", (e) => {
      if (!e.payload) void flush();
    });
    return () => void un.then((f) => f());
  }, [flush]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const raw = await api.board(date).catch(() => null);
      const b = raw ? parseBoard(raw) : emptyBoard();
      const canvas = inkRef.current;
      if (!alive || !canvas) return;
      canvas.width = b.w / CELL;
      canvas.height = b.h / CELL;
      await loadInk(ink(), b.ink);
      inkUrl.current = b.ink;
      sizeRef.current = { w: b.w, h: b.h };
      setSize(sizeRef.current);
      setItems(b.items);
      itemsRef.current = b.items;
      hist.current = { stack: [{ items: b.items, ink: inkData(), size: sizeRef.current }], i: 0 };
      setReady(true);
      requestAnimationFrame(() => {
        const next = itemsRef.current.map((i) => (i.kind === "task" ? fitText(i) : i));
        setItems(next);
        itemsRef.current = next;
      });
    })();
    return () => {
      alive = false;
    };
  }, [date]);

  const syncInkUrl = () => {
    inkUrl.current = inkEmpty(ink()) ? "" : inkRef.current!.toDataURL("image/png");
  };

  const applySize = (s: Size, keepFit = false) => {
    if (!(keepFit && zoom.fitted)) zoom.anchor(s.w, s.h);
    resizeInk(ink(), s.w / CELL, s.h / CELL);
    sizeRef.current = s;
    setSize(s);
  };

  const commit = (next: Item[], inkChanged = false, forced?: Size) => {
    const cur = sizeRef.current;
    const target = forced ?? grownSize(next, cur.w, cur.h);
    const resized = target.w !== cur.w || target.h !== cur.h;
    if (resized) applySize(target);
    if (inkChanged || resized) syncInkUrl();
    setItems(next);
    itemsRef.current = next;
    const h = hist.current;
    const prev = h.stack[h.i];
    const snapInk = inkChanged || resized || !prev ? inkData() : prev.ink;
    h.stack = h.stack.slice(0, h.i + 1);
    h.stack.push({ items: next, ink: snapInk, size: sizeRef.current });
    const cap = historyCap(sizeRef.current);
    if (h.stack.length > cap) h.stack.splice(0, h.stack.length - cap);
    h.i = h.stack.length - 1;
    setHistTick((n) => n + 1);
    markDirty();
  };

  const restore = (s: Snap) => {
    if (s.size.w !== sizeRef.current.w || s.size.h !== sizeRef.current.h) applySize(s.size, true);
    setItems(s.items);
    itemsRef.current = s.items;
    ink().putImageData(s.ink, 0, 0);
    syncInkUrl();
    setSelected(null);
    setEditing(null);
    setHistTick((n) => n + 1);
    markDirty();
  };
  const undo = () => {
    const h = hist.current;
    if (h.i <= 0) return;
    h.i--;
    restore(h.stack[h.i]);
  };
  const redo = () => {
    const h = hist.current;
    if (h.i >= h.stack.length - 1) return;
    h.i++;
    restore(h.stack[h.i]);
  };
  const canUndo = hist.current.i > 0;
  const canRedo = hist.current.i < hist.current.stack.length - 1;

  const toBoard = (e: { clientX: number; clientY: number }): Pt => {
    const r = boardRef.current!.getBoundingClientRect();
    const s = r.width / sizeRef.current.w;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  };

  const center = (): Pt => {
    const wr = zoom.wrapRef.current!.getBoundingClientRect();
    const p = toBoard({ clientX: wr.left + wr.width / 2, clientY: wr.top + wr.height / 2 });
    const { w, h } = sizeRef.current;
    return {
      x: Math.min(w - 120, Math.max(120, p.x)) + (Math.random() - 0.5) * 60,
      y: Math.min(h - 80, Math.max(80, p.y)) + (Math.random() - 0.5) * 40,
    };
  };

  const clamp = <T extends Item>(it: T) => clampItem(it, sizeRef.current.w, sizeRef.current.h);

  const add = (it: Item) => {
    const next = [...itemsRef.current, clamp({ ...it, z: topZ(itemsRef.current) + 1 })];
    commit(next);
    setSelected(it.id);
  };

  const remove = (id: string) => {
    commit(itemsRef.current.filter((i) => i.id !== id));
    setSelected(null);
    setEditing(null);
  };

  const patch = (id: string, p: Partial<Item>, record = true) => {
    const next = itemsRef.current.map((i) => (i.id === id ? ({ ...i, ...p } as Item) : i));
    if (record) commit(next);
    else {
      setItems(next);
      itemsRef.current = next;
    }
  };

  const fitText = (it: Item): Item => {
    if (!isText(it)) return it;
    const el = boardRef.current?.querySelector<HTMLElement>(`[data-id="${it.id}"]`);
    if (!el) return it;
    return { ...it, h: it.kind === "task" ? el.offsetHeight : Math.max(minH(it.size), el.scrollHeight) };
  };

  const refit = (id: string) =>
    requestAnimationFrame(() => {
      const it = itemsRef.current.find((i) => i.id === id);
      if (it) patch(id, { h: fitText(it).h }, false);
    });

  const addImageFile = async (file: string, at?: Pt) => {
    const url = assetUrl(ov.dataDir, date, file);
    const dims = await new Promise<{ nw: number; nh: number }>((res, rej) => {
      const img = new Image();
      img.onload = () => res({ nw: img.naturalWidth || 400, nh: img.naturalHeight || 300 });
      img.onerror = () => rej(new Error("Картинка не открылась."));
      img.src = url;
    });
    const { w, h } = fitImage(dims.nw, dims.nh);
    const c = at ?? center();
    const it: ImageItem = { id: newId("i"), kind: "image", src: file, ...dims, w, h, x: c.x - w / 2, y: c.y - h / 2, z: 0 };
    add(it);
    setTool("select");
    sfx.pop();
  };

  const addImageBlob = async (blob: Blob, at?: Pt) => {
    const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("x-ms-bmp", "bmp");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const a = await api.importImage(date, ext, bytes);
    await addImageFile(a.file, at);
  };

  const addImagePaths = async (paths: string[], at?: Pt) => {
    let k = 0;
    for (const p of paths) {
      if (!IMG_RE.test(p)) {
        toast(`Это не картинка: ${fileName(p)}`, "error");
        continue;
      }
      try {
        const a = await api.importImagePath(date, p);
        await addImageFile(a.file, at ? { x: at.x + k * 28, y: at.y + k * 28 } : undefined);
        k++;
      } catch (e) {
        toastError(e);
      }
    }
  };

  const pickImages = async () => {
    try {
      const sel = await open({
        multiple: true,
        title: "Картинки для доски",
        filters: [{ name: "Картинки", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
      });
      const paths = Array.isArray(sel) ? sel : sel ? [sel] : [];
      await addImagePaths(paths);
    } catch (e) {
      toastError(e);
    }
  };

  const addNote = (p: Pt, text = "") => {
    const it: NoteItem = {
      id: newId("n"),
      kind: "note",
      text,
      color: noteColor,
      size: textSize,
      x: Math.round(p.x - 24),
      y: Math.round(p.y - 24),
      w: NOTE_W[textSize],
      h: minH(textSize) + 40,
      z: topZ(itemsRef.current) + 1,
    };
    const next = [...itemsRef.current, clamp(it)];
    if (text) {
      commit(next);
      setSelected(it.id);
      refit(it.id);
      return;
    }
    setItems(next);
    itemsRef.current = next;
    setSelected(it.id);
    setEditing(it.id);
    editStart.current = { id: it.id, text: "", isNew: true };
    setTool("select");
  };

  const addCard = (ci: CheckItem, p: Pt) => {
    const w = CARD_W[textSize];
    const it: TaskItem = {
      id: newId("t"),
      kind: "task",
      ref: ci.id,
      title: ci.text,
      text: "",
      color: TASK_COLOR,
      size: textSize,
      x: Math.round(p.x - w / 2),
      y: Math.round(p.y - 30),
      w,
      h: minH(textSize),
      z: 0,
    };
    add(it);
    setTool("select");
    sfx.pop();
    refit(it.id);
  };

  const addSticker = (icon: IconName) => {
    const c = center();
    add({ id: newId("s"), kind: "sticker", icon, x: c.x - 36, y: c.y - 36, w: 72, h: 72, z: 0 });
    setStickers(false);
    setTool("select");
    sfx.pop();
  };

  const startEdit = (id: string) => {
    const it = itemsRef.current.find((i) => i.id === id);
    if (!it || !isText(it)) return;
    editStart.current = { id, text: it.text, isNew: false };
    setSelected(id);
    setEditing(id);
  };

  const finishEdit = () => {
    const st = editStart.current;
    editStart.current = null;
    setEditing(null);
    if (!st) return;
    const it = itemsRef.current.find((i) => i.id === st.id);
    if (!it || !isText(it)) return;
    if (it.kind === "note" && !it.text.trim()) {
      const next = itemsRef.current.filter((i) => i.id !== st.id);
      if (st.isNew) {
        setItems(next);
        itemsRef.current = next;
      } else commit(next);
      setSelected(null);
      return;
    }
    if (st.isNew || it.text !== st.text) commit(itemsRef.current.map((i) => (i.id === it.id ? fitText(i) : i)));
    else refit(it.id);
  };

  useEffect(() => {
    const ta = editRef.current;
    if (!ta || !editing) return;
    const it = itemsRef.current.find((i) => i.id === editing);
    if (!it || !isText(it)) return;
    ta.style.height = "0px";
    if (it.kind === "note") {
      const need = Math.max(minH(it.size), ta.scrollHeight);
      ta.style.height = `${Math.max(need, it.h)}px`;
      if (need > it.h) patch(it.id, { h: need }, false);
    } else {
      ta.style.height = `${ta.scrollHeight}px`;
      const need = cardEditRef.current?.offsetHeight ?? it.h;
      if (need !== it.h) patch(it.id, { h: need }, false);
    }
  });

  const resizeItem = (o: Item, handle: string, dx: number, dy: number): Item => {
    const east = handle.includes("e");
    const south = handle.includes("s");
    let w = o.w + (east ? dx : -dx);
    let h = o.h + (south ? dy : -dy);
    if (isText(o)) {
      w = Math.max(minW(o.size), w);
      h = o.kind === "task" ? o.h : Math.max(minH(o.size), h);
    } else {
      const ratio = o.kind === "image" ? o.nw / o.nh : 1;
      w = Math.max(o.kind === "sticker" ? 12 : 16, w);
      if (o.kind === "sticker") w = Math.max(12, Math.round(w / 12) * 12);
      h = w / ratio;
    }
    const x = east ? o.x : o.x + o.w - w;
    const y = south ? o.y : o.y + o.h - h;
    return { ...o, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  };

  const chooseSize = (s: TextSize) => {
    sfx.click();
    setTextSize(s);
    const it = itemsRef.current.find((i) => i.id === selected);
    if (it && isText(it) && it.size !== s) {
      patch(it.id, { size: s, w: Math.max(minW(s), it.w), h: minH(s) });
      refit(it.id);
    }
  };

  const growBoard = () => {
    commit(itemsRef.current, false, { w: Math.min(MAX_W, sizeRef.current.w + GROW_W), h: Math.min(MAX_H, sizeRef.current.h + GROW_H) });
    zoom.reset();
    sfx.pop();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !ready) return;
    setStickers(false);
    const p = toBoard(e);
    const target = e.target as HTMLElement;
    if (target.closest(".note-edit, .task-edit")) return;
    if (tool === "pen" || tool === "eraser") {
      const cx = Math.floor(p.x / CELL);
      const cy = Math.floor(p.y / CELL);
      stampCell(ink(), cx, cy, brush, tool === "pen" ? PALETTE[penColor] : null);
      drag.current = { mode: "ink", start: p, last: { cx, cy }, changed: true };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "fill") {
      if (flood(ink(), Math.floor(p.x / CELL), Math.floor(p.y / CELL), PALETTE[penColor])) {
        commit(itemsRef.current, true);
        sfx.pop();
      }
      return;
    }
    if (editing) finishEdit();
    if (tool === "note") {
      e.preventDefault();
      addNote(p);
      return;
    }
    const handle = target.closest<HTMLElement>("[data-handle]");
    if (handle && selected) {
      const it = itemsRef.current.find((i) => i.id === selected);
      if (it) {
        drag.current = { mode: "resize", id: it.id, handle: handle.dataset.handle, start: p, orig: it, changed: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    const el = target.closest<HTMLElement>("[data-id]");
    if (el) {
      const it = itemsRef.current.find((i) => i.id === el.dataset.id);
      if (it) {
        setSelected(it.id);
        const link = target.closest<HTMLElement>(".link")?.dataset.target;
        drag.current = { mode: "move", id: it.id, start: p, orig: it, changed: false, link };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    setSelected(null);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = toBoard(e);
    if (tool === "pen" || tool === "eraser" || tool === "fill") {
      const cx = Math.floor(p.x / CELL);
      const cy = Math.floor(p.y / CELL);
      if (!hover || hover.cx !== cx || hover.cy !== cy) setHover({ cx, cy });
    }
    const d = drag.current;
    if (!d) return;
    if (d.mode === "ink") {
      const cx = Math.floor(p.x / CELL);
      const cy = Math.floor(p.y / CELL);
      if (d.last && (d.last.cx !== cx || d.last.cy !== cy)) {
        line(ink(), d.last.cx, d.last.cy, cx, cy, brush, tool === "pen" ? PALETTE[penColor] : null);
        d.last = { cx, cy };
      }
      return;
    }
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (!d.changed && Math.abs(dx) + Math.abs(dy) < 3) return;
    const o = d.orig!;
    if (!d.changed) {
      d.changed = true;
      d.orig = { ...o, z: topZ(itemsRef.current) + 1 };
    }
    const base = d.orig!;
    const next = d.mode === "move" ? { ...base, x: Math.round(base.x + dx), y: Math.round(base.y + dy) } : resizeItem(base, d.handle!, dx, dy);
    patch(base.id, next, false);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === "ink") {
      commit(itemsRef.current, true);
      return;
    }
    if (d.changed && d.id) {
      commit(itemsRef.current.map((i) => (i.id === d.id ? clamp(fitText(i)) : i)));
    } else if (d.link) {
      void openTarget(d.link);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== "select") return;
    const top = document.elementsFromPoint(e.clientX, e.clientY).find((h) => h.closest("[data-id]"));
    const id = top?.closest<HTMLElement>("[data-id]")?.dataset.id;
    if (top && id && !top.closest(".link")) startEdit(id);
  };

  const startCardDrag = (e: React.PointerEvent, ci: CheckItem) => {
    if (e.button !== 0 || !ready) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) < 5) return;
      moved = true;
      setGhost({ item: ci, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGhost(null);
      if (!moved) addCard(ci, center());
      else if (document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".bd-stage")) addCard(ci, toBoard(ev));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const keyState = useRef({ selected, editing, tool });
  keyState.current = { selected, editing, tool };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = !!t.closest("input, textarea, select");
      const { selected: sel } = keyState.current;
      if (!readyRef.current || document.querySelector(".modal-back, .lightbox")) return;
      if (e.ctrlKey && e.code === "KeyZ" && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.ctrlKey && e.code === "KeyY" && !typing) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.ctrlKey && (e.code === "Equal" || e.code === "NumpadAdd")) {
        e.preventDefault();
        zoom.zoomCenter(1.25);
        return;
      }
      if (e.ctrlKey && (e.code === "Minus" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        zoom.zoomCenter(1 / 1.25);
        return;
      }
      if (e.ctrlKey && (e.code === "Digit0" || e.code === "Numpad0")) {
        e.preventDefault();
        zoom.reset();
        return;
      }
      if (typing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        remove(sel);
      } else if (e.key === "Escape") {
        setSelected(null);
        setStickers(false);
      } else if (e.ctrlKey && e.code === "KeyD" && sel) {
        e.preventDefault();
        const it = itemsRef.current.find((i) => i.id === sel);
        if (it && it.kind !== "task") add({ ...it, id: newId(it.kind[0]), x: it.x + 24, y: it.y + 24 });
      } else if (sel && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 16 : 4;
        const it = itemsRef.current.find((i) => i.id === sel);
        if (!it) return;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        patch(sel, clamp({ ...it, x: it.x + dx, y: it.y + dy }));
      } else if (sel && e.key === "Enter") {
        e.preventDefault();
        startEdit(sel);
      } else if (!e.ctrlKey && !e.altKey) {
        const tl = TOOLS.find((x) => x.code === e.code);
        if (tl) setTool(tl.key);
        else if (e.code === "BracketLeft") setBrush((b) => (b === 4 ? 2 : 1));
        else if (e.code === "BracketRight") setBrush((b) => (b === 1 ? 2 : 4));
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (!readyRef.current || t.closest?.("input, textarea") || document.querySelector(".modal-back")) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        void (async () => {
          for (const f of files) {
            try {
              await addImageBlob(f);
            } catch (err) {
              toastError(err);
            }
          }
        })();
        return;
      }
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (text) {
        e.preventDefault();
        addNote(center(), text.slice(0, 2000));
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  });

  useEffect(() => {
    let un: (() => void) | undefined;
    let alive = true;
    getCurrentWebview()
      .onDragDropEvent((ev) => {
        const p = ev.payload;
        if (p.type === "enter" || p.type === "over") setDropHint(true);
        else if (p.type === "leave") setDropHint(false);
        else if (p.type === "drop") {
          setDropHint(false);
          if (!readyRef.current) return;
          const dpr = window.devicePixelRatio || 1;
          const at = boardRef.current ? toBoard({ clientX: p.position.x / dpr, clientY: p.position.y / dpr }) : undefined;
          const { w, h } = sizeRef.current;
          const inside = at && at.x >= 0 && at.y >= 0 && at.x <= w && at.y <= h;
          void addImagePaths(p.paths, inside ? at : undefined);
        }
      })
      .then((f) => {
        if (alive) un = f;
        else f();
      });
    return () => {
      alive = false;
      un?.();
    };
  }, [date]);

  const checklist = plan.checklist ?? [];
  const doneRefs = new Set(checklist.filter((c) => c.done).map((c) => c.id));
  const placed = new Set(items.flatMap((i) => (i.kind === "task" ? [i.ref] : [])));
  const waiting = checklist.filter((c) => c.done && !placed.has(c.id));

  const selItem = items.find((i) => i.id === selected) ?? null;
  const selText = selItem && isText(selItem) ? selItem : null;
  const inkTool = tool === "pen" || tool === "fill" || tool === "eraser";
  const activeColor = inkTool ? penColor : selText ? selText.color : noteColor;
  const pickColor = (i: number) => {
    sfx.click();
    if (inkTool) {
      setPenColor(i);
      if (tool === "eraser") setTool("pen");
    } else if (selText) {
      if (selText.kind === "note") setNoteColor(i);
      patch(selText.id, { color: i });
    } else if (tool === "note") setNoteColor(i);
    else {
      setPenColor(i);
      setNoteColor(i);
    }
  };

  const editingItem = editing ? items.find((i) => i.id === editing) : undefined;
  const empty = ready && items.length === 0 && !inkUrl.current;
  const saveLabel = { saved: "сохранено", dirty: "…", saving: "сохраняю…", error: "не сохранилось" }[saveState];

  return (
    <div className="screen board-screen">
      <div className="bd-head">
        <Button
          kind="ghost"
          small
          icon="arrowL"
          onClick={async () => {
            await flush();
            void refresh();
            go({ name: "today" });
          }}
        >
          Назад
        </Button>
        <div className="bd-title">
          <span className="day-label">{date === ov.today ? "Сегодня" : "Вчера"}</span>
          <span className="bd-name">Итоги дня «{plan.name}»</span>
        </div>
        <span className={`save-state ${saveState}`}>{saveLabel}</span>
        <Button
          kind="green"
          icon="lock"
          onClick={async () => {
            await flush();
            setSealOpen(true);
          }}
        >
          Запечатать
        </Button>
      </div>

      <div className="bd-toolbar">
        <div className="tool-group">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              className={`tool${tool === t.key ? " on" : ""}`}
              title={`${t.label} (${t.hk})`}
              onClick={() => {
                sfx.click();
                setTool(t.key);
              }}
            >
              <Px name={t.icon} scale={2} />
            </button>
          ))}
        </div>
        <div className="tool-group">
          <button className="tool" title="Картинка из файла (или Ctrl+V со скриншотом)" onClick={() => void pickImages()}>
            <Px name="image" scale={2} />
          </button>
          <div className="pop-wrap">
            <button className={`tool${stickers ? " on" : ""}`} title="Наклейки" onClick={() => setStickers((s) => !s)}>
              <Px name="star" scale={2} />
            </button>
            {stickers && (
              <div className="popover">
                {STICKERS.map((s) => (
                  <button key={s} className="sticker-btn" onClick={() => addSticker(s)}>
                    <Px name={s} scale={3} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="tool-group palette">
          {PALETTE.map((c, i) => (
            <button key={c} className={`sw${i === activeColor ? " on" : ""}`} style={{ background: c }} onClick={() => pickColor(i)} title={c} />
          ))}
        </div>
        {(tool === "pen" || tool === "eraser") && (
          <div className="tool-group">
            {[1, 2, 4].map((s) => (
              <button key={s} className={`tool size${brush === s ? " on" : ""}`} title={`Размер кисти ${s} (клавиши [ и ])`} onClick={() => setBrush(s)}>
                <i style={{ width: s * 3 + 3, height: s * 3 + 3 }} />
              </button>
            ))}
          </div>
        )}
        {(selText || tool === "note") && (
          <div className="tool-group">
            {TEXT_SIZES.map((t, i) => (
              <button
                key={t}
                className={`tool text${(selText?.size ?? textSize) === t ? " on" : ""}`}
                title={SIZE_LABELS[i]}
                onClick={() => chooseSize(t)}
              >
                <span style={{ fontSize: SIZE_GLYPH[i] }}>А</span>
              </button>
            ))}
          </div>
        )}
        <span className="grow" />
        <div className="tool-group">
          <button className="tool" disabled={!canUndo} onClick={undo} title="Отменить (Ctrl+Z)">
            <Px name="undo" scale={2} />
          </button>
          <button className="tool" disabled={!canRedo} onClick={redo} title="Вернуть (Ctrl+Y)">
            <Px name="redo" scale={2} />
          </button>
          <button className="tool" disabled={!selected} onClick={() => selected && remove(selected)} title="Удалить (Delete)">
            <Px name="trash" scale={2} />
          </button>
        </div>
      </div>

      <div className="bd-main">
        {checklist.length > 0 && (
          <aside className="bd-done">
            <div className="bd-done-title">
              <Px name="check" scale={1.5} /> Сделано
            </div>
            {waiting.map((c) => (
              <button key={c.id} className="done-card" title="Перетащи на доску или просто нажми" onPointerDown={(e) => startCardDrag(e, c)}>
                <Linkify inert text={c.text} />
              </button>
            ))}
            {waiting.length === 0 && (
              <p className="muted">{doneRefs.size ? "Все сделанные пункты уже на доске." : "Отметь пункт в чеклисте, и он появится здесь."}</p>
            )}
          </aside>
        )}
        <div className={`bd-stage${dropHint ? " drop" : ""}`}>
          <ZoomStage
            ref={boardRef}
            bw={size.w}
            bh={size.h}
            zoom={zoom}
            editing
            className={`tool-${tool}`}
            boardProps={{
              onPointerDown,
              onPointerMove,
              onPointerUp,
              onPointerCancel: onPointerUp,
              onPointerLeave: () => setHover(null),
              onDoubleClick,
            }}
          >
            {(scale) => (
              <>
                <div className="bd-items">
                  {items.map((it) => (
                    <ItemView
                      key={it.id}
                      it={it}
                      date={date}
                      dataDir={ov.dataDir}
                      hidden={it.id === editing}
                      done={it.kind === "task" ? doneRefs.has(it.ref) : undefined}
                      hint="Двойной клик: описание"
                    />
                  ))}
                </div>
                <canvas ref={inkRef} className={`ink${inkTool ? " live" : ""}`} style={{ width: size.w, height: size.h }} />
                <div className="overlay">
                  {selItem && !editing && (
                    <div className="sel" style={{ left: selItem.x, top: selItem.y, width: selItem.w, height: selItem.h }}>
                      {["nw", "ne", "sw", "se"].map((hd) => (
                        <i key={hd} data-handle={hd} className={`hd hd-${hd}`} />
                      ))}
                    </div>
                  )}
                  {editingItem?.kind === "note" && (
                    <textarea
                      ref={editRef}
                      className={`note-edit text-${editingItem.size}`}
                      autoFocus
                      value={editingItem.text}
                      maxLength={2000}
                      placeholder="Что получилось?"
                      style={{
                        left: editingItem.x,
                        top: editingItem.y,
                        width: editingItem.w,
                        background: PALETTE[editingItem.color],
                        color: textOn(editingItem.color),
                      }}
                      onChange={(e) => patch(editingItem.id, { text: e.target.value }, false)}
                      onBlur={finishEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Escape" || (e.key === "Enter" && e.ctrlKey)) {
                          e.preventDefault();
                          (e.target as HTMLTextAreaElement).blur();
                        }
                      }}
                    />
                  )}
                  {editingItem?.kind === "task" && (
                    <div
                      ref={cardEditRef}
                      className={`bi task task-edit text-${editingItem.size}`}
                      style={{
                        left: editingItem.x,
                        top: editingItem.y,
                        width: editingItem.w,
                        background: PALETTE[editingItem.color],
                        color: textOn(editingItem.color),
                      }}
                    >
                      <CardHead title={editingItem.title} size={editingItem.size} done={doneRefs.has(editingItem.ref)} />
                      <textarea
                        ref={editRef}
                        className="task-text"
                        autoFocus
                        value={editingItem.text}
                        maxLength={2000}
                        placeholder="Что получилось?"
                        onChange={(e) => patch(editingItem.id, { text: e.target.value }, false)}
                        onBlur={finishEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Escape" || (e.key === "Enter" && e.ctrlKey)) {
                            e.preventDefault();
                            (e.target as HTMLTextAreaElement).blur();
                          }
                        }}
                      />
                    </div>
                  )}
                  {hover && inkTool && (
                    <div
                      className="brush-cursor"
                      style={{
                        left: (hover.cx - Math.floor(((tool === "fill" ? 1 : brush) - 1) / 2)) * CELL,
                        top: (hover.cy - Math.floor(((tool === "fill" ? 1 : brush) - 1) / 2)) * CELL,
                        width: (tool === "fill" ? 1 : brush) * CELL,
                        height: (tool === "fill" ? 1 : brush) * CELL,
                        outlineWidth: Math.max(1, 1.5 / scale),
                      }}
                    />
                  )}
                  {empty && (
                    <div className="board-empty">
                      <Px name="image" scale={4} />
                      <p>Вставьте скриншот (Win+Shift+S, затем Ctrl+V), перетащите картинку из проводника,</p>
                      <p>добавьте заметку (N) или порисуйте пиксельной кистью (B).</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </ZoomStage>
          <ZoomBar zoom={zoom}>
            <button className="tool" title="Расширить доску" disabled={size.w >= MAX_W && size.h >= MAX_H} onClick={growBoard}>
              <Px name="grow" scale={2} />
            </button>
          </ZoomBar>
        </div>
      </div>

      <div className="bd-hint">
        Ctrl+V: вставить · двойной клик: править · Ctrl+колесо: масштаб · тяни пустое место: двигать доску
      </div>

      {ghost && (
        <div className="task-ghost" style={{ left: ghost.x, top: ghost.y }}>
          <Px name="check" scale={1.5} />
          <span>
            <Linkify inert text={ghost.item.text} />
          </span>
        </div>
      )}
      {sealOpen && (
        <SealDialog
          day={day}
          onClose={() => setSealOpen(false)}
          onSealed={(d) => {
            sealedDay.current = d;
            setSealOpen(false);
            setStampText("ЗАПЕЧАТАНО");
          }}
        />
      )}
      {stampText && (
        <StampOverlay
          text={stampText}
          onDone={() => {
            if (sealedDay.current) patchDay(sealedDay.current);
            void refresh();
            go({ name: "day", date });
          }}
        />
      )}
    </div>
  );
}
