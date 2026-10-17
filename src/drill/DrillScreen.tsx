import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { api, errText, type DrillOverview, type DrillPreset, type Generated } from "../api";
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

  if (!ov) return <div className="loading">Загрузка…</div>;

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
          toast(`Генератор «${g.title}» не сработал: ${errText(e)}`, "error");
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
        <h1 className="screen-title">Зубрилка</h1>
        <div className="seg drill-tabs">
          <button className={tab === "start" ? "on" : ""} onClick={() => setTab("start")}>
            <Px name="sBolt" scale={1.5} /> Старт
          </button>
          <button className={tab === "decks" ? "on" : ""} onClick={() => setTab("decks")}>
            <Px name="cards" scale={1.5} /> Наборы
          </button>
          <button className={tab === "theory" ? "on" : ""} onClick={() => setTab("theory")}>
            <Px name="sIdea" scale={1.5} /> Справочник
          </button>
          <button className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}>
            <Px name="star" scale={1.5} /> Статистика
          </button>
        </div>
        <div className="drill-badges">
          <span title={`Лучшая серия: ${ov.bestStreak}`}>
            <Px name="flame" scale={1.5} /> {plural(ov.streak, "день", "дня", "дней")}
          </span>
          <span title="Карточек, которым пора повториться, в основном режиме">
            <Px name="bell" scale={1.5} /> {ov.due} к повтору
          </span>
        </div>
      </div>

      {tab === "start" && (
        <>
          {locked && (
            <div className="banner drill-live">
              <Px name="lock" scale={2} /> Идёт сеанс «{active.name}» с замком экрана: верно {active.correct} из {active.amount}.
            </div>
          )}
          {last && (
            <section className={`card drill-last ${last.outcome}`}>
              <h2 className="card-title">
                <Px name={last.outcome === "done" ? "sTrophy" : "clock"} scale={2} /> Последний сеанс: {OUTCOME[last.outcome].toLowerCase()}
              </h2>
              <p>
                {last.name}, {stamp(last.endedAt)}. Верно {last.correct} из {last.answered}, с первого раза {last.firstTry},{" "}
                {spent(last.seconds)}.
              </p>
              {missText(last.misses, last.wrong) && <p className="muted">{missText(last.misses, last.wrong)}</p>}
            </section>
          )}
          <div className="drill-presets">
            {presets.map((p) => (
              <section key={p.id} className={`card drill-preset${p.id === ov.defaultPreset ? " main" : ""}`}>
                <h2 className="card-title">
                  <Px name={p.screen === "lock" ? "lock" : "cards"} scale={2} /> {p.name}
                  {p.id === ov.defaultPreset && <span className="drill-chip">основной</span>}
                </h2>
                <dl className="drill-facts">
                  <dt>Что</dt>
                  <dd>{sourcesText(p, ov.decks)}</dd>
                  <dt>Как</dt>
                  <dd>
                    {ORDER[p.order]}, до {goalText(p.goal, p.amount)}
                    {p.retry ? ", промахи возвращаются" : ""}
                    {p.selfCheck ? ", самопроверка" : ""}
                  </dd>
                  <dt>Условия</dt>
                  <dd>{conditionsText(p)}</dd>
                </dl>
                <div className="row">
                  <Button icon="arrowR" disabled={busy || !!locked} onClick={() => ask(p)}>
                    Начать
                  </Button>
                  <Button kind="paper" small icon="pencil" onClick={() => setEditing(p)}>
                    Изменить
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
                      Сделать основным
                    </Button>
                  )}
                  {ov.presets.length > 1 && (
                    <Button
                      kind="ghost"
                      small
                      icon="trash"
                      title="Удалить режим"
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
            Новый режим
          </Button>
          <p className="muted drill-help">
            Режим отвечает на три вопроса: что зубрить (наборы и темы), как (порядок, сколько карточек, проверка ответов) и в каких условиях
            (замок экрана или обычное окно, выход, потолок времени).
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
          title={`Начать «${asking.name}»?`}
          onClose={() => setAsking(null)}
          footer={
            <>
              <Button kind="paper" onClick={() => setAsking(null)}>
                Отмена
              </Button>
              <Button icon="lock" onClick={() => void start(asking)}>
                Закрыть экран и начать
              </Button>
            </>
          }
        >
          <p>Экран закроется на всех мониторах до {goalText(asking.goal, asking.amount)}. Вопросы будут на главном мониторе.</p>
          <p>
            {asking.escape === "hold"
              ? "Экстренный выход: держать Esc 5 секунд и подтвердить. Сеанс запишется как побег, серия дней прервётся."
              : "Выхода нет, только ответы."}
          </p>
          <p className="muted">Через {asking.limitMinutes} мин замок откроется сам. Диспетчер задач и Ctrl+Alt+Del работают как обычно.</p>
        </Modal>
      )}
    </div>
  );
}
