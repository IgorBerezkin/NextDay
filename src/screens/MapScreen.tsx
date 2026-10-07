import { useEffect, useMemo, useRef, useState } from "react";
import type { Nav } from "../App";
import { api, type TaskNode } from "../api";
import { useZoom, ZoomBar, ZoomStage } from "../board/Stage";
import { Button, Check, Linkify, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { dayMonth, hoursText, longDate, plural, shortWeekday } from "../util";

const PAD = 40;
const HEAD_H = 56;
const COL_W = 270;
const ROW_H = 112;
const NODE_W = 228;
const NODE_H = 84;

type Placed = { node: TaskNode; key: string; x: number; y: number };
type Edge = { from: Placed; to: Placed };

const keyOf = (n: { date: string; id: string }) => `${n.date}/${n.id}`;

function layout(nodes: TaskNode[], showAll: boolean) {
  const byKey = new Map(nodes.map((n) => [keyOf(n), n]));
  const parent = new Map<string, string>();
  const kids = new Map<string, string[]>();
  for (const n of nodes) {
    const p = n.from && byKey.has(keyOf(n.from)) ? keyOf(n.from) : null;
    if (!p) continue;
    parent.set(keyOf(n), p);
    kids.set(p, [...(kids.get(p) ?? []), keyOf(n)]);
  }
  const linked = (k: string) => parent.has(k) || kids.has(k);
  const shown = nodes.filter((n) => showAll || linked(keyOf(n)));
  const dates = [...new Set(shown.map((n) => n.date))].sort();
  const col = new Map(dates.map((d, i) => [d, i]));
  const lanes = new Map<string, number>();
  let lane = -1;
  const place = (k: string, l: number) => {
    lanes.set(k, l);
    (kids.get(k) ?? []).forEach((c, i) => place(c, i === 0 ? l : ++lane));
  };
  for (const n of shown) {
    const k = keyOf(n);
    if (!parent.has(k) && kids.has(k)) place(k, ++lane);
  }
  const loose = new Map<string, number>();
  for (const n of shown) {
    const k = keyOf(n);
    if (lanes.has(k)) continue;
    const used = loose.get(n.date) ?? 0;
    loose.set(n.date, used + 1);
    lanes.set(k, lane + 1 + used);
  }
  const placed = new Map<string, Placed>();
  for (const n of shown) {
    const k = keyOf(n);
    placed.set(k, { node: n, key: k, x: PAD + col.get(n.date)! * COL_W, y: PAD + HEAD_H + lanes.get(k)! * ROW_H });
  }
  const edges: Edge[] = [];
  for (const [k, p] of parent) {
    const a = placed.get(p);
    const b = placed.get(k);
    if (a && b) edges.push({ from: a, to: b });
  }
  const laneCount = Math.max(1, ...[...lanes.values()].map((l) => l + 1));
  return {
    placed,
    edges,
    dates,
    parent,
    kids,
    width: Math.max(900, PAD * 2 + dates.length * COL_W),
    height: Math.max(560, PAD * 2 + HEAD_H + laneCount * ROW_H),
    linkedCount: nodes.filter((n) => linked(keyOf(n))).length,
  };
}

export function MapScreen({ nav, focus }: { nav: Nav; focus?: string }) {
  const { ov, go } = nav;
  const [nodes, setNodes] = useState<TaskNode[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(focus ?? null);
  const [q, setQ] = useState("");
  const centered = useRef(false);

  useEffect(() => {
    api.tasks().then(setNodes).catch(toastError);
  }, [ov.todayDay, ov.tomorrowDay]);

  const map = useMemo(() => layout(nodes ?? [], showAll), [nodes, showAll]);
  const zoom = useZoom(map.width, map.height, (e) => !(e.target as HTMLElement).closest(".mnode"));
  const needle = q.trim().toLowerCase();
  const hits = needle ? [...map.placed.values()].filter((p) => `${p.node.text} ${p.node.note ?? ""}`.toLowerCase().includes(needle)) : [];

  const center = (k: string, s?: number) => {
    const p = map.placed.get(k);
    if (p) zoom.focus(p.x + NODE_W / 2, p.y + NODE_H / 2, s);
  };

  useEffect(() => {
    if (focus && nodes && !showAll && !map.placed.has(focus)) setShowAll(true);
  }, [focus, nodes, showAll, map]);

  useEffect(() => {
    if (centered.current || !nodes || !zoom.ready || (focus && !map.placed.has(focus))) return;
    centered.current = true;
    if (zoom.fitScale >= 0.6) return;
    if (focus) center(focus, 0.8);
    else zoom.showEnd(0.8);
  });

  const pick = (k: string) => {
    setSelected(k);
    center(k);
  };

  const sel = selected ? map.placed.get(selected) : undefined;
  const parentKey = sel ? map.parent.get(sel.key) : undefined;
  const parentNode = parentKey ? map.placed.get(parentKey)?.node : undefined;
  const childNodes = sel
    ? (map.kids.get(sel.key) ?? []).flatMap((k) => {
        const c = map.placed.get(k);
        return c ? [c.node] : [];
      })
    : [];

  return (
    <div className="screen map-screen">
      <div className="map-stage">
        <ZoomStage bw={map.width} bh={map.height} zoom={zoom} className="map-board">
          {() => (
            <>
              {map.dates.map((d, i) => (
                <div
                  key={d}
                  className={`map-col${d === ov.today ? " today" : ""}`}
                  style={{ left: PAD + i * COL_W - (COL_W - NODE_W) / 2, width: COL_W, height: map.height }}
                >
                  <span>
                    {shortWeekday(d)}, {dayMonth(d)}
                  </span>
                </div>
              ))}
              <svg className="map-edges" width={map.width} height={map.height} shapeRendering="crispEdges">
                {map.edges.map(({ from, to }) => {
                  const x1 = from.x + NODE_W;
                  const y1 = from.y + NODE_H / 2;
                  const x2 = to.x - 8;
                  const y2 = to.y + NODE_H / 2;
                  const xm = x1 + 18;
                  const hot = selected === from.key || selected === to.key;
                  return (
                    <g key={to.key} className={hot ? "hot" : ""}>
                      <path d={`M${x1} ${y1}H${xm}V${y2}H${x2}`} />
                      <polygon points={`${x2},${y2 - 8} ${x2 + 8},${y2} ${x2},${y2 + 8}`} />
                    </g>
                  );
                })}
              </svg>
              {[...map.placed.values()].map((p) => (
                <button
                  key={p.key}
                  className={`mnode${p.node.done ? " done" : ""}${p.key === selected ? " sel" : ""}${hits.includes(p) ? " hit" : ""}`}
                  style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                  onClick={() => setSelected(p.key)}
                  onDoubleClick={() => go({ name: "day", date: p.node.date })}
                >
                  <span className="mnode-head">
                    <Px name={p.node.done ? "check" : "box"} scale={1.5} />
                    <span>{dayMonth(p.node.date)}</span>
                    {p.node.note && <Px name="note" scale={1.5} />}
                  </span>
                  <span className="mnode-text">
                    <Linkify inert text={p.node.text} />
                  </span>
                </button>
              ))}
            </>
          )}
        </ZoomStage>
        {map.placed.size > 0 && <ZoomBar zoom={zoom} />}
        {nodes && map.placed.size === 0 && (
          <div className="empty map-empty">
            <Px name="map" scale={5} />
            <h2 className="empty-title">Карта задач пока пустая</h2>
            <p>
              Карта появляется, когда задачи продолжают друг друга. При планировании нажми у пункта значок цепочки и выбери задачу из
              прошлого, или перенеси недоделанный пункт на завтра: связь появится сама.
            </p>
            {nodes.length > 0 && (
              <Button kind="paper" icon="map" onClick={() => setShowAll(true)}>
                Показать все задачи без связей
              </Button>
            )}
          </div>
        )}
      </div>

      <aside className="map-side">
        <input
          className="field search"
          placeholder="Найти задачу"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && hits[0] && pick(hits[0].key)}
        />
        {needle && (
          <p className="muted">
            {hits.length ? `Нашлось: ${plural(hits.length, "задача", "задачи", "задач")}. Enter: перейти к первой.` : "Ничего не нашлось."}
          </p>
        )}
        <Check checked={showAll} onChange={setShowAll} label="Показывать задачи без связей" />

        {sel ? (
          <section className="map-card">
            <div className="map-card-date">
              {longDate(sel.node.date)} · «{sel.node.dayName}»
            </div>
            <h2 className="map-card-title">
              <Px name={sel.node.done ? "check" : "box"} scale={2} />
              <span>
                <Linkify text={sel.node.text} />
              </span>
            </h2>
            <p className="muted">
              {sel.node.done ? "Сделана" : "Не сделана"}
              {sel.node.hours != null && <> · {hoursText(sel.node.hours)} ч</>}
              {sel.node.subsTotal > 0 && (
                <>
                  {" "}
                  · подпункты {sel.node.subsDone}/{sel.node.subsTotal}
                </>
              )}
            </p>
            {sel.node.note && (
              <blockquote className="map-note">
                <Linkify text={sel.node.note} />
              </blockquote>
            )}
            {parentNode && (
              <div className="map-links">
                <span className="muted">Продолжает:</span>
                <button className="map-link" onClick={() => pick(keyOf(parentNode))}>
                  <Px name="arrowL" scale={1.5} /> <Linkify inert text={parentNode.text} />, {dayMonth(parentNode.date)}
                </button>
              </div>
            )}
            {childNodes.length > 0 && (
              <div className="map-links">
                <span className="muted">Продолжения:</span>
                {childNodes.map((c) => (
                  <button key={keyOf(c)} className="map-link" onClick={() => pick(keyOf(c))}>
                    <Px name="arrowR" scale={1.5} /> <Linkify inert text={c.text} />, {dayMonth(c.date)}
                  </button>
                ))}
              </div>
            )}
            <Button kind="paper" icon="calendar" onClick={() => go({ name: "day", date: sel.node.date })}>
              Открыть день
            </Button>
          </section>
        ) : (
          map.placed.size > 0 && (
            <p className="muted map-help">
              Нажми на задачу, чтобы увидеть её описание с доски и соседей по цепочке. Двойной клик открывает день. Карту можно двигать
              мышью и приближать колесом с Ctrl.
            </p>
          )
        )}
      </aside>
    </div>
  );
}
