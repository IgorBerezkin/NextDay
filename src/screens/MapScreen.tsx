import { useEffect, useMemo, useRef, useState } from "react";
import type { Nav } from "../App";
import { api, type Goal, type GoalTask, type TaskKind, type Topic } from "../api";
import { useZoom, ZoomBar, ZoomStage } from "../board/Stage";
import { sfx } from "../sound";
import { Button, Linkify, Progress, toast, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { hoursText, parseHours, uid } from "../util";
import { finishText, GOAL_STATUS, KIND, KINDS, mins, taskWhen, topicState, useGoals } from "./goalKit";

const PAD = 48;
const NODE_W = 220;
const NODE_H = 78;
const COL_W = 300;
const ROW_H = 112;
const LANE_H = 34;

type Point = { x: number; y: number };
type Placed = { topic: Topic; x: number; y: number };
type Edge = { key: string; d: string; tip: Point; ids: [string, string] };
type Slot = { key: string; layer: number; topic?: Topic; goal?: boolean };

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function layout(goal: Goal) {
  const topics = goal.topics;
  const known = new Set(topics.map((t) => t.id));
  const reqs = new Map(topics.map((t) => [t.id, t.requires.filter((r) => known.has(r))]));
  const deps = new Map(topics.map((t) => [t.id, [] as string[]]));
  topics.forEach((t) => reqs.get(t.id)!.forEach((r) => deps.get(r)!.push(t.id)));

  const layer = new Map<string, number>();
  const depth = (id: string, path: Set<string>): number => {
    const seen = layer.get(id);
    if (seen != null) return seen;
    if (path.has(id)) return 0;
    path.add(id);
    const d = reqs.get(id)!.reduce((m, r) => Math.max(m, depth(r, path) + 1), 0);
    path.delete(id);
    layer.set(id, d);
    return d;
  };
  topics.forEach((t) => depth(t.id, new Set()));
  const last = topics.length ? Math.max(...layer.values()) + 1 : 0;
  layer.set("goal", last);

  const slots = new Map<string, Slot>();
  topics.forEach((t) => slots.set(t.id, { key: t.id, layer: layer.get(t.id)!, topic: t }));
  slots.set("goal", { key: "goal", layer: last, goal: true });

  const links: [string, string][] = [];
  topics.forEach((t) => reqs.get(t.id)!.forEach((r) => links.push([r, t.id])));
  for (const t of topics) if (deps.get(t.id)!.length === 0) links.push([t.id, "goal"]);

  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  const join = (a: string, b: string) => {
    succs.set(a, [...(succs.get(a) ?? []), b]);
    preds.set(b, [...(preds.get(b) ?? []), a]);
  };
  const chains = links.map(([u, v]) => {
    const path = [u];
    for (let l = layer.get(u)! + 1; l < layer.get(v)!; l++) {
      const lane = `${u}>${v}@${l}`;
      slots.set(lane, { key: lane, layer: l });
      path.push(lane);
    }
    path.push(v);
    for (let i = 1; i < path.length; i++) join(path[i - 1], path[i]);
    return { key: `${u}>${v}`, ids: [u, v] as [string, string], path };
  });

  const cols: string[][] = Array.from({ length: last + 1 }, () => []);
  for (const sl of slots.values()) cols[sl.layer].push(sl.key);
  const pos = new Map<string, number>();
  const settle = () => cols.forEach((c) => c.forEach((k, r) => pos.set(k, r)));
  settle();
  const bary = (k: string, near?: string[]) => (near?.length ? avg(near.map((j) => pos.get(j)!)) : pos.get(k)!);
  for (let pass = 0; pass < 6; pass++) {
    for (let l = 1; l <= last; l++) {
      cols[l].sort((a, b) => bary(a, preds.get(a)) - bary(b, preds.get(b)));
      settle();
    }
    for (let l = last - 1; l >= 0; l--) {
      cols[l].sort((a, b) => bary(a, succs.get(a)) - bary(b, succs.get(b)));
      settle();
    }
  }

  const solid = (k: string) => !!(slots.get(k)!.topic || slots.get(k)!.goal);
  const tall = (k: string) => (solid(k) ? ROW_H : LANE_H);
  const colH = cols.map((c) => c.reduce((s, k) => s + tall(k), 0));
  const maxH = Math.max(ROW_H, ...colH);
  const spot = new Map<string, Point>();
  cols.forEach((c, l) => {
    let y = PAD + (maxH - colH[l]) / 2;
    for (const k of c) {
      spot.set(k, { x: PAD + l * COL_W, y: solid(k) ? y : y + LANE_H / 2 });
      y += tall(k);
    }
  });

  const edges: Edge[] = chains.map(({ key, ids, path }) => {
    const first = spot.get(path[0])!;
    let out = { x: first.x + NODE_W, y: first.y + NODE_H / 2 };
    let d = `M${out.x} ${out.y}`;
    let tip = out;
    path.slice(1).forEach((k, i) => {
      const p = spot.get(k)!;
      const end = i === path.length - 2;
      const into = end ? { x: p.x - 8, y: p.y + NODE_H / 2 } : p;
      const dx = Math.max(30, (into.x - out.x) / 2);
      d += `C${out.x + dx} ${out.y} ${into.x - dx} ${into.y} ${into.x} ${into.y}`;
      if (end) tip = { x: p.x, y: into.y };
      else {
        out = { x: p.x + NODE_W, y: p.y };
        d += `L${out.x} ${out.y}`;
      }
    });
    return { key, d, tip, ids };
  });

  const placed = new Map<string, Placed>(topics.map((t) => [t.id, { topic: t, ...spot.get(t.id)! }]));
  return {
    placed,
    edges,
    goalNode: spot.get("goal")!,
    deps,
    width: Math.max(900, PAD * 2 + last * COL_W + NODE_W),
    height: Math.max(560, PAD * 2 + maxH - (ROW_H - NODE_H)),
  };
}

function descendants(goal: Goal, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const t of goal.topics) {
      if (t.requires.includes(cur) && !out.has(t.id)) {
        out.add(t.id);
        stack.push(t.id);
      }
    }
  }
  return out;
}

