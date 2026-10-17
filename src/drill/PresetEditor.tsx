import { useState } from "react";
import { api, type DrillDeckInfo, type DrillGoal, type DrillOrder, type DrillOverview, type DrillPreset, type DrillSource } from "../api";
import { t } from "../i18n";
import { Button, Check, Modal, toastError } from "../ui/kit";

const BLANK: DrillPreset = {
  id: "",
  name: "",
  sources: [{ deck: "python", topics: [] }],
  order: "smart",
  goal: "correct",
  amount: 10,
  retry: true,
  explain: false,
  screen: "lock",
  escape: "hold",
  limitMinutes: 30,
  selfCheck: false,
  theoryLabel: t("Теория", "Theory"),
  peekKeepsBox: true,
};

const ORDERS: { value: DrillOrder; label: string; hint: string }[] = [
  {
    value: "smart",
    label: t("Умный", "Smart"),
    hint: t(
      "Интервальное повторение: сначала карточки, которым пора, и промахи, новые вперемешку, темы чередуются.",
      "Spaced repetition: due cards and misses first, new ones mixed in, topics take turns.",
    ),
  },
  { value: "random", label: t("Случайно", "Random"), hint: t("Все карточки в случайном порядке.", "All cards in random order.") },
  {
    value: "sequence",
    label: t("По порядку", "In order"),
    hint: t(
      "Как в наборе; следующий сеанс продолжит с места, где остановился прошлый.",
      "As in the deck; the next session picks up where the last one stopped.",
    ),
  },
];

const KIND_NOTE = (d: DrillDeckInfo) =>
  d.kind === "generator"
    ? d.enabled
      ? t(", генератор", ", generator")
      : t(", генератор выключен", ", generator off")
    : d.kind === "bank" && !d.builtin
      ? t(", банк", ", bank")
      : "";

const GOALS: { value: DrillGoal; label: string }[] = [
  { value: "correct", label: t("верных ответов", "right answers") },
  { value: "cards", label: t("карточек", "cards") },
  { value: "minutes", label: t("минут", "minutes") },
];

