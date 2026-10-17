import type { ReactNode } from "react";
import type {
  CheckMode,
  CheckSpec,
  CheckTemplate,
  DrillCardMode,
  DrillGoal,
  DrillOrder,
  DrillOutcome,
  DrillPreset,
  DrillDeckInfo,
  Gate,
} from "../api";
import { lang, t } from "../i18n";
import { duration, plural } from "../util";

export const OUTCOME: Record<DrillOutcome, string> = {
  done: t("Готово", "Done"),
  escape: t("Побег", "Escape"),
  timeout: t("Время вышло", "Time is up"),
  stopped: t("Прервано", "Stopped"),
};

export const ORDER: Record<DrillOrder, string> = {
  smart: t("Умный порядок", "Smart order"),
  random: t("Случайно", "Random"),
  sequence: t("По порядку", "In order"),
};

export const MODES: { value: CheckMode; label: string; hint: string; code?: boolean }[] = [
  {
    value: "text",
    label: t("Текст", "Text"),
    hint: t(
      "Ответ пишут словами. Регистр, буквы ё и е и лишние пробелы не важны.",
      "Type the answer in words. Case and extra spaces don't matter.",
    ),
  },
  {
    value: "choice",
    label: t("Выбор из вариантов", "Multiple choice"),
    hint: t(
      "Ответ выбирают из нескольких вариантов мышью или клавишами a, b, c, d.",
      "Pick the answer from several options with the mouse or the a, b, c, d keys.",
    ),
  },
  {
    value: "number",
    label: t("Число", "Number"),
    hint: t(
      "Ответ числом, можно задать допуск. Запятая тоже подходит.",
      "Answer with a number, you can set a tolerance. A decimal comma works too.",
    ),
  },
  {
    value: "self",
    label: t("Самопроверка", "Self-check"),
    hint: t("Без ввода: открыть ответ и честно отметить, знал ли.", "No typing: reveal the answer and honestly mark whether you knew it."),
  },
  {
    value: "python",
    label: t("Значение Python", "Python value"),
    hint: t(
      "Для карточек про код: ответ это значение на Python, например [1, 2] или 'abc'. Кавычки и пробелы не важны, а 3 и 3.0 разные.",
      "For code cards: the answer is a Python value, like [1, 2] or 'abc'. Quote style and spaces don't matter, but 3 and 3.0 differ.",
    ),
    code: true,
  },
  {
    value: "shape",
    label: t("Форма данных Python", "Python data shape"),
    hint: t(
      "Для карточек про код: ответ это запись вида list[int] или dict[str, int].",
      "For code cards: the answer is a type like list[int] or dict[str, int].",
    ),
    code: true,
  },
];

const lowerFirst = (s: string) => (lang() === "ru" ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export const modeName = (mode: CheckMode) => lowerFirst(MODES.find((m) => m.value === mode)?.label ?? "");

export function checkName(c: CheckSpec, templates: CheckTemplate[]) {
  const tpl = templates.find((x) => sameCheck(x.check, c));
  return tpl ? lowerFirst(tpl.name) : modeName(c.mode);
}

export const HINT: Record<DrillCardMode, string> = {
  python: t(
    "Значение Python: 3, 3.5, 'a', [1, 2], (1, 'a'), {'a': 1}, True, None. Если код падает, напиши имя ошибки.",
    "Python value: 3, 3.5, 'a', [1, 2], (1, 'a'), {'a': 1}, True, None. If the code fails, type the error name.",
  ),
  trace: t("Список значений по порядку, например [1, 3, 6].", "A list of values in order, like [1, 3, 6]."),
  pick: t(
    "Выбери верный вариант мышью или клавишей a, b, c, d (цифры тоже работают).",
    "Pick the right option with the mouse or the a, b, c, d keys (digits work too).",
  ),
  shape: t(
    "Форма: int, str, list[int], tuple[str, int], dict[str, list[int]].",
    "Shape: int, str, list[int], tuple[str, int], dict[str, list[int]].",
  ),
  output: t("Ровно то, что появится на экране, без кавычек.", "Exactly what appears on screen, without quotes."),
  text: t("Ответ текстом.", "Type the answer."),
  number: t("Ответ числом.", "Answer with a number."),
  choice: t(
    "Выбери вариант мышью или клавишей a, b, c, d (цифры тоже работают).",
    "Pick an option with the mouse or the a, b, c, d keys (digits work too).",
  ),
  self: t("Вспомни ответ, потом открой его и честно отметь.", "Recall the answer, then reveal it and mark it honestly."),
};

export const LETTERS = "abcdefgh";

export function choiceKey(e: KeyboardEvent): number | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const m = /^(?:Key([A-H])|Digit([1-8])|Numpad([1-8]))$/.exec(e.code);
  if (!m) return null;
  return m[1] ? m[1].charCodeAt(0) - 65 : Number(m[2] ?? m[3]) - 1;
}

