import { openPath } from "@tauri-apps/plugin-opener";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { assetPath, assetUrl } from "../api";
import { Button, Linkify, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { inkBounds, loadInk } from "./ink";
import { CELL, contentArea, PALETTE, textOn, type Board, type ImageItem, type Item, type Rect } from "./model";

export type View = { s: number | null; x: number; y: number };

const ICON_SCALE = { 16: 1, 30: 2, 50: 3 } as const;

export function useZoom(bw: number, bh: number, canPan: (e: React.PointerEvent) => boolean) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ s: null, x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitScale = box.w ? Math.max(0.02, Math.min((box.w - 24) / bw, (box.h - 30) / bh)) : 0;
  const scale = view.s ?? fitScale;
  const left = (box.w - bw * scale) / 2 + view.x;
  const top = (box.h - bh * scale) / 2 + view.y;
  const minScale = Math.min(fitScale, 0.1);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const s1 = Math.min(3, Math.max(minScale, scale * factor));
      const bx = (cx - left) / scale;
      const by = (cy - top) / scale;
      setView({ s: s1, x: cx - bx * s1 - (box.w - bw * s1) / 2, y: cy - by * s1 - (box.h - bh * s1) / 2 });
    },
    [minScale, scale, left, top, box, bw, bh],
  );

  const zoomCenter = (factor: number) => zoomAt(box.w / 2, box.h / 2, factor);

  const panBy = useCallback((dx: number, dy: number) => setView((v) => ({ s: v.s ?? fitScale, x: v.x + dx, y: v.y + dy })), [fitScale]);

  const anchor = (w: number, h: number) =>
    setView((v) => {
      const s = v.s ?? fitScale;
      return { s, x: left - (box.w - w * s) / 2, y: top - (box.h - h * s) / 2 };
    });

  const reset = () => setView({ s: null, x: 0, y: 0 });

  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
      else if (e.shiftKey) panBy(-e.deltaY, 0);
      else panBy(-e.deltaX, -e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, panBy]);

  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button === 1 || (e.button === 0 && canPan(e))) {
        pan.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
        if (e.button === 1) e.preventDefault();
      }
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const p = pan.current;
      if (!p || p.id !== e.pointerId) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!p.moved) {
        p.moved = true;
        setPanning(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      p.x = e.clientX;
      p.y = e.clientY;
      panBy(dx, dy);
    },
    onPointerUp: () => {
      pan.current = null;
      setPanning(false);
    },
  };

  return { wrapRef, scale, fitted: view.s === null, left, top, panning, zoomCenter, anchor, reset, handlers, isPanning: () => !!pan.current?.moved };
}

export type Zoom = ReturnType<typeof useZoom>;

type BoardProps = React.HTMLAttributes<HTMLDivElement>;

export const ZoomStage = forwardRef<
  HTMLDivElement,
  { bw: number; bh: number; zoom: Zoom; className?: string; editing?: boolean; boardProps?: BoardProps; children: (scale: number) => ReactNode }
>(function ZoomStage({ bw, bh, zoom, className, editing, boardProps, children }, boardRef) {
  const s = zoom.scale;
  return (
    <div
      ref={zoom.wrapRef}
      className={`stage-wrap zoomable${zoom.panning ? " panning" : ""}${className ? " " + className : ""}`}
      {...zoom.handlers}
      onPointerCancel={zoom.handlers.onPointerUp}
    >
      <div className="stage-box" style={{ left: zoom.left, top: zoom.top, width: bw * s, height: bh * s, visibility: s ? undefined : "hidden" }}>
        <div
          className={`board${editing ? " editing" : ""}`}
          ref={boardRef}
          {...boardProps}
          style={{ width: bw, height: bh, transform: `scale(${s})`, ["--s" as string]: s || 1 }}
        >
          {children(s || 1)}
        </div>
      </div>
    </div>
  );
});

