import { useEffect, useState } from "react";
import type { Nav } from "../App";
import { api, type Day } from "../api";
import { parseBoard, boardHasContent, type Board } from "../board/model";
import { BoardView } from "../board/Stage";
import { Button, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { ChecklistView, DayHead, Description, SealInfo } from "./parts";

export function DayScreen({ nav, date }: { nav: Nav; date: string }) {
  const { ov, go } = nav;
  const [day, setDay] = useState<Day | null | undefined>(undefined);
  const [board, setBoard] = useState<Board | null>(null);
  const [dates, setDates] = useState<string[]>([]);

  useEffect(() => {
    api
      .day(date)
      .then(setDay)
      .catch((e) => {
        toastError(e);
        setDay(null);
      });
    api
      .board(date)
      .then((b) => setBoard(b ? parseBoard(b) : null))
      .catch(toastError);
    api
      .days()
      .then((ds) => setDates(ds.map((d) => d.date)))
      .catch(() => {});
  }, [date]);

  const idx = dates.indexOf(date);
  const older = idx >= 0 ? dates[idx + 1] : undefined;
  const newer = idx > 0 ? dates[idx - 1] : undefined;

  const top = (
    <div className="dv-nav">
      <Button kind="ghost" small icon="arrowL" onClick={() => go({ name: "history" })}>
        История
      </Button>
      <span className="grow" />
      <Button kind="paper" small icon="arrowL" disabled={!older} onClick={() => older && go({ name: "day", date: older })} title="День раньше" />
      <Button kind="paper" small icon="arrowR" disabled={!newer} onClick={() => newer && go({ name: "day", date: newer })} title="День позже" />
    </div>
  );

  if (day === undefined) return <div className="screen">{top}</div>;
  if (!day?.plan)
    return (
      <div className="screen">
        {top}
        <div className="empty small">
          <p>У этого дня нет плана.</p>
        </div>
      </div>
    );

  const plan = day.plan;
  const open = !day.result.sealed && (date === ov.today || date === ov.yesterday);
  const label = date === ov.today ? "Сегодня" : date === ov.yesterday ? "Вчера" : date === ov.tomorrow ? "Завтра" : date.slice(0, 4);

  return (
    <div className="screen dayview">
      {top}
      <div className="cols">
        <div className="col-main">
          <DayHead label={label} date={date} plan={plan}>
            {day.result.sealed && (
              <span className="tag seal">
                <Px name="lock" scale={1} /> запечатан
              </span>
            )}
          </DayHead>
          <Description text={plan.description} />
          {plan.checklist && <ChecklistView items={plan.checklist} date={date} />}
        </div>
        <div className="col-side">
          <section className="card">
            <h2 className="card-title">
              <Px name="lock" scale={2} /> Итоги
            </h2>
            {day.result.sealed ? <SealInfo day={day} /> : <p className="muted">Итоги ещё не запечатаны.</p>}
            {open && (
              <Button icon="pencil" onClick={() => go({ name: "board", date })}>
                Доска итогов
              </Button>
            )}
          </section>
        </div>
      </div>
      {board && boardHasContent(board) && (
        <section className="dv-board">
          <h2 className="card-title">
            <Px name="image" scale={2} /> Доска итогов
          </h2>
          <BoardView board={board} date={date} dataDir={ov.dataDir} fit="width" />
        </section>
      )}
    </div>
  );
}
