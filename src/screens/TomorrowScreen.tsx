import { useState } from "react";
import type { Nav } from "../App";
import { Button, StampOverlay } from "../ui/kit";
import { Px } from "../ui/Px";
import { duration } from "../util";
import { ChecklistView, DayHead, Description } from "./parts";
import { PlanWizard } from "./PlanWizard";

export function TomorrowScreen({ nav }: { nav: Nav }) {
  const { ov, refresh, patchDay } = nav;
  const day = ov.tomorrowDay;
  const [editing, setEditing] = useState(false);
  const [stampText, setStampText] = useState<string | null>(null);
  const carry = (ov.todayDay?.plan?.checklist ?? []).filter((i) => !i.done);

  if (!day?.plan || editing) {
    return (
      <div className="screen">
        <PlanWizard
          key={day?.plan ? "edit" : "new"}
          date={ov.tomorrow}
          mode="tomorrow"
          initial={day?.plan}
          carry={carry}
          onSaved={(d) => {
            const wasEdit = !!day?.plan;
            patchDay(d);
            setEditing(false);
            setStampText(wasEdit ? "ИСПРАВЛЕНО" : "ЗАПИСАНО");
            void refresh();
          }}
          onCancel={day?.plan ? () => setEditing(false) : undefined}
        />
        {stampText && <StampOverlay text={stampText} onDone={() => setStampText(null)} />}
      </div>
    );
  }

  const plan = day.plan;
  return (
    <div className="screen">
      <div className="cols">
        <div className="col-main">
          <DayHead label="Завтра" date={day.date} plan={plan} />
          <Description text={plan.description} />
          {plan.checklist && <ChecklistView items={plan.checklist} date={day.date} preview />}
          {!plan.checklist && !plan.description && <p className="muted">Только имя? Это тоже план.</p>}
        </div>
        <div className="col-side">
          <section className="card">
            <h2 className="card-title">
              <Px name="clock" scale={2} /> До начала дня
            </h2>
            <p className="big-num">{duration(ov.nextDayInSec)}</p>
            <p className="muted">
              План можно править, пока день не начался. Потом он запечатается, и останется только отмечать пункты чеклиста.
            </p>
            <Button kind="paper" icon="pencil" onClick={() => setEditing(true)}>
              Изменить план
            </Button>
          </section>
          <section className="card note-card">
            <p>
              Назвать можно только завтрашний день: дальше загадывать не нужно. Утром напомню, как он называется.
            </p>
          </section>
        </div>
      </div>
      {stampText && <StampOverlay text={stampText} onDone={() => setStampText(null)} />}
    </div>
  );
}
