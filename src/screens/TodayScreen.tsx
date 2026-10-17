import { useEffect, useRef, useState } from "react";
import type { Nav } from "../App";
import type { Day } from "../api";
import { BoardThumb, useBoard } from "../board/BoardThumb";
import { t } from "../i18n";
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
    setStampText(t("ЗАПЕЧАТАНО", "SEALED"));
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
        {t(
          `Вчерашний день «${ov.yesterdayDay.plan.name}» ещё не запечатан. Итоги можно подвести до конца сегодняшнего дня.`,
          `Yesterday's "${ov.yesterdayDay.plan.name}" is not sealed yet. You can sum it up until the end of today.`,
        )}
      </span>
      <Button small kind="paper" icon="image" onClick={() => go({ name: "board", date: ov.yesterday })}>
        {t("Доска", "Board")}
      </Button>
      <Button small kind="green" icon="lock" onClick={() => setSealing(ov.yesterdayDay)}>
        {t("Запечатать", "Seal")}
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
              setStampText(t("ЗАПИСАНО", "SAVED"));
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
            <h1 className="empty-title">{t("Привет! Это Next Day", "Hi! This is Next Day")}</h1>
            <p>
              {t(
                "Каждый вечер вы даёте завтрашнему дню имя и коротко описываете планы. Днём отмечаете чеклист, а вечером собираете итоги на доске (скриншоты, заметки, рисунки) и запечатываете день.",
                "Every evening you give tomorrow a name and briefly describe your plans. During the day you tick off the checklist, and in the evening you collect the results on a board (screenshots, notes, drawings) and seal the day.",
              )}
            </p>
            <div className="row center">
              <Button icon="moon" onClick={() => go({ name: "tomorrow" })}>
                {t("Назвать завтрашний день", "Name tomorrow")}
              </Button>
              <Button kind="paper" icon="pencil" onClick={() => setWizard(true)}>
                {t("Начать с сегодняшнего", "Start with today")}
              </Button>
            </div>
            <p className="muted">
              {t(
                "Приложение живёт в трее рядом с часами и напомнит о себе утром и вечером.",
                "The app lives in the tray next to the clock and reminds you in the morning and evening.",
              )}
            </p>
          </div>
          {overlays}
        </div>
      );
    return (
      <div className="screen">
        {yesterday}
        <div className="empty">
          <Px name="sunColor" scale={6} />
          <h1 className="empty-title">{t("Сегодня безымянный день", "Today is an unnamed day")}</h1>
          <p>
            {t(
              "Вчера день не назвали. Ничего страшного: назовите его сейчас, и он отметится как «назван в тот же день».",
              'It was not named yesterday. No problem: name it now, and it gets marked "named the same day".',
            )}
          </p>
          <div className="row center">
            <Button icon="pencil" onClick={() => setWizard(true)}>
              {t("Назвать сегодняшний день", "Name today")}
            </Button>
            {!ov.tomorrowDay && (
              <Button kind="paper" icon="moon" onClick={() => go({ name: "tomorrow" })}>
                {t("Назвать завтрашний", "Name tomorrow")}
              </Button>
            )}
          </div>
          {ov.tomorrowDay?.plan && (
            <p className="muted">
              {t(`А завтрашний уже назван: «${ov.tomorrowDay.plan.name}».`, `Tomorrow is already named: "${ov.tomorrowDay.plan.name}".`)}
            </p>
          )}
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
          <DayHead label={t("Сегодня", "Today")} date={day.date} plan={plan} />
          <Description text={plan.description} />
          {plan.checklist && (
            <ChecklistView
              items={plan.checklist}
              date={day.date}
              tickable={!r.sealed}
              onDay={patchDay}
              onOpenFrom={(date) => go({ name: "day", date })}
              onOpenGoal={(focus) => go({ name: "map", focus })}
            />
          )}
        </div>
        <div className="col-side">
          {ov.evening && <RitualCard nav={nav} pending={pending} onSeal={() => setSealing(day)} />}
          <section className={`card${flash ? " flash" : ""}`}>
            <h2 className="card-title">
              <Px name="image" scale={2} /> {t("Итоги дня", "Day results")}
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
                  {t(
                    "Доска пока пустая. Добавляйте сюда скриншоты (Win+Shift+S, потом Ctrl+V на доске), заметки и рисунки о том, что получилось.",
                    "The board is empty for now. Add screenshots (Win+Shift+S, then Ctrl+V on the board), notes and drawings of what you got done.",
                  )}
                </p>
              )
            )}
            {r.sealed ? (
              <Button kind="paper" icon="calendar" onClick={() => go({ name: "day", date: day.date })}>
                {t("Открыть день", "Open day")}
              </Button>
            ) : (
              <div className="row">
                <Button icon="pencil" onClick={() => go({ name: "board", date: day.date })}>
                  {t("Доска итогов", "Results board")}
                  <NewBadge count={pending} />
                </Button>
                <Button kind="green" icon="lock" onClick={() => setSealing(day)}>
                  {t("Запечатать", "Seal")}
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
    <span className="new-badge" title={t("Сделанные пункты, которых ещё нет на доске", "Done items not on the board yet")}>
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
        <Px name="moonColor" scale={2} /> {t("Вечерний ритуал", "Evening ritual")}
      </h2>
      <ol className="ritual-steps">
        <li className={resultsDone ? "ok" : ""}>
          <i>{resultsDone ? <Px name="check" scale={1.5} /> : "1"}</i>
          <span>{resultsDone ? t("Итоги дня запечатаны", "Day results sealed") : t("Подвести итоги дня", "Sum up the day")}</span>
          {!resultsDone && (
            <div className="rs-actions">
              <Button small kind="paper" icon="image" onClick={() => go({ name: "board", date: ov.today })}>
                {t("Доска", "Board")}
                <NewBadge count={pending} />
              </Button>
              <Button small kind="green" icon="lock" onClick={onSeal}>
                {t("Печать", "Seal")}
              </Button>
            </div>
          )}
        </li>
        <li className={planDone ? "ok" : ""}>
          <i>{planDone ? <Px name="check" scale={1.5} /> : "2"}</i>
          <span>
            {planDone
              ? t(`Завтра: «${ov.tomorrowDay!.plan!.name}»`, `Tomorrow: "${ov.tomorrowDay!.plan!.name}"`)
              : t("Назвать завтрашний день", "Name tomorrow")}
          </span>
          {!planDone && (
            <div className="rs-actions">
              <Button small icon="moon" onClick={() => go({ name: "tomorrow" })}>
                {t("Назвать", "Name")}
              </Button>
            </div>
          )}
        </li>
      </ol>
      {resultsDone && planDone && <p className="good">{t("Ритуал пройден. Спокойной ночи!", "Ritual complete. Good night!")}</p>}
    </section>
  );
}
