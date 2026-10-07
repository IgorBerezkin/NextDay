import { memo, useMemo } from "react";
import { COLORS, FACE_COLORS, ICONS, type IconDef, type IconName } from "./icons";

type Run = { x: number; y: number; w: number; fill: string };

export function iconRuns(name: IconName, palette: Record<string, string> = {}): Run[] {
  return runs(ICONS[name], palette);
}

function runs(def: IconDef, palette: Record<string, string>): Run[] {
  const h = def.map.length;
  const w = def.map[0].length;
  const grid: string[][] = def.map.map((r) => [...r]);
  if (def.outline) {
    const out = grid.map((r) => [...r]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (grid[y][x] !== ".") continue;
        const near = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ].some(([a, b]) => a >= 0 && b >= 0 && a < w && b < h && grid[b][a] !== "." && grid[b][a] !== "k");
        if (near) out[y][x] = "k";
      }
    for (let y = 0; y < h; y++) grid[y] = out[y];
  }
  const res: Run[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const ch = grid[y][x];
      if (ch === ".") {
        x++;
        continue;
      }
      let e = x + 1;
      while (e < w && grid[y][e] === ch) e++;
      res.push({ x, y, w: e - x, fill: ch === "#" ? "currentColor" : (palette[ch] ?? COLORS[ch] ?? "currentColor") });
      x = e;
    }
  }
  return res;
}

type Props = {
  name: IconName;
  scale?: number;
  className?: string;
  title?: string;
  face?: string;
  style?: React.CSSProperties;
};

export const Px = memo(function Px({ name, scale = 2, className, title, face, style }: Props) {
  const def: IconDef = ICONS[name];
  const w = def.map[0].length;
  const h = def.map.length;
  const rs = useMemo(() => runs(def, { f: face ?? "#ffcd75" }), [def, face]);
  return (
    <svg
      className={"px" + (className ? " " + className : "")}
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden={title ? undefined : true}
      style={style}
    >
      {title && <title>{title}</title>}
      {rs.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
});

export function Face({ rating, scale = 2, title }: { rating: number; scale?: number; title?: string }) {
  const r = Math.max(1, Math.min(5, Math.round(rating)));
  return <Px name={`face${r}` as IconName} face={FACE_COLORS[r]} scale={scale} title={title} />;
}
