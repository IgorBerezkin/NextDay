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
import { Button, Check, Modal, toast, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { plural } from "../util";
import { CheckFields, checkHelp, CheckTemplates } from "./CheckTemplates";
import { DataEater } from "./DataEater";
import { checkName, DEFAULT_CHECK, DEFAULT_GATE } from "./drillKit";
import { GeneratorEditor } from "./GeneratorEditor";

function sizeText(d: DrillDeckInfo, checks: CheckTemplate[]): string {
  if (d.kind === "generator") {
    if (!d.cards) return "Код ещё не проверен, шаблонов пока нет.";
    return `${plural(d.cards, "шаблон", "шаблона", "шаблонов")}, данные новые в каждом сеансе, промах вернётся с другими данными`;
  }
  if (d.kind === "bank") {
    return `${plural(d.cards, "карточка", "карточки", "карточек")}, ${plural(d.variants, "вариант", "варианта", "вариантов")} с разными данными`;
  }
  const mode = d.check ? checkName(d.check, checks) : "";
  return `${plural(d.cards, "карточка", "карточки", "карточек")}${mode ? `, проверка: ${mode}` : ""}`;
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
            {d.builtin && <span className="drill-chip">встроенный</span>}
            {d.kind === "bank" && !d.builtin && <span className="drill-chip">банк</span>}
            {d.kind === "generator" && <span className="drill-chip gen">генератор</span>}
            {d.kind === "generator" && !d.enabled && <span className="drill-chip again">выключен</span>}
            {d.author === "ai" && <span className="drill-chip ai">от ИИ</span>}
          </h2>
          {d.description && <p className="muted">{d.description}</p>}
          <p>{sizeText(d, ov.checks)}</p>
          {d.kind === "generator" && !d.enabled && (
            <p className="drill-gen-off">Генератор выключен: открой его, нажми «Проверить», посмотри примеры карточек и включи.</p>
          )}
          {d.topics.length > 1 || d.kind !== "deck" ? (
            <div className="drill-topics">
              {d.topics.map((t, i) => (
                <TopicRow
                  key={t.id}
                  t={t}
                  gated={d.gate.enabled}
                  first={i === 0}
                  onToggle={() => void run(() => api.drillSetTopic(d.id, t.id, !t.open))}
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
                Изменить
              </Button>
            )}
            {d.kind === "generator" && (
              <Button kind={d.enabled ? "paper" : "primary"} small icon="sBolt" onClick={() => setGen({ id: d.id, builtin: d.builtin })}>
                {d.builtin ? "Код и примеры" : d.enabled ? "Код и проверка" : "Проверить и включить"}
              </Button>
            )}
            {d.kind === "generator" && d.enabled && !d.builtin && (
              <Button kind="ghost" small icon="cross" onClick={() => void run(() => api.drillDisableGenerator(d.id))}>
                Выключить
              </Button>
            )}
            <Button
              kind="ghost"
              small
              icon="undo"
              onClick={() =>
                setSure({
                  text: `Сбросить прогресс набора «${d.title}»? Коробки, точность и открытые темы начнутся заново.`,
                  run: () => run(() => api.drillResetProgress(d.id)),
                })
              }
            >
              Сбросить прогресс
            </Button>
            {!d.builtin && (
              <Button
                kind="ghost"
                small
                icon="trash"
                onClick={() =>
                  setSure({
                    text: `Удалить ${d.kind === "generator" ? "генератор" : d.kind === "bank" ? "банк" : "набор"} «${d.title}» вместе с прогрессом?`,
                    run: () => run(() => api.drillDeleteDeck(d.id)),
                  })
                }
              >
                Удалить
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
          Новый набор
        </Button>
        <Button kind="paper" icon="sBolt" onClick={() => setGen({ id: null, builtin: false })}>
          Новый генератор
        </Button>
        <Button kind="paper" icon="folder" onClick={() => setEater(true)}>
          DataEater: импорт банка
        </Button>
      </div>
      <p className="muted drill-help">
        Набор: свои вопросы и ответы. Генератор: скрипт, который в каждом сеансе придумывает карточки с новыми данными. Банк: готовый JSON,
        где у каждой карточки много вариантов. Всё это можно собирать и через ИИ по MCP.
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
            toast("Банк импортирован.", "good");
            void reload();
          }}
        />
      )}
      {sure && (
        <Modal
          title="Точно?"
          onClose={() => setSure(null)}
          footer={
            <>
              <Button kind="paper" onClick={() => setSure(null)}>
                Отмена
              </Button>
              <Button
                kind="danger"
                onClick={() => {
                  const s = sure;
                  setSure(null);
                  void s.run();
                }}
              >
                Да
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

function TopicRow({ t, gated, first, onToggle }: { t: DrillTopic; gated: boolean; first: boolean; onToggle: () => void }) {
  const acc = t.recent ? Math.round((t.recentRight / t.recent) * 100) : null;
  return (
    <div className={`drill-topic${t.open ? " open" : " locked"}`}>
      <Px name={t.open ? "check" : "lock"} scale={1.5} />
      <span className="drill-topic-title">{t.title}</span>
      <span className="muted" title="Сколько карточек темы уже встречалось">
        {t.seen}/{t.cards}
      </span>
      <span className={`drill-acc${acc === null ? "" : acc >= 85 ? " good" : acc < 60 ? " bad" : ""}`} title="Верно из последних ответов">
        {acc === null ? "нет ответов" : `${t.recentRight}/${t.recent}`}
      </span>
      <Boxes boxes={t.boxes} />
      {gated && !first && (
        <Button kind="ghost" small onClick={onToggle}>
          {t.open ? "Закрыть" : "Открыть"}
        </Button>
      )}
    </div>
  );
}

export function Boxes({ boxes }: { boxes: number[] }) {
  const total = boxes.reduce((a, b) => a + b, 0);
  return (
    <span className="drill-boxes" title={`Коробки Лейтнера 1-5: ${boxes.join(", ")}`}>
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
      <Check checked={gate.enabled} onChange={(v) => onChange({ ...gate, enabled: v })} label="Открывать темы по очереди" />
      {gate.enabled && (
        <div className="row">
          <span>Следующая тема откроется, когда в открытых будет</span>
          <input
            className="field drill-num"
            type="number"
            min={50}
            max={100}
            value={gate.percent}
            onChange={(e) => onChange({ ...gate, percent: Number(e.target.value) || 85 })}
          />
          <span>% верных из последних</span>
          <input
            className="field drill-num"
            type="number"
            min={5}
            max={50}
            value={gate.window}
            onChange={(e) => onChange({ ...gate, window: Number(e.target.value) || 20 })}
          />
          <span>ответов</span>
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
      <Check checked={strict} onChange={(v) => onChange(gate, v)} label="Строгие типы: 3 и 3.0, кортеж и список различаются" />
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
      toast("Не нашёл строк вида «вопрос | ответ».", "error");
      return;
    }
    set({ cards: [...d.cards, ...added] });
    setBulk("");
    toast(`Добавлено: ${plural(added.length, "карточка", "карточки", "карточек")}.`, "good");
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
      title={deck.id ? "Набор карточек" : "Новый набор"}
      onClose={onClose}
      footer={
        <>
          <span className="muted">{plural(d.cards.length, "карточка", "карточки", "карточек")}</span>
          <span className="grow" />
          <Button kind="paper" onClick={onClose}>
            Отмена
          </Button>
          <Button icon="check" disabled={busy || !d.title.trim()} onClick={() => void save()}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="drill-form">
        <label className="drill-field">
          <span>Название</span>
          <input
            className="field"
            value={d.title}
            maxLength={80}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Например, Метрики ML"
          />
        </label>
        <label className="drill-field">
          <span>Описание</span>
          <input className="field" value={d.description} maxLength={1000} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <div className="drill-field">
          <span>Как проверять ответы</span>
          <CheckFields spec={d.check} templates={templates} onChange={(s) => s && set({ check: s })} />
          <p className="muted">{checkHelp(d.check)}</p>
        </div>
        <div className="drill-field">
          <Check checked={d.gate.enabled} onChange={(v) => set({ gate: { ...d.gate, enabled: v } })} label="Открывать темы по очереди" />
          {d.gate.enabled && (
            <div className="row">
              <span>порог</span>
              <input
                className="field drill-num"
                type="number"
                min={50}
                max={100}
                value={d.gate.percent}
                onChange={(e) => set({ gate: { ...d.gate, percent: Number(e.target.value) || 85 } })}
              />
              <span>% из последних</span>
              <input
                className="field drill-num"
                type="number"
                min={5}
                max={50}
                value={d.gate.window}
                onChange={(e) => set({ gate: { ...d.gate, window: Number(e.target.value) || 20 } })}
              />
              <span>ответов</span>
            </div>
          )}
        </div>

        <h3 className="drill-h">Карточки</h3>
        {d.cards.length > 8 && (
          <input className="field search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по карточкам" />
        )}
        <div className="drill-cards">
          {shown.map(({ c, i }) =>
            open === i ? (
              <div key={i} className="drill-cardedit">
                <div className="row">
                  <input
                    className="field drill-topicfield"
                    value={c.topic}
                    placeholder="Тема"
                    maxLength={80}
                    onChange={(e) => setCard(i, { topic: e.target.value })}
                  />
                  <CheckFields spec={c.check} templates={templates} base={d.check} onChange={(s) => setCard(i, { check: s })} />
                  <span className="grow" />
                  <Button kind="ghost" small onClick={() => setOpen(null)}>
                    Свернуть
                  </Button>
                  <Button
                    kind="ghost"
                    small
                    icon="trash"
                    title="Удалить карточку"
                    onClick={() => {
                      set({ cards: d.cards.filter((_, j) => j !== i) });
                      setOpen(null);
                    }}
                  />
                </div>
                <textarea
                  className="field area drill-small"
                  value={c.prompt}
                  placeholder="Вопрос"
                  onChange={(e) => setCard(i, { prompt: e.target.value })}
                />
                <textarea
                  className="field area drill-small drill-mono"
                  value={c.code}
                  placeholder="Код (не обязательно)"
                  spellCheck={false}
                  onChange={(e) => setCard(i, { code: e.target.value })}
                />
                <input
                  className="field"
                  value={c.answer}
                  placeholder="Правильный ответ"
                  onChange={(e) => setCard(i, { answer: e.target.value })}
                />
                <textarea
                  className="field area drill-small"
                  value={c.alternatives.join("\n")}
                  placeholder="Другие верные ответы, по одному в строке"
                  onChange={(e) => setCard(i, { alternatives: e.target.value.split("\n") })}
                />
                {mode(c) === "choice" && (
                  <textarea
                    className="field area drill-small"
                    value={c.choices.join("\n")}
                    placeholder="Неверные варианты, по одному в строке"
                    onChange={(e) => setCard(i, { choices: e.target.value.split("\n") })}
                  />
                )}
                <input
                  className="field"
                  value={c.explain}
                  placeholder="Пояснение после промаха"
                  onChange={(e) => setCard(i, { explain: e.target.value })}
                />
              </div>
            ) : (
              <button key={i} className="drill-cardrow" onClick={() => setOpen(i)}>
                {c.topic && <span className="drill-chip">{c.topic}</span>}
                <span className="drill-cardq">{c.prompt || c.code.split("\n")[0] || "без вопроса"}</span>
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
          Карточка
        </Button>

        <h3 className="drill-h">Добавить много сразу</h3>
        <p className="muted">Одна карточка на строку: вопрос | ответ | пояснение (пояснение можно не писать).</p>
        <textarea
          className="field area drill-small"
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={"Что делает zip(*m)? | транспонирует матрицу\nlen([1, [2, 3]]) | 2 | вложенный список считается одним элементом"}
        />
        <div className="row">
          <input
            className="field drill-topicfield"
            value={bulkTopic}
            onChange={(e) => setBulkTopic(e.target.value)}
            placeholder="Тема для этих строк"
          />
          <Button kind="paper" small onClick={addBulk} disabled={!bulk.trim()}>
            Добавить строки
          </Button>
        </div>
      </div>
    </Modal>
  );
}