export const DEFAULT_CHECK: CheckSpec = {
  mode: "text",
  caseSensitive: false,
  ignoreSpaces: false,
  tolerance: 0,
  strictTypes: true,
  hint: "",
};

export function sameCheck(a: CheckSpec, b: CheckSpec) {
  return (
    a.mode === b.mode &&
    a.caseSensitive === b.caseSensitive &&
    a.ignoreSpaces === b.ignoreSpaces &&
    a.tolerance === b.tolerance &&
    a.strictTypes === b.strictTypes &&
    (a.hint ?? "") === (b.hint ?? "")
  );
}

export function groupsOf(list: CheckTemplate[]): [string, CheckTemplate[]][] {
  const out: [string, CheckTemplate[]][] = [];
  for (const tpl of list) {
    const g = out.find(([name]) => name === tpl.group);
    if (g) g[1].push(tpl);
    else out.push([tpl.group, [tpl]]);
  }
  return out;
}

export function checkNote(c: CheckSpec): string {
  const parts = [modeName(c.mode)];
  if ((c.mode === "text" || c.mode === "choice") && c.caseSensitive) parts.push(t("регистр важен", "case matters"));
  if (c.mode === "text" && c.ignoreSpaces) parts.push(t("пробелы не важны", "spaces ignored"));
  if (c.mode === "number" && c.tolerance > 0) parts.push(t(`допуск ${c.tolerance}`, `tolerance ${c.tolerance}`));
  if (c.mode === "python" && !c.strictTypes) parts.push(t("типы не строгие", "loose types"));
  return parts.join(", ");
}
export const DEFAULT_GATE: Gate = { enabled: false, percent: 85, window: 20 };

export function goalText(goal: DrillGoal, amount: number): string {
  if (goal === "correct") return plural(amount, "верного ответа", "верных ответов", "верных ответов", "right answer", "right answers");
  if (goal === "cards") return plural(amount, "карточки", "карточек", "карточек", "card", "cards");
  return plural(amount, "минуты", "минут", "минут", "minute", "minutes");
}

export function spent(sec: number): string {
  return sec < 60 ? `${Math.max(0, Math.round(sec))} ${t("с", "s")}` : duration(sec);
}

export function missText(misses: { topic: string }[], wrong: number): string {
  const topics = [...new Set(misses.map((m) => m.topic).filter(Boolean))];
  if (topics.length) return t(`Промахи в темах: ${topics.join(", ")}.`, `Misses in topics: ${topics.join(", ")}.`);
  return wrong ? t(`Промахов: ${wrong}.`, `Misses: ${wrong}.`) : "";
}

export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function sourcesText(p: DrillPreset, decks: DrillDeckInfo[]): string {
  return p.sources
    .map((s) => {
      const d = decks.find((x) => x.id === s.deck);
      if (!d) return t("набор удалён", "deck deleted");
      if (!s.topics.length) return d.title;
      const names = s.topics.map((id) => d.topics.find((x) => x.id === id)?.title ?? id);
      return `${d.title}: ${names.join(", ")}`;
    })
    .join("; ");
}

export function conditionsText(p: DrillPreset): string {
  if (p.screen === "window") return t("в обычном окне", "in a normal window");
  const exit = p.escape === "hold" ? t("выход: Esc 5 секунд", "exit: hold Esc for 5 seconds") : t("без выхода", "no exit");
  return t(`замок экрана, ${exit}, потолок ${p.limitMinutes} мин`, `screen lock, ${exit}, time limit ${p.limitMinutes} min`);
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