export function MapScreen({ nav, focus }: { nav: Nav; focus?: string }) {
  const { goals, replace } = useGoals();
  const [focusGoal, focusTopic] = (focus ?? "").split("/");
  const [goalId, setGoalId] = useState<string | null>(focusGoal || null);

  if (!goals) return <div className="screen map-screen" />;

  const shown = goals.filter((g) => g.status !== "archived");
  const goal = goals.find((g) => g.id === goalId) ?? shown.find((g) => g.status === "active") ?? shown[0];

  if (!goal) {
    return (
      <div className="screen map-screen empty-map">
        <div className="empty map-empty">
          <Px name="map" scale={5} />
          <h2 className="empty-title">Карта целей пока пустая</h2>
          <p>
            Здесь цель видна как граф: темы и стрелки «что нужно знать до чего». Нажатие на тему показывает её задачи от простых к сложным.
            Начни с цели, а темы добавишь здесь сам или попросишь ИИ.
          </p>
          <Button kind="paper" icon="flag" onClick={() => nav.go({ name: "goals" })}>
            К целям
          </Button>
        </div>
      </div>
    );
  }

  return (
    <GoalMap
      key={goal.id}
      nav={nav}
      goal={goal}
      goals={shown}
      initial={goal.id === focusGoal ? focusTopic : undefined}
      onGoal={setGoalId}
      onChanged={(g) => {
        replace(g);
        void nav.refresh();
      }}
    />
  );
}

