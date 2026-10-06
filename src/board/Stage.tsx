import { openPath } from "@tauri-apps/plugin-opener";
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { assetPath, assetUrl } from "../api";
import { Button, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { loadInk } from "./ink";
import { BH, BW, INK_H, INK_W, PALETTE, textOn, type Board, type ImageItem, type Item } from "./model";

export const Stage = forwardRef<
  HTMLDivElement,
  {
    fit?: "contain" | "width";
    className?: string;
    children: (scale: number) => ReactNode;
    boardProps?: React.HTMLAttributes<HTMLDivElement>;
  }
>(function Stage({ fit = "contain", className, children, boardProps }, boardRef) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current!;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = r.width - 12;
      const h = r.height - 18;
      const s = fit === "width" ? w / BW : Math.min(w / BW, h / BH);
      setScale(Math.max(0.05, s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);
  const s = scale || 0.5;
  return (
    <div className={`stage-wrap fit-${fit}${className ? " " + className : ""}`} ref={wrap}>
      <div className="stage-box" style={{ width: BW * s, height: BH * s, visibility: scale ? undefined : "hidden" }}>
        <div
          className="board"
          ref={boardRef}
          {...boardProps}
          style={{ transform: `scale(${s})`, ["--s" as string]: s, ...boardProps?.style }}
        >
          {children(s)}
        </div>
      </div>
    </div>
  );
});

export function ItemView({
  it,
  date,
  dataDir,
  hidden,
  onImageClick,
}: {
  it: Item;
  date: string;
  dataDir: string;
  hidden?: boolean;
  onImageClick?: (it: ImageItem) => void;
}) {
  const style: React.CSSProperties = { left: it.x, top: it.y, width: it.w, height: it.h, zIndex: it.z };
  if (it.kind === "note") {
    delete style.height;
    style.minHeight = it.h;
  }
  if (it.kind === "note")
    return (
      <div
        className={`bi note${it.big ? " big" : ""}`}
        data-id={it.id}
        style={{ ...style, background: PALETTE[it.color], color: textOn(it.color), visibility: hidden ? "hidden" : undefined }}
      >
        <div className="note-text">{it.text}</div>
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

function InkView({ src }: { src: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) void loadInk(ctx, src);
  }, [src]);
  return <canvas ref={ref} className="ink" width={INK_W} height={INK_H} />;
}

export function BoardView({
  board,
  date,
  dataDir,
  fit = "contain",
  onClick,
}: {
  board: Board;
  date: string;
  dataDir: string;
  fit?: "contain" | "width";
  onClick?: () => void;
}) {
  const [zoom, setZoom] = useState<ImageItem | null>(null);
  return (
    <>
      <Stage fit={fit} className={onClick ? "clickable" : undefined} boardProps={{ onClick }}>
        {() => (
          <>
            <div className="bd-items">
              {board.items.map((it) => (
                <ItemView key={it.id} it={it} date={date} dataDir={dataDir} onImageClick={onClick ? undefined : setZoom} />
              ))}
            </div>
            {board.ink && <InkView src={board.ink} />}
          </>
        )}
      </Stage>
      {zoom && <Lightbox item={zoom} date={date} dataDir={dataDir} onClose={() => setZoom(null)} />}
    </>
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
