import { useMemo, useRef, useState, type ReactNode } from "react";

const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const W = 640;
const H = 300;
const M = { l: 52, r: 18, t: 14, b: 40 };

export type ChartSpec = {
  type?: "line" | "bar" | "scatter";
  title?: string;
  x?: (number | string)[];
  series: { name?: string; y: (number | null)[] }[];
  xlabel?: string;
  ylabel?: string;
};

function nice(span: number) {
  const raw = span / 5;
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function ticks(lo: number, hi: number) {
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const step = nice(hi - lo);
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = a; v <= b + step / 2; v += step) out.push(Math.round(v / step) * step);
  return out;
}

function fmt(v: number) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}K`;
  return String(+v.toFixed(a < 1 && a > 0 ? 3 : 2));
}

function barPath(x: number, y0: number, y1: number, w: number) {
  const top = Math.min(y0, y1);
  const h = Math.abs(y1 - y0);
  const r = Math.min(4, w / 2, h);
  if (y1 <= y0) return `M${x},${y0}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${y0}Z`;
  const bot = top + h;
  return `M${x},${y0}V${bot - r}Q${x},${bot} ${x + r},${bot}H${x + w - r}Q${x + w},${bot} ${x + w},${bot - r}V${y0}Z`;
}

type Tip = { x: number; y: number; title: string; rows: { color: string; name: string; value: string }[] };

export function Chart({ spec }: { spec: ChartSpec }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [table, setTable] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const type = spec.type ?? "line";
  const series = (type === "scatter" ? spec.series.slice(0, 3) : spec.series.slice(0, SERIES.length)).map((s, i) => ({
    name: s.name ?? (spec.series.length > 1 ? `ряд ${i + 1}` : ""),
    y: s.y,
    color: SERIES[i],
  }));
  const n = Math.max(0, ...series.map((s) => s.y.length));
  const xs = spec.x ?? Array.from({ length: n }, (_, i) => i);
  const numeric = type !== "bar" && xs.every((v) => typeof v === "number");
  const vals = series.flatMap((s) => s.y.filter((v): v is number => typeof v === "number" && Number.isFinite(v)));
  const yt = ticks(Math.min(type === "bar" ? 0 : Infinity, ...vals), Math.max(type === "bar" ? 0 : -Infinity, ...vals));
  const ylo = yt[0];
  const yhi = yt[yt.length - 1];
  const sy = (v: number) => M.t + (H - M.t - M.b) * (1 - (v - ylo) / (yhi - ylo || 1));
  const xnum = xs as number[];
  const xlo = numeric ? Math.min(...xnum) : 0;
  const xhi = numeric ? Math.max(...xnum) : 0;
  const band = (W - M.l - M.r) / Math.max(1, xs.length);
  const sx = (i: number) => (numeric ? M.l + ((W - M.l - M.r) * (xnum[i] - xlo)) / (xhi - xlo || 1) : M.l + band * (i + 0.5));
  const xtv = numeric ? ticks(xlo, xhi).filter((v) => v >= xlo && v <= xhi) : [];
  const step = Math.max(1, Math.ceil(xs.length / 10));

  const point = (e: React.PointerEvent) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return null;
    return { px: ((e.clientX - r.left) / r.width) * W, py: ((e.clientY - r.top) / r.height) * H };
  };

  const near = (px: number) => {
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(sx(i) - px) < Math.abs(sx(best) - px)) best = i;
    return best;
  };

  const tipAt = (i: number, y: number, only?: number): Tip => ({
    x: sx(i),
    y,
    title: String(xs[i]),
    rows: series
      .map((s, k) => ({ color: s.color, name: s.name, value: typeof s.y[i] === "number" ? fmt(s.y[i] as number) : "нет", k }))
      .filter((r) => only === undefined || r.k === only),
  });

  const onMove = (e: React.PointerEvent) => {
    const p = point(e);
    if (!p || !xs.length) return;
    if (type === "line") {
      setTip(tipAt(near(p.px), p.py));
      return;
    }
    if (type === "scatter") {
      let hit: { i: number; k: number; d: number } | null = null;
      series.forEach((s, k) =>
        s.y.forEach((v, i) => {
          if (typeof v !== "number") return;
          const d = Math.hypot(sx(i) - p.px, sy(v) - p.py);
          if (d < 24 && (!hit || d < hit.d)) hit = { i, k, d };
        }),
      );
      const h = hit as { i: number; k: number; d: number } | null;
      setTip(h ? tipAt(h.i, sy(series[h.k].y[h.i] as number), h.k) : null);
    }
  };

  const bw = Math.min(24, (band - 8) / Math.max(1, series.length) - 2);
  const marks: ReactNode[] = [];
  series.forEach((s, k) => {
    if (type === "bar") {
      s.y.forEach((v, i) => {
        if (typeof v !== "number") return;
        const x0 = sx(i) - (series.length * (bw + 2)) / 2 + k * (bw + 2) + 1;
        marks.push(
          <path
            key={`b${k}-${i}`}
            d={barPath(x0, sy(Math.max(ylo, Math.min(0, yhi))), sy(v), bw)}
            fill={s.color}
            className="viz-bar"
            onPointerEnter={() => setTip(tipAt(i, sy(v), k))}
            onPointerLeave={() => setTip(null)}
          />,
        );
      });
      return;
    }
    if (type === "line") {
      let d = "";
      let pen = false;
      s.y.forEach((v, i) => {
        if (typeof v !== "number" || !Number.isFinite(v)) {
          pen = false;
          return;
        }
        d += `${pen ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`;
        pen = true;
      });
      marks.push(<path key={`l${k}`} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />);
      if (s.y.length <= 24)
        s.y.forEach((v, i) => {
          if (typeof v === "number")
            marks.push(<circle key={`d${k}-${i}`} cx={sx(i)} cy={sy(v)} r={4} fill={s.color} stroke="var(--paper-hi)" strokeWidth={2} />);
        });
      return;
    }
    s.y.forEach((v, i) => {
      if (typeof v === "number")
        marks.push(<circle key={`s${k}-${i}`} cx={sx(i)} cy={sy(v)} r={4} fill={s.color} stroke="var(--paper-hi)" strokeWidth={2} />);
    });
  });

  return (
    <figure className="viz">
      <div className="viz-top">
        {spec.title && <figcaption>{spec.title}</figcaption>}
        <span className="grow" />
        <button className="viz-toggle" onClick={() => setTable((t) => !t)}>
          {table ? "График" : "Таблица"}
        </button>
      </div>
      {series.length > 1 && (
        <div className="viz-legend">
          {series.map((s, k) => (
            <span key={k}>
              <i className={`viz-key ${type}`} style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      {table ? (
        <table className="viz-table">
          <thead>
            <tr>
              <th>{spec.xlabel ?? "x"}</th>
              {series.map((s, k) => (
                <th key={k}>{s.name || "y"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {xs.map((x, i) => (
              <tr key={i}>
                <td>{String(x)}</td>
                {series.map((s, k) => (
                  <td key={k}>{typeof s.y[i] === "number" ? fmt(s.y[i] as number) : ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="viz-plot">
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
            {yt.map((v) => (
              <g key={`y${v}`}>
                <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} className={v === 0 ? "viz-zero" : "viz-grid"} />
                <text x={M.l - 8} y={sy(v) + 5} textAnchor="end" className="viz-tick">
                  {fmt(v)}
                </text>
              </g>
            ))}
            {numeric
              ? xtv.map((v) => (
                  <text
                    key={`x${v}`}
                    x={M.l + ((W - M.l - M.r) * (v - xlo)) / (xhi - xlo || 1)}
                    y={H - M.b + 20}
                    textAnchor="middle"
                    className="viz-tick"
                  >
                    {fmt(v)}
                  </text>
                ))
              : xs.map((v, i) =>
                  i % step === 0 ? (
                    <text key={`x${i}`} x={sx(i)} y={H - M.b + 20} textAnchor="middle" className="viz-tick">
                      {String(v).slice(0, 10)}
                    </text>
                  ) : null,
                )}
            {spec.xlabel && (
              <text x={(W + M.l) / 2} y={H - 4} textAnchor="middle" className="viz-label">
                {spec.xlabel}
              </text>
            )}
            {spec.ylabel && (
              <text x={12} y={M.t + 4} className="viz-label">
                {spec.ylabel}
              </text>
            )}
            {marks}
            {tip && type === "line" && <line x1={tip.x} x2={tip.x} y1={M.t} y2={H - M.b} className="viz-cross" />}
          </svg>
          {tip && (
            <div className="viz-tip" style={{ left: `${(tip.x / W) * 100}%`, top: `${(tip.y / H) * 100}%` }}>
              <small>{tip.title}</small>
              {tip.rows.map((r, i) => (
                <div key={i}>
                  <i className="viz-key line" style={{ background: r.color }} />
                  <b>{r.value}</b> {r.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

type Tok = { k: "num"; v: number } | { k: "id"; v: string } | { k: "op"; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ k: "num", v: Number(src.slice(i, j)) });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z_0-9]/.test(src[j])) j++;
      out.push({ k: "id", v: src.slice(i, j) });
      i = j;
    } else if (src.startsWith("**", i)) {
      out.push({ k: "op", v: "^" });
      i += 2;
    } else if ("+-*/^()".includes(c)) {
      out.push({ k: "op", v: c });
      i++;
    } else throw new Error(`непонятный символ ${c}`);
  }
  return out;
}

const FN: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  sigmoid: (v) => 1 / (1 + Math.exp(-v)),
  relu: (v) => Math.max(0, v),
  tanh: Math.tanh,
};

type Ex = (x: number) => number;

function compile(src: string): Ex {
  const t = lex(src);
  let i = 0;
  const peek = () => t[i];
  const isOp = (v: string) => peek()?.k === "op" && peek()?.v === v;
  const expr = (): Ex => {
    let a = term();
    while (isOp("+") || isOp("-")) {
      const op = t[i++].v;
      const l = a;
      const r = term();
      a = op === "+" ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return a;
  };
  const term = (): Ex => {
    let a = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = t[i++].v;
        const l = a;
        const r = unary();
        a = op === "*" ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
      } else if (peek() && (peek().k === "id" || peek().k === "num" || isOp("("))) {
        const l = a;
        const r = unary();
        a = (x) => l(x) * r(x);
      } else return a;
    }
  };
  const unary = (): Ex => {
    if (isOp("-")) {
      i++;
      const a = unary();
      return (x) => -a(x);
    }
    return power();
  };
  const power = (): Ex => {
    const base = primary();
    if (isOp("^")) {
      i++;
      const e = unary();
      return (x) => Math.pow(base(x), e(x));
    }
    return base;
  };
  const primary = (): Ex => {
    const tk = t[i++];
    if (!tk) throw new Error("формула оборвалась");
    if (tk.k === "num") return () => tk.v;
    if (tk.k === "op" && tk.v === "(") {
      const a = expr();
      if (!isOp(")")) throw new Error("не закрыта скобка");
      i++;
      return a;
    }
    if (tk.k === "id") {
      if (tk.v === "x") return (x) => x;
      if (tk.v === "pi") return () => Math.PI;
      if (tk.v === "e") return () => Math.E;
      const f = FN[tk.v];
      if (f) {
        if (!isOp("(")) throw new Error(`после ${tk.v} нужна скобка`);
        i++;
        const a = expr();
        if (!isOp(")")) throw new Error("не закрыта скобка");
        i++;
        return (x) => f(a(x));
      }
      throw new Error(`непонятное имя ${tk.v}`);
    }
    throw new Error(`непонятный символ ${tk.v}`);
  };
  const out = expr();
  if (i < t.length) throw new Error("лишнее в конце формулы");
  return out;
}

export function Plot({ src }: { src: string }) {
  const res = useMemo(() => {
    let lo = -5;
    let hi = 5;
    let title = "";
    const fs: { name: string; f: Ex }[] = [];
    for (const raw of src.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const range = line.match(/^x\s*=\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)$/);
      if (range) {
        lo = Number(range[1]);
        hi = Number(range[2]);
        continue;
      }
      const t = line.match(/^title\s*:\s*(.+)$/);
      if (t) {
        title = t[1];
        continue;
      }
      const m = line.match(/^y\s*=\s*(.+)$/);
      if (!m) throw new Error(`не понял строку: ${line}`);
      fs.push({ name: `y = ${m[1]}`, f: compile(m[1]) });
    }
    if (!fs.length) throw new Error("нет ни одной строки y = ...");
    if (!(hi > lo)) throw new Error("диапазон x пустой");
    const N = 161;
    const x = Array.from({ length: N }, (_, i) => +(lo + ((hi - lo) * i) / (N - 1)).toFixed(6));
    const series = fs.map(({ name, f }) => ({ name, y: x.map((v) => (Number.isFinite(f(v)) && Math.abs(f(v)) < 1e9 ? f(v) : null)) }));
    return { spec: { type: "line" as const, title: title || (fs.length === 1 ? fs[0].name : undefined), x, series }, error: null };
  }, [src]);
  return <Chart spec={res.spec} />;
}

export function SafePlot({ src }: { src: string }) {
  try {
    compileCheck(src);
  } catch (e) {
    return <pre className="viz-error">График не построен: {(e as Error).message}</pre>;
  }
  return <Plot src={src} />;
}

function compileCheck(src: string) {
  let ok = false;
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    const m = line.match(/^y\s*=\s*(.+)$/);
    if (m) {
      compile(m[1]);
      ok = true;
    } else if (line && !/^x\s*=/.test(line) && !/^title\s*:/.test(line)) throw new Error(`не понял строку: ${line}`);
  }
  if (!ok) throw new Error("нет ни одной строки y = ...");
}

type Edge = { a: string; b: string; dir: boolean; label: string };

function parseGraph(src: string) {
  const edges: Edge[] = [];
  const nodes: string[] = [];
  const add = (n: string) => {
    if (!nodes.includes(n)) nodes.push(n);
  };
  for (const part of src.split(/[\n,;]/)) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^(.+?)\s*(->|-)\s*(.+?)(?:\s*:\s*(.+))?$/);
    if (!m) {
      add(s);
      continue;
    }
    add(m[1]);
    add(m[3]);
    edges.push({ a: m[1], b: m[3], dir: m[2] === "->", label: m[4] ?? "" });
  }
  return { nodes, edges };
}

export function Graph({ src }: { src: string }) {
  const { nodes, edges } = useMemo(() => parseGraph(src), [src]);
  const pos = useMemo(() => {
    const directed = edges.length > 0 && edges.every((e) => e.dir);
    const p = new Map<string, { x: number; y: number }>();
    if (directed) {
      const indeg = new Map(nodes.map((n) => [n, 0]));
      edges.forEach((e) => indeg.set(e.b, (indeg.get(e.b) ?? 0) + 1));
      const layer = new Map<string, number>();
      const queue = nodes.filter((n) => !indeg.get(n));
      queue.forEach((n) => layer.set(n, 0));
      let guard = 0;
      while (queue.length && guard++ < 10000) {
        const n = queue.shift()!;
        for (const e of edges.filter((x) => x.a === n)) {
          layer.set(e.b, Math.max(layer.get(e.b) ?? 0, (layer.get(n) ?? 0) + 1));
          indeg.set(e.b, (indeg.get(e.b) ?? 1) - 1);
          if (!indeg.get(e.b)) queue.push(e.b);
        }
      }
      if (layer.size === nodes.length) {
        const cols = Math.max(...layer.values()) + 1;
        const byCol: string[][] = Array.from({ length: cols }, () => []);
        nodes.forEach((n) => byCol[layer.get(n)!].push(n));
        byCol.forEach((col, c) =>
          col.forEach((n, i) => p.set(n, { x: 50 + ((W - 100) * c) / Math.max(1, cols - 1), y: 40 + ((H - 80) * (i + 0.5)) / col.length })),
        );
        if (cols === 1) nodes.forEach((n, i) => p.set(n, { x: W / 2, y: 40 + ((H - 80) * (i + 0.5)) / nodes.length }));
        return p;
      }
    }
    nodes.forEach((n, i) => {
      const a = (2 * Math.PI * i) / Math.max(1, nodes.length) - Math.PI / 2;
      p.set(n, { x: W / 2 + Math.cos(a) * 110 * (nodes.length > 1 ? 1.4 : 0), y: H / 2 + Math.sin(a) * 110 * (nodes.length > 1 ? 1 : 0) });
    });
    return p;
  }, [nodes, edges]);
  const R = 17;
  return (
    <figure className="viz">
      <div className="viz-plot">
        <svg viewBox={`0 0 ${W} ${H}`}>
          <defs>
            <marker id="viz-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 Z" fill="var(--ink2)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = pos.get(e.a)!;
            const b = pos.get(e.b)!;
            const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const ux = (b.x - a.x) / d;
            const uy = (b.y - a.y) / d;
            return (
              <g key={i}>
                <line
                  x1={a.x + ux * R}
                  y1={a.y + uy * R}
                  x2={b.x - ux * (R + 2)}
                  y2={b.y - uy * (R + 2)}
                  stroke="var(--ink2)"
                  strokeWidth={2}
                  markerEnd={e.dir ? "url(#viz-arrow)" : undefined}
                />
                {e.label && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" className="viz-tick">
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          {nodes.map((n) => {
            const q = pos.get(n)!;
            return (
              <g key={n}>
                <circle cx={q.x} cy={q.y} r={R} fill="var(--paper)" stroke="var(--ink)" strokeWidth={2} />
                <text x={q.x} y={q.y + 5} textAnchor="middle" className="viz-node">
                  {n.slice(0, 4)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
