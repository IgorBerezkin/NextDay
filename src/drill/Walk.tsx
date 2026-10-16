import { useEffect, useState } from "react";
import type { DrillCardMode, Walk, WalkItem, WalkStep, WalkVar } from "../api";
import { Px } from "../ui/Px";
import { DataView } from "./DataView";
import { Prompt, type Tone } from "./drillKit";
import { Markdown } from "./Markdown";
import { explainDiff, parsePy, samePy, type Py } from "./pyval";

type Tab = "diff" | "focus" | "steps" | "final" | "rule";

const LABEL: Record<Tab, string> = {
  diff: "Разница",
  focus: "До и после",
  steps: "По шагам",
  final: "Итог",
  rule: "Правило",
};

const KEY = "drill.walkTab";

const item = (v: WalkVar): WalkItem => ({ name: v[0], repr: v[1], shape: v[2] });

function stateAt(steps: WalkStep[], upto: number) {
  const m = new Map<string, WalkItem>();
  for (const st of steps.slice(0, upto)) for (const v of st[2]) m.set(v[0], item(v));
  return m;
}

function focusOf(walk: Walk) {
  const f = walk.focus;
  if (!f) return null;
  const state = stateAt(walk.steps, f.step);
  const before = f.inputs.map((n) => state.get(n)).filter((x): x is WalkItem => !!x);
  const hit = f.target ? walk.steps[f.step]?.[2].find((v) => v[0] === f.target) : undefined;
  return { line: f.line, before, after: hit ? item(hit) : null, error: walk.error ? `${walk.error.type}: ${walk.error.message}` : null };
}

function lateNote(walk: Walk | null, want: Py, got: Py): string | null {
  const f = walk?.focus;
  if (!walk || !f?.target || f.target === "вывод") return null;
  const end = stateAt(walk.steps, walk.steps.length).get(f.target);
  const fin = end ? parsePy(end.repr) : null;
  if (!fin || !samePy(fin, got) || samePy(fin, want)) return null;
  const pass = walk.steps[f.step]?.[1];
  const when = pass ? `сразу после ${pass}-го прохода цикла, когда цикл ещё не закончился` : `сразу после строки ${f.line}`;
  return `Так \`${f.target}\` выглядит в конце программы. А вопрос про момент ${when}.`;
}

function Items({ list }: { list: WalkItem[] }) {
  return (
    <div className="wk-items">
      {list.map((it) => (
        <DataView
          key={it.name}
          name={it.name === "вывод" ? "напечатано" : it.name}
          value={it.name === "вывод" ? JSON.stringify(it.repr) : it.repr}
          shape={it.shape}
        />
      ))}
    </div>
  );
}

