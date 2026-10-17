import { useMemo, useState } from "react";
import {
  api,
  type CheckTemplate,
  type DrillCardData,
  type DrillDeckInfo,
  type DrillDeckInput,
  type DrillOverview,
  type DrillTopic,
  type Gate,
} from "../api";
import { t } from "../i18n";
import { Button, Check, Modal, toast, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { plural } from "../util";
import { CheckFields, checkHelp, CheckTemplates } from "./CheckTemplates";
import { DataEater } from "./DataEater";
import { checkName, DEFAULT_CHECK, DEFAULT_GATE } from "./drillKit";
import { GeneratorEditor } from "./GeneratorEditor";

function sizeText(d: DrillDeckInfo, checks: CheckTemplate[]): string {
  if (d.kind === "generator") {
    if (!d.cards) return t("Код ещё не проверен, шаблонов пока нет.", "Code not tested yet, no templates so far.");
    const made = plural(d.cards, "шаблон", "шаблона", "шаблонов", "template", "templates");
    return t(
      `${made}, данные новые в каждом сеансе, промах вернётся с другими данными`,
      `${made}, new data in every session, a miss comes back with other data`,
    );
  }
  if (d.kind === "bank") {
    const cards = plural(d.cards, "карточка", "карточки", "карточек", "card", "cards");
    const variants = plural(d.variants, "вариант", "варианта", "вариантов", "variant", "variants");
    return t(`${cards}, ${variants} с разными данными`, `${cards}, ${variants} with different data`);
  }
  const mode = d.check ? checkName(d.check, checks) : "";
  return `${plural(d.cards, "карточка", "карточки", "карточек", "card", "cards")}${mode ? t(`, проверка: ${mode}`, `, check: ${mode}`) : ""}`;
}

export function DrillDecks({ ov, reload }: { ov: DrillOverview; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<DrillDeckInput | null>(null);
  const [gen, setGen] = useState<{ id: string | null; builtin: boolean } | null>(null);
  const [eater, setEater] = useState(false);
  const [sure, setSure] = useState<{ text: string; run: () => Promise<void> } | null>(null);

  const run = async (f: () => Promise<unknown>) => {
    try {
      await f();
      await reload();
    } catch (e) {
      toastError(e);
    }
  };

  const open = async (d: DrillDeckInfo) => {
    try {
      const full = await api.drillDeck(d.id);
      setEditing({ id: full.id, title: full.title, description: full.description, check: full.check, gate: full.gate, cards: full.cards });
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <>
      {ov.decks.map((d) => (
        <section key={d.id} className={`card drill-deck${d.kind === "generator" && !d.enabled ? " off" : ""}`}>
          <h2 className="card-title">
            <Px name={d.kind === "generator" ? "sBolt" : "cards"} scale={2} /> {d.title}
            {d.builtin && <span className="drill-chip">{t("встроенный", "built-in")}</span>}
            {d.kind === "bank" && !d.builtin && <span className="drill-chip">{t("банк", "bank")}</span>}
            {d.kind === "generator" && <span className="drill-chip gen">{t("генератор", "generator")}</span>}
            {d.kind === "generator" && !d.enabled && <span className="drill-chip again">{t("выключен", "off")}</span>}
            {d.author === "ai" && <span className="drill-chip ai">{t("от ИИ", "by AI")}</span>}
          </h2>
          {d.description && <p className="muted">{d.description}</p>}
          <p>{sizeText(d, ov.checks)}</p>
          {d.kind === "generator" && !d.enabled && (
            <p className="drill-gen-off">
              {t(
                "Генератор выключен: открой его, нажми «Проверить», посмотри примеры карточек и включи.",
                'The generator is off: open it, press "Test", look at the sample cards and enable it.',
              )}
            </p>
          )}
          {d.topics.length > 1 || d.kind !== "deck" ? (
            <div className="drill-topics">
              {d.topics.map((topic, i) => (
                <TopicRow
                  key={topic.id}
                  topic={topic}
                  gated={d.gate.enabled}
                  first={i === 0}
                  onToggle={() => void run(() => api.drillSetTopic(d.id, topic.id, !topic.open))}
                />
              ))}
            </div>
          ) : null}
          {d.id === "python" ? (
            <BuiltinPrefs
              gate={ov.python.gate}
              strict={ov.python.strictTypes}
              onChange={(gate, strictTypes) => void run(() => api.drillSetPrefs({ gate, strictTypes }))}
            />
          ) : (
            d.kind !== "deck" &&
            d.topics.length > 1 && <GatePrefs gate={d.gate} onChange={(gate) => void run(() => api.drillSetGate(d.id, gate))} />
          )}
          <div className="row">
            {d.kind === "deck" && (
              <Button kind="paper" small icon="pencil" onClick={() => void open(d)}>
                {t("Изменить", "Edit")}
              </Button>
            )}
            {d.kind === "generator" && (
              <Button kind={d.enabled ? "paper" : "primary"} small icon="sBolt" onClick={() => setGen({ id: d.id, builtin: d.builtin })}>
                {d.builtin
                  ? t("Код и примеры", "Code and samples")
                  : d.enabled
                    ? t("Код и проверка", "Code and test")
                    : t("Проверить и включить", "Test and enable")}
              </Button>
            )}
            {d.kind === "generator" && d.enabled && !d.builtin && (
              <Button kind="ghost" small icon="cross" onClick={() => void run(() => api.drillDisableGenerator(d.id))}>
                {t("Выключить", "Turn off")}
              </Button>
            )}
            <Button
              kind="ghost"
              small
              icon="undo"
              onClick={() =>
                setSure({
                  text: t(
                    `Сбросить прогресс набора «${d.title}»? Коробки, точность и открытые темы начнутся заново.`,
                    `Reset progress for "${d.title}"? Boxes, accuracy and open topics start over.`,
                  ),
                  run: () => run(() => api.drillResetProgress(d.id)),
                })
              }
            >
              {t("Сбросить прогресс", "Reset progress")}
            </Button>
            {!d.builtin && (
              <Button
                kind="ghost"
                small
                icon="trash"
                onClick={() =>
                  setSure({
                    text: t(
                      `Удалить ${d.kind === "generator" ? "генератор" : d.kind === "bank" ? "банк" : "набор"} «${d.title}» вместе с прогрессом?`,
                      `Delete the ${d.kind === "generator" ? "generator" : d.kind === "bank" ? "bank" : "deck"} "${d.title}" with its progress?`,
                    ),
                    run: () => run(() => api.drillDeleteDeck(d.id)),
                  })
                }
              >
                {t("Удалить", "Delete")}
              </Button>
            )}
          </div>
        </section>
      ))}
      <div className="row">
        <Button
          kind="paper"
          icon="plus"
          onClick={() => setEditing({ title: "", description: "", check: { ...DEFAULT_CHECK }, gate: { ...DEFAULT_GATE }, cards: [] })}
        >
          {t("Новый набор", "New deck")}
        </Button>
        <Button kind="paper" icon="sBolt" onClick={() => setGen({ id: null, builtin: false })}>
          {t("Новый генератор", "New generator")}
        </Button>
        <Button kind="paper" icon="folder" onClick={() => setEater(true)}>
          {t("DataEater: импорт банка", "DataEater: import a bank")}
        </Button>
      </div>
      <p className="muted drill-help">
        {t(
          "Набор: свои вопросы и ответы. Генератор: скрипт, который в каждом сеансе придумывает карточки с новыми данными. Банк: готовый JSON, где у каждой карточки много вариантов. Всё это можно собирать и через ИИ по MCP.",
          "Deck: your own questions and answers. Generator: a script that makes up cards with new data in every session. Bank: a ready JSON file where each card has many variants. You can also build all of these with AI over MCP.",
        )}
      </p>
      <CheckTemplates list={ov.checks} reload={reload} />

      {editing && (
        <DeckEditor
          deck={editing}
          templates={ov.checks}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
      {gen && (
        <GeneratorEditor
          id={gen.id}
          builtin={gen.builtin}
          onClose={() => setGen(null)}
          onSaved={async () => {
            setGen(null);
            await reload();
          }}
        />
      )}
      {eater && (
        <DataEater
          banks={ov.decks.filter((d) => d.kind === "bank" && !d.builtin)}
          onClose={() => setEater(false)}
          onDone={() => {
            toast(t("Банк импортирован.", "Bank imported."), "good");
            void reload();
          }}
        />
      )}
      {sure && (
        <Modal
          title={t("Точно?", "Sure?")}
          onClose={() => setSure(null)}
          footer={
            <>
              <Button kind="paper" onClick={() => setSure(null)}>
                {t("Отмена", "Cancel")}
              </Button>
              <Button
                kind="danger"
                onClick={() => {
                  const s = sure;
                  setSure(null);
                  void s.run();
                }}
              >
                {t("Да", "Yes")}
              </Button>
            </>
          }
        >
          <p>{sure.text}</p>
        </Modal>
      )}
    </>
  );
}

function TopicRow({ topic, gated, first, onToggle }: { topic: DrillTopic; gated: boolean; first: boolean; onToggle: () => void }) {
  const acc = topic.recent ? Math.round((topic.recentRight / topic.recent) * 100) : null;
  return (
    <div className={`drill-topic${topic.open ? " open" : " locked"}`}>
      <Px name={topic.open ? "check" : "lock"} scale={1.5} />
      <span className="drill-topic-title">{topic.title}</span>
      <span className="muted" title={t("Сколько карточек темы уже встречалось", "Cards of this topic seen so far")}>
        {topic.seen}/{topic.cards}
      </span>
      <span
        className={`drill-acc${acc === null ? "" : acc >= 85 ? " good" : acc < 60 ? " bad" : ""}`}
        title={t("Верно из последних ответов", "Right out of recent answers")}
      >
        {acc === null ? t("нет ответов", "no answers") : `${topic.recentRight}/${topic.recent}`}
      </span>
      <Boxes boxes={topic.boxes} />
      {gated && !first && (
        <Button kind="ghost" small onClick={onToggle}>
          {topic.open ? t("Закрыть", "Close") : t("Открыть", "Open")}
        </Button>
      )}
    </div>
  );
}

export function Boxes({ boxes }: { boxes: number[] }) {
  const total = boxes.reduce((a, b) => a + b, 0);
  return (
    <span className="drill-boxes" title={t(`Коробки Лейтнера 1-5: ${boxes.join(", ")}`, `Leitner boxes 1-5: ${boxes.join(", ")}`)}>
      {boxes.map((n, i) => (
        <i key={i} className={`b${i + 1}`} style={{ flexGrow: total ? n : 0 }} />
      ))}
      {!total && <i className="b0" />}
    </span>
  );
}

function GateFields({ gate, onChange }: { gate: Gate; onChange: (g: Gate) => void }) {
  return (
    <>
      <Check
        checked={gate.enabled}
        onChange={(v) => onChange({ ...gate, enabled: v })}
        label={t("Открывать темы по очереди", "Open topics one by one")}
      />
      {gate.enabled && (
        <div className="row">
          <span>{t("Следующая тема откроется, когда в открытых будет", "The next topic opens at")}</span>
          <input
            className="field drill-num"
            type="number"
            min={50}
            max={100}
            value={gate.percent}
            onChange={(e) => onChange({ ...gate, percent: Number(e.target.value) || 85 })}
          />
          <span>{t("% верных из последних", "% right in the last")}</span>
          <input
            className="field drill-num"
            type="number"
            min={5}
            max={50}
            value={gate.window}
            onChange={(e) => onChange({ ...gate, window: Number(e.target.value) || 20 })}
          />
          <span>{t("ответов", "answers")}</span>
        </div>
      )}
    </>
  );
}

function GatePrefs({ gate, onChange }: { gate: Gate; onChange: (g: Gate) => void }) {
  return (
    <div className="drill-prefs">
      <GateFields gate={gate} onChange={onChange} />
    </div>
  );
}

function BuiltinPrefs({ gate, strict, onChange }: { gate: Gate; strict: boolean; onChange: (g: Gate, strict: boolean) => void }) {
  return (
    <div className="drill-prefs">
      <GateFields gate={gate} onChange={(g) => onChange(g, strict)} />
      <Check
        checked={strict}
        onChange={(v) => onChange(gate, v)}
        label={t("Строгие типы: 3 и 3.0, кортеж и список различаются", "Strict types: 3 and 3.0, tuple and list differ")}
      />
    </div>
  );
}

const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

function blankCard(topic: string): DrillCardData {
  return { topic, prompt: "", code: "", answer: "", alternatives: [], choices: [], check: null, explain: "" };
}

function DeckEditor({
  deck,
  templates,
  onClose,
  onSaved,
}: {
  deck: DrillDeckInput;
  templates: CheckTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<DrillDeckInput>(() => structuredClone(deck));
  const [open, setOpen] = useState<number | null>(deck.cards.length ? null : 0);
  const [bulk, setBulk] = useState("");
  const [bulkTopic, setBulkTopic] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<DrillDeckInput>) => setD((x) => ({ ...x, ...patch }));
  const setCard = (i: number, patch: Partial<DrillCardData>) =>
    setD((x) => ({ ...x, cards: x.cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return d.cards.map((c, i) => ({ c, i })).filter(({ c }) => !q || `${c.topic} ${c.prompt} ${c.answer}`.toLowerCase().includes(q));
  }, [d.cards, query]);

  const addBulk = () => {
    const added = lines(bulk)
      .map((l) => l.split("|").map((x) => x.trim()))
      .filter((p) => p.length >= 2 && p[0] && p[1])
      .map((p) => ({ ...blankCard(bulkTopic.trim()), prompt: p[0], answer: p[1], explain: p.slice(2).join(" | ") }));
    if (!added.length) {
      toast(t("Не нашёл строк вида «вопрос | ответ».", 'No lines like "question | answer" found.'), "error");
      return;
    }
    set({ cards: [...d.cards, ...added] });
    setBulk("");
    const count = plural(added.length, "карточка", "карточки", "карточек", "card", "cards");
    toast(t(`Добавлено: ${count}.`, `Added ${count}.`), "good");
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.drillSaveDeck({ ...d, cards: d.cards.filter((c) => c.prompt.trim() || c.code.trim() || c.answer.trim()) });
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const mode = (c: DrillCardData) => (c.check ?? d.check).mode;

  return (
    <Modal
      wide
      title={deck.id ? t("Набор карточек", "Card deck") : t("Новый набор", "New deck")}
      onClose={onClose}
      footer={
        <>
          <span className="muted">{plural(d.cards.length, "карточка", "карточки", "карточек", "card", "cards")}</span>
          <span className="grow" />
          <Button kind="paper" onClick={onClose}>
            {t("Отмена", "Cancel")}
          </Button>
          <Button icon="check" disabled={busy || !d.title.trim()} onClick={() => void save()}>
            {t("Сохранить", "Save")}
          </Button>
        </>
      }
    >
      <div className="drill-form">
        <label className="drill-field">
          <span>{t("Название", "Title")}</span>
          <input
            className="field"
            value={d.title}
            maxLength={80}
            onChange={(e) => set({ title: e.target.value })}
            placeholder={t("Например, Метрики ML", "For example, ML metrics")}
          />
        </label>
        <label className="drill-field">
          <span>{t("Описание", "Description")}</span>
          <input className="field" value={d.description} maxLength={1000} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <div className="drill-field">
          <span>{t("Как проверять ответы", "How to check answers")}</span>
          <CheckFields spec={d.check} templates={templates} onChange={(s) => s && set({ check: s })} />
          <p className="muted">{checkHelp(d.check)}</p>
        </div>
        <div className="drill-field">
          <Check
            checked={d.gate.enabled}
            onChange={(v) => set({ gate: { ...d.gate, enabled: v } })}
            label={t("Открывать темы по очереди", "Open topics one by one")}
          />
          {d.gate.enabled && (
            <div className="row">
              <span>{t("порог", "threshold")}</span>
              <input
                className="field drill-num"
                type="number"
                min={50}
                max={100}
                value={d.gate.percent}
                onChange={(e) => set({ gate: { ...d.gate, percent: Number(e.target.value) || 85 } })}
              />
              <span>{t("% из последних", "% of the last")}</span>
              <input
                className="field drill-num"
                type="number"
                min={5}
                max={50}
                value={d.gate.window}
                onChange={(e) => set({ gate: { ...d.gate, window: Number(e.target.value) || 20 } })}
              />
              <span>{t("ответов", "answers")}</span>
            </div>
          )}
        </div>

        <h3 className="drill-h">{t("Карточки", "Cards")}</h3>
        {d.cards.length > 8 && (
          <input
            className="field search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Поиск по карточкам", "Search cards")}
          />
        )}
        <div className="drill-cards">
          {shown.map(({ c, i }) =>
            open === i ? (
              <div key={i} className="drill-cardedit">
                <div className="row">
                  <input
                    className="field drill-topicfield"
                    value={c.topic}
                    placeholder={t("Тема", "Topic")}
                    maxLength={80}
                    onChange={(e) => setCard(i, { topic: e.target.value })}
                  />
                  <CheckFields spec={c.check} templates={templates} base={d.check} onChange={(s) => setCard(i, { check: s })} />
                  <span className="grow" />
                  <Button kind="ghost" small onClick={() => setOpen(null)}>
                    {t("Свернуть", "Collapse")}
                  </Button>
                  <Button
                    kind="ghost"
                    small
                    icon="trash"
                    title={t("Удалить карточку", "Delete card")}
                    onClick={() => {
                      set({ cards: d.cards.filter((_, j) => j !== i) });
                      setOpen(null);
                    }}
                  />
                </div>
                <textarea
                  className="field area drill-small"
                  value={c.prompt}
                  placeholder={t("Вопрос", "Question")}
                  onChange={(e) => setCard(i, { prompt: e.target.value })}
                />
                <textarea
                  className="field area drill-small drill-mono"
                  value={c.code}
                  placeholder={t("Код (не обязательно)", "Code (optional)")}
                  spellCheck={false}
                  onChange={(e) => setCard(i, { code: e.target.value })}
                />
                <input
                  className="field"
                  value={c.answer}
                  placeholder={t("Правильный ответ", "Right answer")}
                  onChange={(e) => setCard(i, { answer: e.target.value })}
                />
                <textarea
                  className="field area drill-small"
                  value={c.alternatives.join("\n")}
                  placeholder={t("Другие верные ответы, по одному в строке", "Other right answers, one per line")}
                  onChange={(e) => setCard(i, { alternatives: e.target.value.split("\n") })}
                />
                {mode(c) === "choice" && (
                  <textarea
                    className="field area drill-small"
                    value={c.choices.join("\n")}
                    placeholder={t("Неверные варианты, по одному в строке", "Wrong options, one per line")}
                    onChange={(e) => setCard(i, { choices: e.target.value.split("\n") })}
                  />
                )}
                <input
                  className="field"
                  value={c.explain}
                  placeholder={t("Пояснение после промаха", "Explanation after a miss")}
                  onChange={(e) => setCard(i, { explain: e.target.value })}
                />
              </div>
            ) : (
              <button key={i} className="drill-cardrow" onClick={() => setOpen(i)}>
                {c.topic && <span className="drill-chip">{c.topic}</span>}
                <span className="drill-cardq">{c.prompt || c.code.split("\n")[0] || t("без вопроса", "no question")}</span>
                <code>{c.answer}</code>
              </button>
            ),
          )}
        </div>
        <Button
          kind="paper"
          small
          icon="plus"
          onClick={() => {
            set({ cards: [...d.cards, blankCard(d.cards.at(-1)?.topic ?? "")] });
            setOpen(d.cards.length);
            setQuery("");
          }}
        >
          {t("Карточка", "Card")}
        </Button>

        <h3 className="drill-h">{t("Добавить много сразу", "Add many at once")}</h3>
        <p className="muted">
          {t(
            "Одна карточка на строку: вопрос | ответ | пояснение (пояснение можно не писать).",
            "One card per line: question | answer | explanation (the explanation is optional).",
          )}
        </p>
        <textarea
          className="field area drill-small"
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={t(
            "Что делает zip(*m)? | транспонирует матрицу\nlen([1, [2, 3]]) | 2 | вложенный список считается одним элементом",
            "What does zip(*m) do? | transposes a matrix\nlen([1, [2, 3]]) | 2 | a nested list counts as one item",
          )}
        />
        <div className="row">
          <input
            className="field drill-topicfield"
            value={bulkTopic}
            onChange={(e) => setBulkTopic(e.target.value)}
            placeholder={t("Тема для этих строк", "Topic for these lines")}
          />
          <Button kind="paper" small onClick={addBulk} disabled={!bulk.trim()}>
            {t("Добавить строки", "Add lines")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
