import { useEffect, useRef, useState } from "react";
import type { Nav } from "../App";
import type { Day } from "../api";
import { BoardThumb, useBoard } from "../board/BoardThumb";
import { Button, StampOverlay } from "../ui/kit";
import { Px } from "../ui/Px";
import { ChecklistView, DayHead, Description, SealDialog, SealInfo } from "./parts";
import { PlanWizard } from "./PlanWizard";

export function TodayScreen({ nav }: { nav: Nav }) {
  const { ov, go, refresh, patchDay } = nav;
  const day = ov.todayDay;
  const [wizard, setWizard] = useState(false);
  const [sealing, setSealing] = useState<Day | null>(null);
  const [stampText, setStampText] = useState<string | null>(null);
  const board = useBoard(ov.today, day?.result.updatedAt ?? "");
  const checklist = day?.plan?.checklist ?? [];
  const doneRefs = new Set(checklist.filter((c) => c.done).map((c) => c.id));
  const placed = new Set(board?.items.flatMap((i) => (i.kind === "task" ? [i.ref] : [])) ?? []);
  const pending = board === undefined || day?.result.sealed ? 0 : checklist.filter((c) => c.done && !placed.has(c.id)).length;
  const flash = useFlash(pending, board !== undefined);

  const sealed = (d: Day) => {
    patchDay(d);
    setSealing(null);
    setStampText("ЗАПЕЧАТАНО");
    void refresh();
  };

  const overlays = (
    <>
      {sealing && <SealDialog day={sealing} onClose={() => setSealing(null)} onSealed={sealed} />}
      {stampText && <StampOverlay text={stampText} onDone={() => setStampText(null)} />}
    </>
  );

  const yesterday = ov.yesterdayOpen && ov.yesterdayDay?.plan && (
    <div className="banner">
      <Px name="clock" scale={2} />
      <span className="grow">
        Вчерашний день «{ov.yesterdayDay.plan.name}» ещё не запечатан. Итоги можно подвести до конца сегодняшнего дня.
      </span>
      <Button small kind="paper" icon="image" onClick={() => go({ name: "board", date: ov.yesterday })}>
        Доска
      </Button>
      <Button small kind="green" icon="lock" onClick={() => setSealing(ov.yesterdayDay)}>
        Запечатать
      </Button>
    </div>
  );

  if (!day?.plan) {
    if (wizard)
      return (
        <div className="screen">
          <PlanWizard
            date={ov.today}
            mode="today"
            onSaved={(d) => {
              patchDay(d);
              setWizard(false);
              setStampText("ЗАПИСАНО");
              void refresh();
            }}
            onCancel={() => setWizard(false)}
          />
          {overlays}
        </div>
      );
    const fresh = ov.totalDays === 0 && !ov.tomorrowDay && !ov.yesterdayDay;
    if (fresh)
      return (
        <div className="screen">
          <div className="empty">
            <Px name="moonColor" scale={6} />
            <h1 className="empty-title">Привет! Это Next Day</h1>
            <p>
              Каждый вечер вы даёте завтрашнему дню имя и коротко описываете планы. Днём отмечаете чеклист, а вечером
              собираете итоги на доске (скриншоты, заметки, рисунки) и запечатываете день.
            </p>
            <div className="row center">
              <Button icon="moon" onClick={() => go({ name: "tomorrow" })}>
                Назвать завтрашний день
              </Button>
              <Button kind="paper" icon="pencil" onClick={() => setWizard(true)}>
                Начать с сегодняшнего
              </Button>
            </div>
            <p className="muted">Приложение живёт в трее рядом с часами и напомнит о себе утром и вечером.</p>
          </div>
          {overlays}
        </div>
      );
    return (
      <div className="screen">
        {yesterday}
        <div className="empty">
          <Px name="sunColor" scale={6} />
          <h1 className="empty-title">Сегодня безымянный день</h1>
          <p>
            Вчера день не назвали. Ничего страшного: назовите его сейчас, и он отметится как «назван в тот же день».
          </p>
          <div className="row center">
            <Button icon="pencil" onClick={() => setWizard(true)}>
              Назвать сегодняшний день
            </Button>
            {!ov.tomorrowDay && (
              <Button kind="paper" icon="moon" onClick={() => go({ name: "tomorrow" })}>
                Назвать завтрашний
              </Button>
            )}
          </div>
          {ov.tomorrowDay?.plan && <p className="muted">А завтрашний уже назван: «{ov.tomorrowDay.plan.name}».</p>}
        </div>
        {overlays}
      </div>
    );
  }

  const plan = day.plan;
  const r = day.result;
  const hasBoard = r.boardItems > 0 || r.hasInk;

  return (
    <div className="screen today">
      {yesterday}
      <div className="cols">
        <div className="col-main">
          <DayHead label="Сегодня" date={day.date} plan={plan} />
          <Description text={plan.description} />
          {plan.checklist && <ChecklistView items={plan.checklist} date={day.date} tickable={!r.sealed} onDay={patchDay} />}
        </div>
        <div className="col-side">
          {ov.evening && <RitualCard nav={nav} pending={pending} onSeal={() => setSealing(day)} />}
          <section className={`card${flash ? " flash" : ""}`}>
            <h2 className="card-title">
              <Px name="image" scale={2} /> Итоги дня
            </h2>
            <SealInfo day={day} />
            {hasBoard ? (
              board && (
                <BoardThumb
                  board={board}
                  date={day.date}
                  dataDir={ov.dataDir}
                  doneRefs={doneRefs}
                  onOpen={() => go(r.sealed ? { name: "day", date: day.date } : { name: "board", date: day.date })}
                />
              )
            ) : (
              !r.sealed && (
                <p className="muted">
                  Доска пока пустая. Добавляйте сюда скриншоты (Win+Shift+S, потом Ctrl+V на доске), заметки и рисунки о том, что
                  получилось.
                </p>
              )
            )}
            {r.sealed ? (
              <Button kind="paper" icon="calendar" onClick={() => go({ name: "day", date: day.date })}>
                Открыть день
              </Button>
            ) : (
              <div className="row">
                <Button icon="pencil" onClick={() => go({ name: "board", date: day.date })}>
                  Доска итогов
                  <NewBadge count={pending} />
                </Button>
                <Button kind="green" icon="lock" onClick={() => setSealing(day)}>
                  Запечатать
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
      {overlays}
    </div>
  );
}

function useFlash(count: number, ready: boolean) {
  const [flash, setFlash] = useState(false);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    const before = prev.current;
    prev.current = count;
    if (before === null || count <= before) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(t);
  }, [count, ready]);
  return flash;
}

function NewBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="new-badge" title="Сделанные пункты, которых ещё нет на доске">
      +{count}
    </span>
  );
}

function RitualCard({ nav, pending, onSeal }: { nav: Nav; pending: number; onSeal: () => void }) {
  const { ov, go } = nav;
  const today = ov.todayDay;
  const resultsDone = !today?.plan || today.result.sealed;
  const planDone = !!ov.tomorrowDay?.plan;
  return (
    <section className={`card ritual${resultsDone && planDone ? " done" : ""}`}>
      <h2 className="card-title">
        <Px name="moonColor" scale={2} /> Вечерний ритуал
      </h2>
      <ol className="ritual-steps">
        <li className={resultsDone ? "ok" : ""}>
          <i>{resultsDone ? <Px name="check" scale={1.5} /> : "1"}</i>
          <span>{resultsDone ? "Итоги дня запечатаны" : "Подвести итоги дня"}</span>
          {!resultsDone && (
            <div className="rs-actions">
              <Button small kind="paper" icon="image" onClick={() => go({ name: "board", date: ov.today })}>
                Доска
                <NewBadge count={pending} />
              </Button>
              <Button small kind="green" icon="lock" onClick={onSeal}>
                Печать
              </Button>
            </div>
          )}
        </li>
        <li className={planDone ? "ok" : ""}>
          <i>{planDone ? <Px name="check" scale={1.5} /> : "2"}</i>
          <span>{planDone ? <>Завтра: «{ov.tomorrowDay!.plan!.name}»</> : "Назвать завтрашний день"}</span>
          {!planDone && (
            <div className="rs-actions">
              <Button small icon="moon" onClick={() => go({ name: "tomorrow" })}>
                Назвать
              </Button>
            </div>
          )}
        </li>
      </ol>
      {resultsDone && planDone && <p className="good">Ритуал пройден. Спокойной ночи!</p>}
    </section>
  );
}