export function PresetEditor({
  preset,
  ov,
  onClose,
  onSaved,
}: {
  preset: DrillPreset | null;
  ov: DrillOverview;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [p, setP] = useState<DrillPreset>(() => structuredClone(preset ?? { ...BLANK, name: t("Новый режим", "New mode") }));
  const [main, setMain] = useState(preset ? preset.id === ov.defaultPreset : false);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<DrillPreset>) => setP((x) => ({ ...x, ...patch }));

  const source = (deck: string) => p.sources.find((s) => s.deck === deck);
  const toggleDeck = (deck: string, on: boolean) =>
    set({ sources: on ? [...p.sources, { deck, topics: [] }] : p.sources.filter((s) => s.deck !== deck) });
  const toggleTopic = (src: DrillSource, topic: string) =>
    set({
      sources: p.sources.map((s) =>
        s.deck === src.deck ? { ...s, topics: s.topics.includes(topic) ? s.topics.filter((t) => t !== topic) : [...s.topics, topic] } : s,
      ),
    });

  const save = async () => {
    setBusy(true);
    try {
      await api.drillSavePreset(p, main);
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const maxAmount = p.goal === "minutes" ? 180 : 200;

  return (
    <Modal
      wide
      title={preset ? t("Режим Зубрилки", "Drill mode") : t("Новый режим", "New mode")}
      onClose={onClose}
      footer={
        <>
          <Check checked={main} onChange={setMain} label={t("Основной режим", "Default mode")} />
          <span className="grow" />
          <Button kind="paper" onClick={onClose}>
            {t("Отмена", "Cancel")}
          </Button>
          <Button icon="check" disabled={busy || !p.sources.length} onClick={() => void save()}>
            {t("Сохранить", "Save")}
          </Button>
        </>
      }
    >
      <div className="drill-form">
        <label className="drill-field">
          <span>{t("Название", "Name")}</span>
          <input className="field" value={p.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
        </label>

        <h3 className="drill-h">{t("Что зубрить", "What to drill")}</h3>
        <div className="drill-sources">
          {ov.decks.map((d) => {
            const src = source(d.id);
            return (
              <div key={d.id} className={`drill-source${src ? " on" : ""}`}>
                <Check checked={!!src} onChange={(v) => toggleDeck(d.id, v)} label={`${d.title} (${d.cards})${KIND_NOTE(d)}`} />
                {src && d.topics.length > 1 && (
                  <div className="drill-topic-pick">
                    <button
                      className={`drill-tchip${src.topics.length === 0 ? " on" : ""}`}
                      onClick={() => set({ sources: p.sources.map((s) => (s.deck === d.id ? { ...s, topics: [] } : s)) })}
                    >
                      {d.gate.enabled ? t("открытые темы", "open topics") : t("все темы", "all topics")}
                    </button>
                    {d.topics.map((topic) => (
                      <button
                        key={topic.id}
                        className={`drill-tchip${src.topics.includes(topic.id) ? " on" : ""}${topic.open ? "" : " locked"}`}
                        title={
                          topic.open
                            ? ""
                            : t(
                                "Тема ещё закрыта, но если выбрать её здесь, она попадёт в сеанс",
                                "This topic is still locked, but if you pick it here, it goes into the session",
                              )
                        }
                        onClick={() => toggleTopic(src, topic.id)}
                      >
                        {topic.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <h3 className="drill-h">{t("Как", "How")}</h3>
        <div className="seg">
          {ORDERS.map((o) => (
            <button key={o.value} className={p.order === o.value ? "on" : ""} onClick={() => set({ order: o.value })}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="muted">{ORDERS.find((o) => o.value === p.order)?.hint}</p>
        <div className="row">
          <span>{t("Сеанс идёт до", "Session ends at")}</span>
          <input
            className="field drill-num"
            type="number"
            min={1}
            max={maxAmount}
            value={p.amount}
            onChange={(e) => set({ amount: Math.max(1, Math.min(maxAmount, Number(e.target.value) || 1)) })}
          />
          <select className="field select" value={p.goal} onChange={(e) => set({ goal: e.target.value as DrillGoal })}>
            {GOALS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <Check
          checked={p.retry}
          onChange={(v) => set({ retry: v })}
          label={t(
            "Промах возвращается позже в том же сеансе (с новыми данными)",
            "A miss comes back later in the same session (with new data)",
          )}
        />
        <Check
          checked={p.explain}
          onChange={(v) => set({ explain: v })}
          label={t("Показывать правило и после верного ответа", "Show the rule after a right answer too")}
        />

        <h3 className="drill-h">{t("Как проверять ответы", "How to check answers")}</h3>
        <div className="seg">
          <button className={!p.selfCheck ? "on" : ""} onClick={() => set({ selfCheck: false })}>
            {t("По правилам карточек", "By card rules")}
          </button>
          <button className={p.selfCheck ? "on" : ""} onClick={() => set({ selfCheck: true })}>
            {t("Самопроверка", "Self-check")}
          </button>
        </div>
        <p className="muted">
          {p.selfCheck
            ? t(
                "Ответ не печатаешь: вспоминаешь, открываешь правильный и честно отмечаешь, знал ли.",
                "You don't type the answer: you recall it, reveal the right one and honestly mark if you knew it.",
              )
            : t(
                "Каждый набор сам задаёт, как сравнивать ответ: текст, литерал Python, форма, число или выбор. Это меняется во вкладке «Наборы».",
                'Each deck sets how to compare the answer: text, Python literal, shape, number or choice. You change this on the "Decks" tab.',
              )}
        </p>

        <h3 className="drill-h">{t("Теория в сеансе", "Theory during a session")}</h3>
        <div className="row">
          <span>{t("Подпись лампочки", "Bulb caption")}</span>
          <input
            className="field drill-label"
            value={p.theoryLabel}
            maxLength={24}
            placeholder={t("только значок", "icon only")}
            onChange={(e) => set({ theoryLabel: e.target.value })}
          />
        </div>
        <p className="muted">
          {t(
            "Лампочка в карточке открывает справочник в любой момент сеанса. Пустая подпись оставит только значок.",
            "The bulb on a card opens the reference at any point in a session. An empty caption leaves just the icon.",
          )}
        </p>
        <Check
          checked={p.peekKeepsBox}
          onChange={(v) => set({ peekKeepsBox: v })}
          label={t(
            "Если открыл теорию до ответа, карточка не повышается и вернётся сегодня",
            "If you open theory before answering, the card stays in its box and comes back today",
          )}
        />

        <h3 className="drill-h">{t("Условия", "Conditions")}</h3>
        <div className="seg">
          <button className={p.screen === "lock" ? "on" : ""} onClick={() => set({ screen: "lock" })}>
            {t("Замок на весь экран", "Full screen lock")}
          </button>
          <button className={p.screen === "window" ? "on" : ""} onClick={() => set({ screen: "window" })}>
            {t("Обычное окно", "Normal window")}
          </button>
        </div>
        {p.screen === "lock" ? (
          <>
            <p className="muted">
              {t(
                "Окно закрывает все мониторы и возвращает себе фокус, Alt+F4 его не закрывает.",
                "The window covers all monitors and takes the focus back; Alt+F4 does not close it.",
              )}
            </p>
            <div className="seg">
              <button className={p.escape === "hold" ? "on" : ""} onClick={() => set({ escape: "hold" })}>
                {t("Выход: Esc 5 секунд", "Exit: hold Esc 5 s")}
              </button>
              <button className={p.escape === "none" ? "on" : ""} onClick={() => set({ escape: "none" })}>
                {t("Без выхода", "No exit")}
              </button>
            </div>
            <div className="row">
              <span>{t("Замок откроется сам через", "The lock opens by itself after")}</span>
              <input
                className="field drill-num"
                type="number"
                min={5}
                max={180}
                value={p.limitMinutes}
                onChange={(e) => set({ limitMinutes: Math.max(5, Math.min(180, Number(e.target.value) || 5)) })}
              />
              <span>{t("мин", "min")}</span>
            </div>
          </>
        ) : (
          <p className="muted">
            {t(
              "Сеанс идёт во вкладке Зубрилки, его можно закончить в любой момент.",
              "The session runs in the Drill tab, and you can finish it at any time.",
            )}
          </p>
        )}
      </div>
    </Modal>
  );
}
