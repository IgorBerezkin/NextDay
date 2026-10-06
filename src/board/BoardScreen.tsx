import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Nav } from "../App";
import { api, assetUrl, type Day } from "../api";
import { SealDialog } from "../screens/parts";
import { sfx } from "../sound";
import { STICKERS, type IconName } from "../ui/icons";
import { Button, fileName, openTarget, StampOverlay, toast, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { flood, inkEmpty, line, loadInk, stampCell } from "./ink";
import {
  BH,
  BW,
  CELL,
  clampItem,
  emptyBoard,
  fitImage,
  INK_H,
  INK_W,
  newId,
  PALETTE,
  parseBoard,
  textOn,
  topZ,
  type ImageItem,
  type Item,
  type NoteItem,
} from "./model";
import { BoardView, ItemView, Stage } from "./Stage";

type Tool = "select" | "note" | "pen" | "eraser" | "fill";
type Snap = { items: Item[]; ink: ImageData };
type Pt = { x: number; y: number };

const TOOLS: { key: Tool; icon: IconName; label: string; code: string; hk: string }[] = [
  { key: "select", icon: "cursor", label: "Выбор и перенос", code: "KeyV", hk: "V" },
  { key: "note", icon: "note", label: "Заметка", code: "KeyN", hk: "N" },
  { key: "pen", icon: "pencil", label: "Пиксельная кисть", code: "KeyB", hk: "B" },
  { key: "eraser", icon: "eraser", label: "Ластик", code: "KeyE", hk: "E" },
  { key: "fill", icon: "bucket", label: "Заливка", code: "KeyG", hk: "G" },
];

const IMG_RE = /\.(png|jpe?g|gif|webp|bmp)$/i;

export function BoardScreen({ nav, date }: { nav: Nav; date: string }) {
  const { ov, go } = nav;
  const day = date === ov.today ? ov.todayDay : date === ov.yesterday ? ov.yesterdayDay : null;
  if (day?.plan && !day.result.sealed) return <Editor nav={nav} date={date} day={day} />;
  return <Closed nav={nav} date={date} onBack={() => go(day?.plan ? { name: "day", date } : { name: "today" })} />;
}

function Closed({ nav, date, onBack }: { nav: Nav; date: string; onBack: () => void }) {
  const [board, setBoard] = useState(emptyBoard());
  useEffect(() => {
    api.board(date).then((b) => setBoard(parseBoard(b))).catch(toastError);
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
      <div className="bd-stage">
        <BoardView board={board} date={date} dataDir={nav.ov.dataDir} />
      </div>
    </div>
  );
}

function Editor({ nav, date, day }: { nav: Nav; date: string; day: Day }) {
  const { ov, go, refresh, patchDay } = nav;
  const plan = day.plan!;
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  readyRef.current = ready;
  const [tool, setTool] = useState<Tool>("select");
  const [penColor, setPenColor] = useState(0);
  const [noteColor, setNoteColor] = useState(4);
  const [brush, setBrush] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [stickers, setStickers] = useState(false);
  const [dropHint, setDropHint] = useState(false);
  const [hover, setHover] = useState<{ cx: number; cy: number } | null>(null);
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
  const sealedDay = useRef<Day | null>(null);

  const ink = () => inkRef.current!.getContext("2d", { willReadFrequently: true })!;

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    setSaveState("saving");
    try {
      await api.saveBoard(date, { v: 1, items: itemsRef.current, ink: inkUrl.current });
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
      if (!alive || !inkRef.current) return;
      await loadInk(ink(), b.ink);
      inkUrl.current = b.ink;
      setItems(b.items);
      itemsRef.current = b.items;
      hist.current = { stack: [{ items: b.items, ink: ink().getImageData(0, 0, INK_W, INK_H) }], i: 0 };
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [date]);

  const syncInkUrl = () => {
    const c = inkRef.current!;
    inkUrl.current = inkEmpty(ink()) ? "" : c.toDataURL("image/png");
  };

  const commit = (next: Item[], inkChanged = false) => {
    if (inkChanged) syncInkUrl();
    setItems(next);
    itemsRef.current = next;
    const h = hist.current;
    const prevInk = h.stack[h.i]?.ink;
    const snapInk = inkChanged || !prevInk ? ink().getImageData(0, 0, INK_W, INK_H) : prevInk;
    h.stack = h.stack.slice(0, h.i + 1);
    h.stack.push({ items: next, ink: snapInk });
    if (h.stack.length > 80) h.stack.shift();
    h.i = h.stack.length - 1;
    setHistTick((n) => n + 1);
    markDirty();
  };

  const restore = (s: Snap) => {
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
    const s = r.width / BW;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  };

  const center = (): Pt => ({ x: BW / 2 + (Math.random() - 0.5) * 120, y: BH / 2 + (Math.random() - 0.5) * 80 });

  const add = (it: Item) => {
    const next = [...itemsRef.current, clampItem({ ...it, z: topZ(itemsRef.current) + 1 })];
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

  const addImageFile = async (file: string, at?: Pt) => {
    const url = assetUrl(ov.dataDir, date, file);
    const size = await new Promise<{ nw: number; nh: number }>((res, rej) => {
      const img = new Image();
      img.onload = () => res({ nw: img.naturalWidth || 400, nh: img.naturalHeight || 300 });
      img.onerror = () => rej(new Error("Картинка не открылась."));
      img.src = url;
    });
    const { w, h } = fitImage(size.nw, size.nh);
    const c = at ?? center();
    const it: ImageItem = { id: newId("i"), kind: "image", src: file, ...size, w, h, x: c.x - w / 2, y: c.y - h / 2, z: 0 };
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
      x: Math.round(p.x - 24),
      y: Math.round(p.y - 24),
      w: 380,
      h: 120,
      z: topZ(itemsRef.current) + 1,
    };
    const next = [...itemsRef.current, clampItem(it)];
    if (text) {
      commit(next);
      setSelected(it.id);
      return;
    }
    setItems(next);
    itemsRef.current = next;
    setSelected(it.id);
    setEditing(it.id);
    editStart.current = { id: it.id, text: "", isNew: true };
    setTool("select");
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
    if (it?.kind !== "note") return;
    editStart.current = { id, text: it.text, isNew: false };
    setSelected(id);
    setEditing(id);
  };

  const finishEdit = () => {
    const st = editStart.current;
    editStart.current = null;
    setEditing(null);
    if (!st) return;
    const it = itemsRef.current.find((i) => i.id === st.id) as NoteItem | undefined;
    if (!it) return;
    if (!it.text.trim()) {
      const next = itemsRef.current.filter((i) => i.id !== st.id);
      if (st.isNew) {
        setItems(next);
        itemsRef.current = next;
      } else commit(next);
      setSelected(null);
      return;
    }
    if (st.isNew || it.text !== st.text) commit([...itemsRef.current]);
  };

  useEffect(() => {
    const ta = editRef.current;
    if (!ta || !editing) return;
    const it = itemsRef.current.find((i) => i.id === editing);
    if (!it) return;
    ta.style.height = "0px";
    const need = Math.max(80, ta.scrollHeight);
    ta.style.height = `${Math.max(need, it.h)}px`;
    if (need > it.h) patch(it.id, { h: need }, false);
  });

  const resizeItem = (o: Item, handle: string, dx: number, dy: number): Item => {
    const east = handle.includes("e");
    const south = handle.includes("s");
    let w = o.w + (east ? dx : -dx);
    let h = o.h + (south ? dy : -dy);
    if (o.kind === "note") {
      w = Math.max(160, w);
      h = Math.max(80, h);
    } else {
      const ratio = o.kind === "image" ? o.nw / o.nh : 1;
      w = Math.max(o.kind === "sticker" ? 24 : 40, w);
      if (o.kind === "sticker") w = Math.max(24, Math.round(w / 12) * 12);
      h = w / ratio;
    }
    const x = east ? o.x : o.x + o.w - w;
    const y = south ? o.y : o.y + o.h - h;
    return { ...o, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  };

  const noteFits = (it: Item): Item => {
    if (it.kind !== "note") return it;
    const el = boardRef.current?.querySelector<HTMLElement>(`[data-id="${it.id}"]`);
    return el ? { ...it, h: Math.max(it.h, el.scrollHeight) } : it;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !ready) return;
    setStickers(false);
    const p = toBoard(e);
    const target = e.target as HTMLElement;
    if (target.closest(".note-edit")) return;
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
      commit(itemsRef.current.map((i) => (i.id === d.id ? clampItem(noteFits(i)) : i)));
    } else if (d.link) {
      void openTarget(d.link);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== "select") return;
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>("[data-id]");
    if (el?.dataset.id && !t.closest(".link")) startEdit(el.dataset.id);
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
        if (it) {
          const copy = { ...it, id: newId(it.kind[0]), x: it.x + 24, y: it.y + 24 };
          add(copy);
        }
      } else if (sel && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 16 : 4;
        const it = itemsRef.current.find((i) => i.id === sel);
        if (!it) return;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        patch(sel, clampItem({ ...it, x: it.x + dx, y: it.y + dy }));
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
          const inside = at && at.x >= 0 && at.y >= 0 && at.x <= BW && at.y <= BH;
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

  const selItem = items.find((i) => i.id === selected) ?? null;
  const selNote = selItem?.kind === "note" ? selItem : null;
  const inkTool = tool === "pen" || tool === "fill" || tool === "eraser";
  const activeColor = inkTool ? penColor : selNote ? selNote.color : noteColor;
  const pickColor = (i: number) => {
    sfx.click();
    if (inkTool) {
      setPenColor(i);
      if (tool === "eraser") setTool("pen");
    } else if (selNote) {
      setNoteColor(i);
      patch(selNote.id, { color: i });
    } else if (tool === "note") setNoteColor(i);
    else {
      setPenColor(i);
      setNoteColor(i);
    }
  };

  const editingItem = editing ? (items.find((i) => i.id === editing) as NoteItem | undefined) : undefined;
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
        {selNote && (
          <div className="tool-group">
            <button className={`tool text${selNote.big ? " on" : ""}`} title="Крупный текст" onClick={() => patch(selNote.id, { big: !selNote.big })}>
              Аа
            </button>
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

      <div className={`bd-stage${dropHint ? " drop" : ""}`}>
        <Stage
          ref={boardRef}
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
                  <ItemView key={it.id} it={it} date={date} dataDir={ov.dataDir} hidden={it.id === editing} />
                ))}
              </div>
              <canvas ref={inkRef} className={`ink${inkTool ? " live" : ""}`} width={INK_W} height={INK_H} />
              <div className="overlay">
                {selItem && !editing && (
                  <div className="sel" style={{ left: selItem.x, top: selItem.y, width: selItem.w, height: selItem.h }}>
                    {["nw", "ne", "sw", "se"].map((hd) => (
                      <i key={hd} data-handle={hd} className={`hd hd-${hd}`} />
                    ))}
                  </div>
                )}
                {editingItem && (
                  <textarea
                    ref={editRef}
                    className={`note-edit${editingItem.big ? " big" : ""}`}
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
        </Stage>
      </div>

      <div className="bd-hint">
        Ctrl+V: скриншот или текст · двойной клик: править заметку · Delete: удалить · Ctrl+Z: отменить
      </div>

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