function GoalMap({
  nav,
  goal,
  goals,
  initial,
  onGoal,
  onChanged,
}: {
  nav: Nav;
  goal: Goal;
  goals: Goal[];
  initial?: string;
  onGoal: (id: string) => void;
  onChanged: (g: Goal) => void;
}) {
  const { ov, go } = nav;
  const [selected, setSelected] = useState<string | null>(initial || null);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const centered = useRef(false);
  const map = useMemo(() => layout(goal), [goal]);
  const zoom = useZoom(map.width, map.height, (e) => !(e.target as HTMLElement).closest(".gnode"));

  useEffect(() => {
    if (centered.current || !zoom.ready) return;
    centered.current = true;
    if (zoom.fitScale >= 0.7) return;
    const el = zoom.wrapRef.current;
    const vw = (el?.clientWidth ?? 800) / 0.8;
    const vh = (el?.clientHeight ?? 500) / 0.8;
    const clamp = (v: number, size: number, view: number) =>
      size <= view ? size / 2 : Math.min(Math.max(v, view / 2 - 12), size - view / 2 + 12);
    const show = (x: number, y: number) => zoom.focus(clamp(x, map.width, vw), clamp(y, map.height, vh), 0.8);
    const picked = selected ? map.placed.get(selected) : undefined;
    if (picked) {
      show(picked.x + NODE_W / 2, picked.y + NODE_H / 2);
      return;
    }
    const nodes = [...map.placed.values()];
    const now = nodes.find((p) => topicState(goal, p.topic) === "going") ?? nodes.find((p) => topicState(goal, p.topic) === "open");
    if (now) show(now.x + COL_W, now.y + NODE_H / 2);
  });

  const sel = selected ? goal.topics.find((t) => t.id === selected) : undefined;
  const hot = (ids: [string, string]) => !!sel && (ids[0] === sel.id || ids[1] === sel.id);
  const pick = (id: string) => {
    setSelected(id);
    setEditing(null);
  };

  return (
    <div className="screen map-screen">
      <div className="map-stage">
        <ZoomStage bw={map.width} bh={map.height} zoom={zoom} className="map-board goal-map">
          {() => (
            <>
              <svg className="gedges" width={map.width} height={map.height}>
                {map.edges.map((e) => (
                  <g key={e.key} className={hot(e.ids) ? "hot" : ""}>
                    <path d={e.d} />
                    <polygon points={`${e.tip.x - 8},${e.tip.y - 7} ${e.tip.x},${e.tip.y} ${e.tip.x - 8},${e.tip.y + 7}`} />
                  </g>
                ))}
              </svg>
              {[...map.placed.values()].map((p) => {
                const state = topicState(goal, p.topic);
                const done = p.topic.tasks.filter((k) => k.status === "done").length;
                const soon = p.topic.tasks.find(
                  (k) => k.status === "planned" && (k.plannedFor === ov.today || k.plannedFor === ov.tomorrow),
                );
                return (
                  <button
                    key={p.topic.id}
                    className={`gnode st-${state}${p.topic.id === selected ? " sel" : ""}`}
                    style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                    onClick={() => pick(p.topic.id)}
                  >
                    <span className="gnode-head">
                      {state === "locked" ? <Px name="lock" scale={1.5} /> : state === "done" ? <Px name="check" scale={1.5} /> : <i />}
                      <span>
                        {done}/{p.topic.tasks.length}
                      </span>
                      {soon && <span className="gnode-soon">{soon.plannedFor === ov.today ? "сегодня" : "завтра"}</span>}
                    </span>
                    <span className="gnode-title">{p.topic.title}</span>
                  </button>
                );
              })}
              <div className="gnode goal-node" style={{ left: map.goalNode.x, top: map.goalNode.y, width: NODE_W, height: NODE_H }}>
                <span className="gnode-head">
                  <Px name="sTrophy" scale={1.5} />
                  <span>цель</span>
                </span>
                <span className="gnode-title">{goal.title}</span>
              </div>
            </>
          )}
        </ZoomStage>
        <ZoomBar zoom={zoom} />
        {goal.topics.length === 0 && (
          <div className="map-hint">
            <p>В цели пока нет тем. Добавь первую тему справа или попроси ИИ разложить цель на темы.</p>
          </div>
        )}
      </div>

      <aside className="map-side">
        {goals.length > 1 ? (
          <select className="field select goal-pick" value={goal.id} onChange={(e) => onGoal(e.target.value)}>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        ) : (
          <h2 className="map-goal-title">
            <Px name="flag" scale={2} /> {goal.title}
          </h2>
        )}

        {editing ? (
          <TopicEditor
            key={editing.id ?? "new"}
            goal={goal}
            topic={editing.id ? goal.topics.find((t) => t.id === editing.id) : undefined}
            onCancel={() => setEditing(null)}
            onSaved={(g, id) => {
              onChanged(g);
              setEditing(null);
              setSelected(id);
            }}
            onDeleted={(g) => {
              onChanged(g);
              setEditing(null);
              setSelected(null);
            }}
          />
        ) : sel ? (
          <TopicPanel
            key={sel.id}
            goal={goal}
            topic={sel}
            deps={map.deps.get(sel.id) ?? []}
            today={ov.today}
            tomorrow={ov.tomorrow}
            onPick={pick}
            onEdit={() => setEditing({ id: sel.id })}
            onChanged={onChanged}
          />
        ) : (
          <GoalSummary goal={goal} onNew={() => setEditing({ id: null })} onGoal={() => go({ name: "goals", focus: goal.id })} />
        )}
      </aside>
    </div>
  );
}