function FitStage({ bw, bh, area, className, onClick, children }: { bw: number; bh: number; area: Rect; className?: string; onClick?: () => void; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current!;
    const measure = () => setWidth(el.getBoundingClientRect().width - 12);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const s = width > 0 ? width / area.w : 0;
  return (
    <div className={`stage-wrap fit-width${onClick ? " clickable" : ""}${className ? " " + className : ""}`} ref={wrap}>
      <div className="stage-box" style={{ width: area.w * s, height: area.h * s, visibility: s ? undefined : "hidden" }} onClick={onClick}>
        <div
          className="board"
          style={{ width: bw, height: bh, transform: `translate(${-area.x * s}px, ${-area.y * s}px) scale(${s})`, ["--s" as string]: s || 1 }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function ItemView({
  it,
  date,
  dataDir,
  hidden,
  done,
  hint,
  onImageClick,
}: {
  it: Item;
  date: string;
  dataDir: string;
  hidden?: boolean;
  done?: boolean;
  hint?: string;
  onImageClick?: (it: ImageItem) => void;
}) {
  const style: React.CSSProperties = { left: it.x, top: it.y, width: it.w, height: it.h, zIndex: it.z, visibility: hidden ? "hidden" : undefined };
  if (it.kind === "note" || it.kind === "task") {
    delete style.height;
    if (it.kind === "note") style.minHeight = it.h;
    style.background = PALETTE[it.color];
    style.color = textOn(it.color);
  }
  if (it.kind === "note")
    return (
      <div className={`bi note text-${it.size}`} data-id={it.id} style={style}>
        <div className="note-text">
          <Linkify text={it.text} />
        </div>
      </div>
    );
  if (it.kind === "task")
    return (
      <div className={`bi task text-${it.size}`} data-id={it.id} style={style}>
        <CardHead title={it.title} size={it.size} done={done ?? true} />
        {it.text ? (
          <div className="task-text">
            <Linkify text={it.text} />
          </div>
        ) : (
          hint && <div className="task-text hint">{hint}</div>
        )}
      </div>
    );
  if (it.kind === "image")
    return (
      <div className={`bi image${onImageClick ? " clickable" : ""}`} data-id={it.id} style={style} onClick={() => onImageClick?.(it)}>
        <img src={assetUrl(dataDir, date, it.src)} draggable={false} alt="" />
      </div>
    );
  return (
    <div className="bi sticker" data-id={it.id} style={style}>
      <Px name={it.icon} scale={it.w / 12} />
    </div>
  );
}

export function CardHead({ title, size, done }: { title: string; size: 16 | 30 | 50; done: boolean }) {
  return (
    <div className="task-head">
      <Px name={done ? "check" : "box"} scale={ICON_SCALE[size]} />
      <span>
        <Linkify text={title} />
      </span>
    </div>
  );
}

function InkView({ src, bw, bh, onBounds }: { src: string; bw: number; bh: number; onBounds?: (r: Rect | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d", { willReadFrequently: true });
    if (ctx) void loadInk(ctx, src).then(() => onBounds?.(inkBounds(ctx)));
  }, [src, bw, bh, onBounds]);
  return <canvas ref={ref} className="ink" width={bw / CELL} height={bh / CELL} style={{ width: bw, height: bh }} />;
}

function BoardContent({
  board,
  date,
  dataDir,
  doneRefs,
  onImageClick,
  onInkBounds,
}: {
  board: Board;
  date: string;
  dataDir: string;
  doneRefs?: Set<string>;
  onImageClick?: (it: ImageItem) => void;
  onInkBounds?: (r: Rect | null) => void;
}) {
  return (
    <>
      <div className="bd-items">
        {board.items.map((it) => (
          <ItemView
            key={it.id}
            it={it}
            date={date}
            dataDir={dataDir}
            done={it.kind === "task" && doneRefs ? doneRefs.has(it.ref) : undefined}
            onImageClick={onImageClick}
          />
        ))}
      </div>
      {board.ink && <InkView src={board.ink} bw={board.w} bh={board.h} onBounds={onInkBounds} />}
    </>
  );
}

export function BoardView({
  board,
  date,
  dataDir,
  doneRefs,
  onClick,
}: {
  board: Board;
  date: string;
  dataDir: string;
  doneRefs?: Set<string>;
  onClick?: () => void;
}) {
  const [zoomed, setZoomed] = useState<ImageItem | null>(null);
  const [ink, setInk] = useState<Rect | null>(null);
  const area = contentArea(board, board.ink ? ink : null);
  return (
    <>
      <FitStage bw={board.w} bh={board.h} area={area} onClick={onClick}>
        <BoardContent
          board={board}
          date={date}
          dataDir={dataDir}
          doneRefs={doneRefs}
          onImageClick={onClick ? undefined : setZoomed}
          onInkBounds={setInk}
        />
      </FitStage>
      {zoomed && <Lightbox item={zoomed} date={date} dataDir={dataDir} onClose={() => setZoomed(null)} />}
    </>
  );
}

export function BoardViewer({ board, date, dataDir, doneRefs }: { board: Board; date: string; dataDir: string; doneRefs?: Set<string> }) {
  const [zoomed, setZoomed] = useState<ImageItem | null>(null);
  const zoom = useZoom(board.w, board.h, () => true);
  return (
    <>
      <ZoomStage bw={board.w} bh={board.h} zoom={zoom} className="viewer">
        {() => (
          <BoardContent
            board={board}
            date={date}
            dataDir={dataDir}
            doneRefs={doneRefs}
            onImageClick={(it) => !zoom.isPanning() && setZoomed(it)}
          />
        )}
      </ZoomStage>
      <ZoomBar zoom={zoom} />
      {zoomed && <Lightbox item={zoomed} date={date} dataDir={dataDir} onClose={() => setZoomed(null)} />}
    </>
  );
}

export function ZoomBar({ zoom, children }: { zoom: Zoom; children?: ReactNode }) {
  return (
    <div className="zoom-bar">
      <button className="tool" title="Отдалить (Ctrl+колесо)" onClick={() => zoom.zoomCenter(1 / 1.25)}>
        <Px name="minus" scale={2} />
      </button>
      <span className="zoom-pct">{Math.round(zoom.scale * 100)}%</span>
      <button className="tool" title="Приблизить (Ctrl+колесо)" onClick={() => zoom.zoomCenter(1.25)}>
        <Px name="plus" scale={2} />
      </button>
      <button className="tool" title="Вся доска" onClick={zoom.reset}>
        <Px name="fit" scale={2} />
      </button>
      {children}
    </div>
  );
}

export function Lightbox({ item, date, dataDir, onClose }: { item: ImageItem; date: string; dataDir: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={assetUrl(dataDir, date, item.src)} alt="" />
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <Button kind="paper" small icon="image" onClick={() => void openPath(assetPath(dataDir, date, item.src)).catch(toastError)}>
          Открыть в просмотрщике
        </Button>
        <Button kind="paper" small icon="cross" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}
