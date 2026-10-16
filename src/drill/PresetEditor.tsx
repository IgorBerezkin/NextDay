import { useState } from "react";
import { api, type DrillDeckInfo, type DrillGoal, type DrillOrder, type DrillOverview, type DrillPreset, type DrillSource } from "../api";
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
  theoryLabel: "Теория",
  peekKeepsBox: true,
};

const ORDERS: { value: DrillOrder; label: string; hint: string }[] = [
  {
    value: "smart",
    label: "Умный",
    hint: "Интервальное повторение: сначала карточки, которым пора, и промахи, новые вперемешку, темы чередуются.",
  },
  { value: "random", label: "Случайно", hint: "Все карточки в случайном порядке." },
  { value: "sequence", label: "По порядку", hint: "Как в наборе; следующий сеанс продолжит с места, где остановился прошлый." },
];

const KIND_NOTE = (d: DrillDeckInfo) =>
  d.kind === "generator" ? (d.enabled ? ", генератор" : ", генератор выключен") : d.kind === "bank" && !d.builtin ? ", банк" : "";

const GOALS: { value: DrillGoal; label: string }[] = [
  { value: "correct", label: "верных ответов" },
  { value: "cards", label: "карточек" },
  { value: "minutes", label: "минут" },
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
  const [p, setP] = useState<DrillPreset>(() => structuredClone(preset ?? { ...BLANK, name: "Новый режим" }));
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
      title={preset ? "Режим Зубрилки" : "Новый режим"}
      onClose={onClose}
      footer={
        <>
          <Check checked={main} onChange={setMain} label="Основной режим" />
          <span className="grow" />
          <Button kind="paper" onClick={onClose}>
            Отмена
          </Button>
          <Button icon="check" disabled={busy || !p.sources.length} onClick={() => void save()}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="drill-form">
        <label className="drill-field">
          <span>Название</span>
          <input className="field" value={p.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
        </label>

        <h3 className="drill-h">Что зубрить</h3>
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
                      {d.gate.enabled ? "открытые темы" : "все темы"}
                    </button>
                    {d.topics.map((t) => (
                      <button
                        key={t.id}
                        className={`drill-tchip${src.topics.includes(t.id) ? " on" : ""}${t.open ? "" : " locked"}`}
                        title={t.open ? "" : "Тема ещё закрыта, но если выбрать её здесь, она попадёт в сеанс"}
                        onClick={() => toggleTopic(src, t.id)}
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <h3 className="drill-h">Как</h3>
        <div className="seg">
          {ORDERS.map((o) => (
            <button key={o.value} className={p.order === o.value ? "on" : ""} onClick={() => set({ order: o.value })}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="muted">{ORDERS.find((o) => o.value === p.order)?.hint}</p>
        <div className="row">
          <span>Сеанс идёт до</span>
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
        <Check checked={p.retry} onChange={(v) => set({ retry: v })} label="Промах возвращается позже в том же сеансе (с новыми данными)" />
        <Check checked={p.explain} onChange={(v) => set({ explain: v })} label="Показывать правило и после верного ответа" />

        <h3 className="drill-h">Как проверять ответы</h3>
        <div className="seg">
          <button className={!p.selfCheck ? "on" : ""} onClick={() => set({ selfCheck: false })}>
            По правилам карточек
          </button>
          <button className={p.selfCheck ? "on" : ""} onClick={() => set({ selfCheck: true })}>
            Самопроверка
          </button>
        </div>
        <p className="muted">
          {p.selfCheck
            ? "Ответ не печатаешь: вспоминаешь, открываешь правильный и честно отмечаешь, знал ли."
            : "Каждый набор сам задаёт, как сравнивать ответ: текст, литерал Python, форма, число или выбор. Это меняется во вкладке «Наборы»."}
        </p>

        <h3 className="drill-h">Теория в сеансе</h3>
        <div className="row">
          <span>Подпись лампочки</span>
          <input
            className="field drill-label"
            value={p.theoryLabel}
            maxLength={24}
            placeholder="только значок"
            onChange={(e) => set({ theoryLabel: e.target.value })}
          />
        </div>
        <p className="muted">Лампочка в карточке открывает справочник в любой момент сеанса. Пустая подпись оставит только значок.</p>
        <Check
          checked={p.peekKeepsBox}
          onChange={(v) => set({ peekKeepsBox: v })}
          label="Если открыл теорию до ответа, карточка не повышается и вернётся сегодня"
        />

        <h3 className="drill-h">Условия</h3>
        <div className="seg">
          <button className={p.screen === "lock" ? "on" : ""} onClick={() => set({ screen: "lock" })}>
            Замок на весь экран
          </button>
          <button className={p.screen === "window" ? "on" : ""} onClick={() => set({ screen: "window" })}>
            Обычное окно
          </button>
        </div>
        {p.screen === "lock" ? (
          <>
            <p className="muted">Окно закрывает все мониторы и возвращает себе фокус, Alt+F4 его не закрывает.</p>
            <div className="seg">
              <button className={p.escape === "hold" ? "on" : ""} onClick={() => set({ escape: "hold" })}>
                Выход: Esc 5 секунд
              </button>
              <button className={p.escape === "none" ? "on" : ""} onClick={() => set({ escape: "none" })}>
                Без выхода
              </button>
            </div>
            <div className="row">
              <span>Замок откроется сам через</span>
              <input
                className="field drill-num"
                type="number"
                min={5}
                max={180}
                value={p.limitMinutes}
                onChange={(e) => set({ limitMinutes: Math.max(5, Math.min(180, Number(e.target.value) || 5)) })}
              />
              <span>мин</span>
            </div>
          </>
        ) : (
          <p className="muted">Сеанс идёт во вкладке Зубрилки, его можно закончить в любой момент.</p>
        )}
      </div>
    </Modal>
  );
}