function GoalSummary({ goal, onNew, onGoal }: { goal: Goal; onNew: () => void; onGoal: () => void }) {
  const p = goal.progress;
  const finish = finishText(goal);
  return (
    <section className="map-card">
      <p className="muted">
        {GOAL_STATUS[goal.status]} · темы {p.topicsDone} из {p.topicsTotal} · задачи {p.tasksDone} из {p.tasksTotal}
      </p>
      <Progress value={p.tasksTotal ? p.tasksDone / p.tasksTotal : 0} />
      {finish && <p className={`goal-finish${finish.late ? " late" : ""}`}>Прогноз: {finish.text}</p>}
      <p className="muted map-help">
        Стрелка ведёт от темы, которую нужно знать, к теме, которой она нужна. Тема открывается, когда пройдены все темы до неё. Нажми на
        тему, чтобы увидеть её задачи от простых к сложным. Карту можно двигать мышью и приближать колесом с Ctrl.
      </p>
      <ul className="map-legend">
        <li>
          <i className="lg st-done" /> пройдена
        </li>
        <li>
          <i className="lg st-going" /> идёт
        </li>
        <li>
          <i className="lg st-open" /> открыта
        </li>
        <li>
          <i className="lg st-locked" /> закрыта
        </li>
      </ul>
      <div className="map-actions">
        <Button kind="paper" icon="plus" onClick={onNew}>
          Новая тема
        </Button>
        <Button kind="ghost" icon="flag" onClick={onGoal}>
          К цели
        </Button>
      </div>
    </section>
  );
}

