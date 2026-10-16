import type { ReactNode } from "react";
import type { CheckMode, CheckSpec, DrillCardMode, DrillGoal, DrillOrder, DrillOutcome, DrillPreset, DrillDeckInfo, Gate } from "../api";
import { duration, plural } from "../util";

export const OUTCOME: Record<DrillOutcome, string> = {
  done: "Готово",
  escape: "Побег",
  timeout: "Время вышло",
  stopped: "Прервано",
};

export const ORDER: Record<DrillOrder, string> = {
  smart: "Умный порядок",
  random: "Случайно",
  sequence: "По порядку",
};

export const MODES: { value: CheckMode; label: string; hint: string }[] = [
  { value: "text", label: "Текст", hint: "Сравнение без учёта регистра и лишних пробелов." },
  { value: "python", label: "Литерал Python", hint: "3 и 3.0 разные, порядок ключей словаря не важен, кавычки любые." },
  { value: "shape", label: "Форма", hint: "Запись вида list[tuple[str, int]], пробелы не важны." },
  { value: "number", label: "Число", hint: "С допуском, запятая тоже подходит." },
  { value: "choice", label: "Выбор варианта", hint: "Ответ выбирают из вариантов." },
  { value: "self", label: "Самопроверка", hint: "Открыть ответ и честно отметить, знал ли." },
];

export const HINT: Record<DrillCardMode, string> = {
  python: "Литерал Python: 3, 3.5, 'a', [1, 2], (1, 'a'), {'a': 1}, True, None. Если код падает, напиши имя ошибки.",
  trace: "Список значений по порядку, например [1, 3, 6].",
  pick: "Выбери верный вариант мышью или клавишей a, b, c, d (цифры тоже работают).",
  shape: "Форма: int, str, list[int], tuple[str, int], dict[str, list[int]].",
  output: "Ровно то, что появится на экране, без кавычек.",
  text: "Ответ текстом.",
  number: "Ответ числом.",
  choice: "Выбери вариант мышью или клавишей a, b, c, d (цифры тоже работают).",
  self: "Вспомни ответ, потом открой его и честно отметь.",
};

export const LETTERS = "abcdefgh";

export function choiceKey(e: KeyboardEvent): number | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const m = /^(?:Key([A-H])|Digit([1-8])|Numpad([1-8]))$/.exec(e.code);
  if (!m) return null;
  return m[1] ? m[1].charCodeAt(0) - 65 : Number(m[2] ?? m[3]) - 1;
}

export const DEFAULT_CHECK: CheckSpec = { mode: "text", caseSensitive: false, ignoreSpaces: false, tolerance: 0, strictTypes: true };
export const DEFAULT_GATE: Gate = { enabled: false, percent: 85, window: 20 };

export function goalText(goal: DrillGoal, amount: number): string {
  if (goal === "correct") return plural(amount, "верного ответа", "верных ответов", "верных ответов");
  if (goal === "cards") return plural(amount, "карточки", "карточек", "карточек");
  return plural(amount, "минуты", "минут", "минут");
}

export function spent(sec: number): string {
  return sec < 60 ? `${Math.max(0, Math.round(sec))} с` : duration(sec);
}

export function missText(misses: { topic: string }[], wrong: number): string {
  const topics = [...new Set(misses.map((m) => m.topic).filter(Boolean))];
  if (topics.length) return `Промахи в темах: ${topics.join(", ")}.`;
  return wrong ? `Промахов: ${wrong}.` : "";
}

export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function sourcesText(p: DrillPreset, decks: DrillDeckInfo[]): string {
  return p.sources
    .map((s) => {
      const d = decks.find((x) => x.id === s.deck);
      if (!d) return "набор удалён";
      if (!s.topics.length) return d.title;
      const names = s.topics.map((t) => d.topics.find((x) => x.id === t)?.title ?? t);
      return `${d.title}: ${names.join(", ")}`;
    })
    .join("; ");
}

export function conditionsText(p: DrillPreset): string {
  if (p.screen === "window") return "в обычном окне";
  const exit = p.escape === "hold" ? "выход: Esc 5 секунд" : "без выхода";
  return `замок экрана, ${exit}, потолок ${p.limitMinutes} мин`;
}

export function Prompt({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <code key={i} className="drill-inline">
            {p}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export type Tone = "focus" | "err";

export function Code({ code, mark, tone = "err" }: { code: string; mark?: number | null; tone?: Tone }) {
  return (
    <pre className="drill-code">
      {code.split("\n").map((line, i) => (
        <div key={i} className={`drill-line${mark === i + 1 ? ` mark ${tone}` : ""}`}>
          <span className="drill-ln">{i + 1}</span>
          <span className="drill-src">{line || " "}</span>
        </div>
      ))}
    </pre>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="drill-stat">
      <b>{value}</b>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}