function Diff({ mode, expected, given, walk }: { mode: DrillCardMode; expected: string; given: string; walk: Walk | null }) {
  const err = walk?.error;
  const f = walk ? focusOf(walk) : null;
  if (err && expected === err.type) {
    return (
      <div className="wk-diff">
        <p>
          Код падает на строке {err.line}: <code className="drill-given">{`${err.type}: ${err.message}`}</code>
        </p>
        {f && f.before.length > 0 && (
          <>
            <p className="muted">Что было в переменных перед этой строкой:</p>
            <Items list={f.before} />
          </>
        )}
      </div>
    );
  }
  if (mode === "shape") {
    const after = f?.after;
    return (
      <div className="wk-diff">
        <div className="wk-pair">
          <div>
            <span className="muted">Правильно</span>
            <code className="drill-ans">{expected}</code>
          </div>
          <div>
            <span className="muted">У тебя</span>
            <code className="drill-given">{given || "пусто"}</code>
          </div>
        </div>
        {after && (
          <>
            <p className="muted">Вот само значение, у которого эта форма:</p>
            <DataView name={after.name} value={after.repr} shape={after.shape} />
          </>
        )}
      </div>
    );
  }
  const want = parsePy(expected);
  const got = parsePy(given);
  const python = mode === "python" || mode === "pick" || mode === "trace";
  const late = python && want && got ? lateNote(walk, want, got) : null;
  return (
    <div className="wk-diff">
      <div className="wk-pair">
        <div>
          <span className="muted">Правильно</span>
          {python ? <DataView value={expected} /> : <code className="drill-ans">{expected}</code>}
        </div>
        <div>
          <span className="muted">У тебя</span>
          {python && got ? <DataView value={given} /> : <code className="drill-given">{given || "пусто"}</code>}
        </div>
      </div>
      {late && (
        <p className="wk-late">
          <Prompt text={late} />
        </p>
      )}
      {python && want && got && (
        <ul className="wk-why">
          {explainDiff(want, got).map((l, i) => (
            <li key={i}>
              <Prompt text={l} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Mark = (line: number | null, tone: Tone) => void;

function Focus({ walk, onMark }: { walk: Walk; onMark: Mark }) {
  const f = focusOf(walk)!;
  useEffect(() => onMark(f.line, f.error ? "err" : "focus"), [f.line, f.error, onMark]);
  return (
    <div className="wk-focus">
      <div className="wk-flow">
        <div className="wk-side">
          <span className="muted">До строки {f.line}</span>
          {f.before.length ? <Items list={f.before} /> : <p className="muted">Строка ничего не читает из переменных.</p>}
        </div>
        <span className="wk-arrow">→</span>
        <div className="wk-side">
          <span className="muted">После</span>
          {f.after ? <Items list={[f.after]} /> : <code className="drill-given">{f.error}</code>}
        </div>
      </div>
    </div>
  );
}

function Steps({ walk, onMark }: { walk: Walk; onMark: Mark }) {
  const [i, setI] = useState(0);
  const n = walk.steps.length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(n - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n]);
  const st = walk.steps[Math.min(i, n - 1)];
  const [line, pass, set] = st;
  useEffect(() => onMark(line, "focus"), [line, i, onMark]);
  return (
    <div className="wk-steps">
      <div className="wk-stepbar">
        <button className="icon-btn" disabled={i === 0} onClick={() => setI(i - 1)} title="Назад (стрелка влево)">
          <Px name="arrowL" scale={2} />
        </button>
        <span>
          Шаг {i + 1} из {n}: строка {line}
          {pass !== null ? `, проход ${pass}` : ""}
        </span>
        <button className="icon-btn" disabled={i >= n - 1} onClick={() => setI(i + 1)} title="Вперёд (стрелка вправо)">
          <Px name="arrowR" scale={2} />
        </button>
      </div>
      <Items list={set.map(item)} />
      {i === n - 1 && walk.error && (
        <p>
          Потом строка {walk.error.line} падает: <code className="drill-given">{`${walk.error.type}: ${walk.error.message}`}</code>
        </p>
      )}
    </div>
  );
}

export function WalkView({
  code,
  mode,
  expected,
  given,
  walk,
  rule,
  theory,
  inert,
  onMark,
}: {
  code: string;
  mode: DrillCardMode;
  expected: string;
  given: string;
  walk: Walk | null;
  rule: string;
  theory?: { label: string; open: () => void };
  inert?: boolean;
  onMark: Mark;
}) {
  const tabs: Tab[] = ["diff"];
  if (walk?.focus && code) tabs.push("focus");
  if (walk?.steps.length && code) tabs.push("steps");
  if (walk?.steps.length) tabs.push("final");
  if (rule || theory) tabs.push("rule");
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem(KEY) as Tab | null;
      return saved && tabs.includes(saved) ? saved : "diff";
    } catch {
      return "diff";
    }
  });
  const pick = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      return;
    }
  };
  const cur = tabs.includes(tab) ? tab : "diff";
  const errLine = walk?.error?.line ?? null;
  useEffect(() => {
    if (cur !== "focus" && cur !== "steps") onMark(errLine, "err");
  }, [cur, errLine, onMark]);
  return (
    <div className="wk">
      {tabs.length > 1 && (
        <div className="seg wk-tabs">
          {tabs.map((t) => (
            <button key={t} className={cur === t ? "on" : ""} onClick={() => pick(t)}>
              {LABEL[t]}
            </button>
          ))}
        </div>
      )}
      {cur === "diff" && <Diff mode={mode} expected={expected} given={given} walk={walk} />}
      {cur === "focus" && walk && <Focus walk={walk} onMark={onMark} />}
      {cur === "steps" && walk && <Steps walk={walk} onMark={onMark} />}
      {cur === "final" && walk && <Items list={[...stateAt(walk.steps, walk.steps.length).values()]} />}
      {cur === "rule" && (
        <div className="wk-rule">
          {rule && (
            <div className="drill-rule">
              <Markdown text={rule} inert={inert} />
            </div>
          )}
          {theory && (
            <button className="drill-bulb" onClick={theory.open}>
              <Px name="sIdea" scale={2} />
              {theory.label && <span>{theory.label}</span>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