function TopicPanel({
  goal,
  topic,
  deps,
  today,
  tomorrow,
  onPick,
  onEdit,
  onChanged,
}: {
  goal: Goal;
  topic: Topic;
  deps: string[];
  today: string;
  tomorrow: string;
  onPick: (id: string) => void;
  onEdit: () => void;
  onChanged: (g: Goal) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const state = topicState(goal, topic);
  const before = topic.requires.map((id) => goal.topics.find((t) => t.id === id)).filter((t): t is Topic => !!t);
  const after = deps.map((id) => goal.topics.find((t) => t.id === id)).filter((t): t is Topic => !!t);
  const waiting = before.filter((t) => topicState(goal, t) !== "done");
  const stateText =
    state === "done"
      ? "Тема пройдена."
      : state === "locked"
        ? `Тема закрыта: сначала ${waiting.map((t) => `«${t.title}»`).join(", ")}.`
        : state === "going"
          ? "Тема идёт."
          : "Тема открыта: её задачи попадут в план по очереди.";
  return (
    <section className="map-card">
      <h2 className="map-card-title">
        <span>{topic.title}</span>
      </h2>
      <p className={`topic-state st-${state}`}>{stateText}</p>
      {before.length > 0 && (
        <div className="map-links">
          <span className="muted">Нужно знать до неё:</span>
          {before.map((t) => (
            <button key={t.id} className="map-link" onClick={() => onPick(t.id)}>
              <Px name="arrowL" scale={1.5} /> {t.title}
            </button>
          ))}
        </div>
      )}
      {after.length > 0 && (
        <div className="map-links">
          <span className="muted">Открывает:</span>
          {after.map((t) => (
            <button key={t.id} className="map-link" onClick={() => onPick(t.id)}>
              <Px name="arrowR" scale={1.5} /> {t.title}
            </button>
          ))}
        </div>
      )}
      {topic.note && (
        <blockquote className="map-note">
          <Linkify text={topic.note} />
        </blockquote>
      )}
      <h3 className="topic-tasks-title">Задачи от простых к сложным</h3>
      {topic.tasks.length === 0 ? (
        <p className="muted">Задач пока нет.</p>
      ) : (
        <ol className="topic-tasks">
          {topic.tasks.map((t, i) => (
            <TaskRow
              key={t.id}
              goal={goal}
              task={t}
              rank={i + 1}
              when={taskWhen(t, today, tomorrow)}
              open={open === t.id}
              onToggle={() => setOpen(open === t.id ? null : t.id)}
              onChanged={onChanged}
            />
          ))}
        </ol>
      )}
      <div className="map-actions">
        <Button kind="paper" small icon="pencil" onClick={onEdit}>
          Изменить тему
        </Button>
      </div>
    </section>
  );
}

function TaskRow({
  goal,
  task,
  rank,
  when,
  open,
  onToggle,
  onChanged,
}: {
  goal: Goal;
  task: GoalTask;
  rank: number;
  when: string;
  open: boolean;
  onToggle: () => void;
  onChanged: (g: Goal) => void;
}) {
  const [time, setTime] = useState(task.result?.minutes != null ? hoursText(task.result.minutes / 60) : "");
  const [score, setScore] = useState(task.result?.score != null ? String(task.result.score) : "");
  const [note, setNote] = useState(task.result?.note ?? "");
  const [busy, setBusy] = useState(false);

  const record = async (status: GoalTask["status"] | null, withResult: boolean) => {
    let result = {};
    if (withResult) {
      const h = parseHours(time);
      if (h !== null && (isNaN(h) || h <= 0 || h > 24)) {
        toast("Время укажи числом часов, например 1,5 или 90м.", "error");
        return;
      }
      const sc = score.trim() === "" ? null : Number(score);
      if (sc !== null && (!Number.isInteger(sc) || sc < 0 || sc > 100)) {
        toast("Балл должен быть целым числом от 0 до 100.", "error");
        return;
      }
      result = { minutes: h === null ? null : Math.round(h * 60), score: sc, note: note.trim() || null };
    }
    setBusy(true);
    try {
      onChanged(await api.recordTaskResult(goal.id, task.id, { status, ...result }));
      sfx.save();
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  };

  const r = task.result;
  const line = r
    ? [
        r.score != null ? `балл ${r.score}` : "",
        r.minutes != null ? `ушло ${mins(r.minutes)}` : "",
        r.confidence != null ? `уверенность ${r.confidence} из 5` : "",
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  return (
    <li className={`ttask st-${task.status}${open ? " open" : ""}`}>
      <button className="ttask-row" onClick={onToggle}>
        <span className="ttask-rank">{task.status === "done" ? <Px name="check" scale={1} /> : rank}</span>
        <span className="ttask-main">
          <span className="ttask-text">
            <Linkify inert text={task.text} />
          </span>
          <span className="ttask-sub">
            {KIND[task.kind]}
            {task.minutes != null && <> · {mins(task.minutes)}</>}
            {r?.score != null && <> · балл {r.score}</>}
          </span>
        </span>
        {when && <span className={`ttask-when w-${task.status}`}>{when}</span>}
      </button>
      {open && (
        <div className="ttask-body">
          {task.doneWhen && (
            <p>
              <b>Готово, если:</b> <Linkify text={task.doneWhen} />
            </p>
          )}
          {r && (line || r.note) && (
            <p className="route-result">
              <b>Итог{r.by === "ai" ? " от ИИ" : ""}:</b> {line}
              {r.note && (
                <>
                  {line ? ". " : ""}
                  <Linkify text={r.note} />
                </>
              )}
            </p>
          )}
          <div className="result-form">
            <input
              className="field short"
              value={time}
              maxLength={6}
              placeholder="ч"
              title="Сколько ушло времени"
              onChange={(e) => setTime(e.target.value)}
            />
            <input
              className="field short"
              value={score}
              maxLength={3}
              placeholder="балл"
              title="Балл от 0 до 100"
              onChange={(e) => setScore(e.target.value)}
            />
            <input className="field grow" value={note} maxLength={2000} placeholder="Заметка" onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="ttask-actions">
            {task.status !== "done" && (
              <Button kind="green" small icon="check" disabled={busy} onClick={() => void record("done", true)}>
                Сделано
              </Button>
            )}
            <Button kind="paper" small disabled={busy} onClick={() => void record(null, true)}>
              Записать итог
            </Button>
            {task.status !== "skipped" && task.status !== "done" && (
              <Button kind="ghost" small disabled={busy} onClick={() => void record("skipped", false)}>
                Пропустить
              </Button>
            )}
            {(task.status === "done" || task.status === "skipped") && (
              <Button kind="ghost" small icon="undo" disabled={busy} onClick={() => void record("todo", false)}>
                Вернуть
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

type EditTask = { key: string; id?: string; text: string; minutes: string; kind: TaskKind; doneWhen: string; done: boolean };

function TopicEditor({
  goal,
  topic,
  onCancel,
  onSaved,
  onDeleted,
}: {
  goal: Goal;
  topic?: Topic;
  onCancel: () => void;
  onSaved: (g: Goal, id: string) => void;
  onDeleted: (g: Goal) => void;
}) {
  const [title, setTitle] = useState(topic?.title ?? "");
  const [note, setNote] = useState(topic?.note ?? "");
  const [requires, setRequires] = useState<string[]>(topic?.requires ?? []);
  const [rows, setRows] = useState<EditTask[]>(
    () =>
      topic?.tasks.map((t) => ({
        key: uid(),
        id: t.id,
        text: t.text,
        minutes: t.minutes != null ? String(t.minutes) : "",
        kind: t.kind,
        doneWhen: t.doneWhen,
        done: t.status === "done",
      })) ?? [{ key: uid(), text: "", minutes: "", kind: "learn", doneWhen: "", done: false }],
  );
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const blocked = topic ? descendants(goal, topic.id) : new Set<string>();
  const others = goal.topics.filter((t) => t.id !== topic?.id);

  const upd = (key: string, patch: Partial<EditTask>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const c = [...rs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const save = async () => {
    if (!title.trim()) {
      toast("Дай теме название.", "error");
      return;
    }
    if (rows.some((r) => r.minutes.trim() && !(Number(r.minutes) > 0 && Number(r.minutes) <= 960))) {
      toast("Минуты у задачи: целое число от 1 до 960.", "error");
      return;
    }
    const id = topic?.id ?? `t${uid()}`;
    setBusy(true);
    try {
      const g = await api.editTopics(goal.id, [
        {
          id,
          title: title.trim(),
          note: note.trim(),
          requires,
          tasks: rows
            .filter((r) => r.text.trim())
            .map((r) => ({
              id: r.id,
              text: r.text.trim(),
              minutes: r.minutes.trim() ? Math.round(Number(r.minutes)) : null,
              kind: r.kind,
              doneWhen: r.doneWhen.trim(),
            })),
        },
      ]);
      sfx.save();
      onSaved(g, g.topics.find((t) => t.id === id)?.id ?? g.topics[g.topics.length - 1]?.id ?? id);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!topic) return;
    try {
      onDeleted(await api.editTopics(goal.id, [], [topic.id]));
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <section className="map-card topic-editor">
      <h2 className="map-card-title">{topic ? "Изменить тему" : "Новая тема"}</h2>
      <label className="ge-field">
        <span>Название</span>
        <input
          className="field"
          autoFocus
          maxLength={120}
          value={title}
          placeholder="Например: линейная алгебра"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="ge-field">
        <span>Материалы и подсказки</span>
        <textarea className="field area" rows={2} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {others.length > 0 && (
        <div className="ge-field">
          <span>Нужно знать до неё</span>
          <div className="req-list">
            {others.map((t) => {
              const on = requires.includes(t.id);
              const off = blocked.has(t.id);
              return (
                <button
                  key={t.id}
                  className={`req-chip${on ? " on" : ""}`}
                  disabled={off}
                  title={off ? "Эта тема сама зависит от редактируемой" : undefined}
                  onClick={() => setRequires((rs) => (rs.includes(t.id) ? rs.filter((x) => x !== t.id) : [...rs, t.id]))}
                >
                  {on && <Px name="check" scale={1} />}
                  {t.title}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="ge-field">
        <span>Задачи от простых к сложным</span>
        <ol className="edit-tasks">
          {rows.map((r, i) => (
            <li key={r.key} className={r.done ? "done" : ""}>
              <div className="edit-task-row">
                <span className="item-num">{i + 1}</span>
                <input
                  className="field"
                  maxLength={300}
                  value={r.text}
                  readOnly={r.done}
                  placeholder="Задача"
                  onChange={(e) => upd(r.key, { text: e.target.value })}
                />
                <input
                  className="field short"
                  maxLength={3}
                  value={r.minutes}
                  placeholder="мин"
                  onChange={(e) => upd(r.key, { minutes: e.target.value.replace(/\D/g, "") })}
                />
              </div>
              <div className="edit-task-row">
                <select className="field select" value={r.kind} onChange={(e) => upd(r.key, { kind: e.target.value as TaskKind })}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND[k]}
                    </option>
                  ))}
                </select>
                <input
                  className="field grow"
                  maxLength={300}
                  value={r.doneWhen}
                  placeholder="Готово, если…"
                  onChange={(e) => upd(r.key, { doneWhen: e.target.value })}
                />
                <button className="icon-btn up" title="Проще: выше в списке" disabled={i === 0} onClick={() => move(i, -1)}>
                  <Px name="arrowL" scale={1.5} />
                </button>
                <button className="icon-btn up" title="Сложнее: ниже в списке" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                  <Px name="arrowR" scale={1.5} />
                </button>
                <button
                  className="icon-btn"
                  title={r.done ? "Сделанную задачу не удалить" : "Удалить задачу"}
                  disabled={r.done}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Px name="cross" scale={1.5} />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <Button
          kind="ghost"
          small
          icon="plus"
          disabled={rows.length >= 30}
          onClick={() => setRows((rs) => [...rs, { key: uid(), text: "", minutes: "", kind: "learn", doneWhen: "", done: false }])}
        >
          Задача
        </Button>
      </div>
      <div className="map-actions">
        <Button kind="green" icon="check" disabled={busy} onClick={() => void save()}>
          Сохранить
        </Button>
        <Button kind="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <span className="grow" />
        {topic &&
          (confirm ? (
            <Button kind="danger" small icon="trash" onClick={() => void remove()}>
              Точно удалить
            </Button>
          ) : (
            <Button kind="ghost" small icon="trash" title="Удалить тему" onClick={() => setConfirm(true)} />
          ))}
      </div>
    </section>
  );
}
