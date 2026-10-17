import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { api, errText, type DrillOverview, type DrillPreset, type Generated } from "../api";
import { t } from "../i18n";
import { sfx } from "../sound";
import { Button, Modal, toast, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { plural, stamp } from "../util";
import { DrillDecks } from "./DrillDecks";
import { DrillSession } from "./DrillSession";
import { DrillStats } from "./DrillStats";
import { conditionsText, goalText, missText, ORDER, OUTCOME, sourcesText, spent } from "./drillKit";
import { genVariants } from "./plugin";
import { PresetEditor } from "./PresetEditor";
import { TheoryBrowser } from "./Theory";

type Tab = "start" | "decks" | "theory" | "stats";

const PER_TEMPLATE = 12;

export function DrillScreen() {
  const [ov, setOv] = useState<DrillOverview | null>(null);
  const [tab, setTab] = useState<Tab>("start");
  const [editing, setEditing] = useState<DrillPreset | "new" | null>(null);
  const [asking, setAsking] = useState<DrillPreset | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOv(await api.drillOverview());
    } catch (e) {
      toastError(e);
    }
  }, []);

  useEffect(() => {
    void load();
    const subs = [listen("drill-changed", () => void load()), listen("data-changed", () => void load())];
    return () => subs.forEach((p) => void p.then((f) => f()));
  }, [load]);

  if (!ov) return <div className="loading">{t("Загрузка…", "Loading...")}</div>;

  const active = ov.active;
  if (active && active.screen === "window") {
    return (
      <div className="screen drill-screen">
        <DrillSession
          key={active.id}
          initial={active}
          lock={false}
          onDone={async () => {
            await api.drillDismiss().catch(() => {});
            await load();
          }}
        />
      </div>
    );
  }

  const start = async (p: DrillPreset) => {
    setAsking(null);
    setBusy(true);
    try {
      const generated: Generated = {};
      for (const g of await api.drillGenSources(p.id)) {
        try {
          generated[g.id] = (await genVariants(g.code, g.templates, PER_TEMPLATE)).variants;
        } catch (e) {
          toast(t(`Генератор «${g.title}» не сработал: ${errText(e)}`, `Generator "${g.title}" failed: ${errText(e)}`), "error");
        }
      }
      await api.drillStart(p.id, generated);
      sfx.step();
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const ask = (p: DrillPreset) => {
    if (p.screen === "lock") setAsking(p);
    else void start(p);
  };

  const presets = [...ov.presets].sort((a, b) => Number(b.id === ov.defaultPreset) - Number(a.id === ov.defaultPreset));
  const last = ov.sessions[0];
  const locked = active && !active.ended;

  return (
    <div className="screen drill-screen">
      <div className="drill-headline">
        <h1 className="screen-title">{t("Зубрилка", "Drill")}</h1>
        <div className="seg drill-tabs">
          <button className={tab === "start" ? "on" : ""} onClick={() => setTab("start")}>
            <Px name="sBolt" scale={1.5} /> {t("Старт", "Start")}
          </button>
          <button className={tab === "decks" ? "on" : ""} onClick={() => setTab("decks")}>
            <Px name="cards" scale={1.5} /> {t("Наборы", "Decks")}
          </button>
          <button className={tab === "theory" ? "on" : ""} onClick={() => setTab("theory")}>
            <Px name="sIdea" scale={1.5} /> {t("Справочник", "Reference")}
          </button>
          <button className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}>
            <Px name="star" scale={1.5} /> {t("Статистика", "Stats")}
          </button>
        </div>
        <div className="drill-badges">
          <span title={t(`Лучшая серия: ${ov.bestStreak}`, `Best streak: ${ov.bestStreak}`)}>
            <Px name="flame" scale={1.5} /> {plural(ov.streak, "день", "дня", "дней", "day", "days")}
          </span>
          <span title={t("Карточек, которым пора повториться, в основном режиме", "Cards due for review in the default mode")}>
            <Px name="bell" scale={1.5} /> {ov.due} {t("к повтору", "due")}
          </span>
        </div>
      </div>

      {tab === "start" && (
        <>
          {locked && (
            <div className="banner drill-live">
              <Px name="lock" scale={2} />{" "}
              {t(
                `Идёт сеанс «${active.name}» с замком экрана: верно ${active.correct} из ${active.amount}.`,
                `Screen lock session "${active.name}" is on: ${active.correct} of ${active.amount} right.`,
              )}
            </div>
          )}
          {last && (
            <section className={`card drill-last ${last.outcome}`}>
              <h2 className="card-title">
                <Px name={last.outcome === "done" ? "sTrophy" : "clock"} scale={2} />{" "}
                {t(`Последний сеанс: ${OUTCOME[last.outcome].toLowerCase()}`, `Last session: ${OUTCOME[last.outcome].toLowerCase()}`)}
              </h2>
              <p>
                {t(
                  `${last.name}, ${stamp(last.endedAt)}. Верно ${last.correct} из ${last.answered}, с первого раза ${last.firstTry}, ${spent(last.seconds)}.`,
                  `${last.name}, ${stamp(last.endedAt)}. ${last.correct} of ${last.answered} right, ${last.firstTry} on the first try, ${spent(last.seconds)}.`,
                )}
              </p>
              {missText(last.misses, last.wrong) && <p className="muted">{missText(last.misses, last.wrong)}</p>}
            </section>
          )}
          <div className="drill-presets">
            {presets.map((p) => (
              <section key={p.id} className={`card drill-preset${p.id === ov.defaultPreset ? " main" : ""}`}>
                <h2 className="card-title">
                  <Px name={p.screen === "lock" ? "lock" : "cards"} scale={2} /> {p.name}
                  {p.id === ov.defaultPreset && <span className="drill-chip">{t("основной", "default")}</span>}
                </h2>
                <dl className="drill-facts">
                  <dt>{t("Что", "What")}</dt>
                  <dd>{sourcesText(p, ov.decks)}</dd>
                  <dt>{t("Как", "How")}</dt>
                  <dd>
                    {ORDER[p.order]}, {t("до", "up to")} {goalText(p.goal, p.amount)}
                    {p.retry ? t(", промахи возвращаются", ", misses come back") : ""}
                    {p.selfCheck ? t(", самопроверка", ", self-check") : ""}
                  </dd>
                  <dt>{t("Условия", "Conditions")}</dt>
                  <dd>{conditionsText(p)}</dd>
                </dl>
                <div className="row">
                  <Button icon="arrowR" disabled={busy || !!locked} onClick={() => ask(p)}>
                    {t("Начать", "Start")}
                  </Button>
                  <Button kind="paper" small icon="pencil" onClick={() => setEditing(p)}>
                    {t("Изменить", "Edit")}
                  </Button>
                  {p.id !== ov.defaultPreset && (
                    <Button
                      kind="ghost"
                      small
                      onClick={async () => {
                        try {
                          await api.drillSetDefault(p.id);
                          await load();
                        } catch (e) {
                          toastError(e);
                        }
                      }}
                    >
                      {t("Сделать основным", "Make default")}
                    </Button>
                  )}
                  {ov.presets.length > 1 && (
                    <Button
                      kind="ghost"
                      small
                      icon="trash"
                      title={t("Удалить режим", "Delete mode")}
                      onClick={async () => {
                        try {
                          await api.drillDeletePreset(p.id);
                          await load();
                        } catch (e) {
                          toastError(e);
                        }
                      }}
                    />
                  )}
                </div>
              </section>
            ))}
          </div>
          <Button kind="paper" icon="plus" onClick={() => setEditing("new")}>
            {t("Новый режим", "New mode")}
          </Button>
          <p className="muted drill-help">
            {t(
              "Режим отвечает на три вопроса: что зубрить (наборы и темы), как (порядок, сколько карточек, проверка ответов) и в каких условиях (замок экрана или обычное окно, выход, потолок времени).",
              "A mode answers three questions: what to drill (decks and topics), how (order, how many cards, answer checks) and under what conditions (screen lock or a normal window, exit, time limit).",
            )}
          </p>
        </>
      )}

      {tab === "decks" && <DrillDecks ov={ov} reload={load} />}
      {tab === "theory" && <TheoryBrowser ov={ov} />}
      {tab === "stats" && <DrillStats ov={ov} />}

      {editing && (
        <PresetEditor
          preset={editing === "new" ? null : editing}
          ov={ov}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      {asking && (
        <Modal
          title={t(`Начать «${asking.name}»?`, `Start "${asking.name}"?`)}
          onClose={() => setAsking(null)}
          footer={
            <>
              <Button kind="paper" onClick={() => setAsking(null)}>
                {t("Отмена", "Cancel")}
              </Button>
              <Button icon="lock" onClick={() => void start(asking)}>
                {t("Закрыть экран и начать", "Lock the screen and start")}
              </Button>
            </>
          }
        >
          <p>
            {t(
              `Экран закроется на всех мониторах до ${goalText(asking.goal, asking.amount)}. Вопросы будут на главном мониторе.`,
              `The screen locks on all monitors until you reach ${goalText(asking.goal, asking.amount)}. Questions show on the main monitor.`,
            )}
          </p>
          <p>
            {asking.escape === "hold"
              ? t(
                  "Экстренный выход: держать Esc 5 секунд и подтвердить. Сеанс запишется как побег, серия дней прервётся.",
                  "Emergency exit: hold Esc for 5 seconds and confirm. The session counts as an escape, and your streak breaks.",
                )
              : t("Выхода нет, только ответы.", "No way out, only answers.")}
          </p>
          <p className="muted">
            {t(
              `Через ${asking.limitMinutes} мин замок откроется сам. Диспетчер задач и Ctrl+Alt+Del работают как обычно.`,
              `The lock opens by itself after ${asking.limitMinutes} min. Task Manager and Ctrl+Alt+Del work as usual.`,
            )}
          </p>
        </Modal>
      )}
    </div>
  );
}
