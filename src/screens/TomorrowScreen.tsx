import { useState } from "react";
import type { Nav } from "../App";
import { t } from "../i18n";
import { Button, StampOverlay } from "../ui/kit";
import { Px } from "../ui/Px";
import { duration } from "../util";
import { ChecklistView, DayHead, Description } from "./parts";
import { PlanWizard } from "./PlanWizard";

export function TomorrowScreen({ nav }: { nav: Nav }) {
  const { ov, go, refresh, patchDay } = nav;
  const day = ov.tomorrowDay;
  const [editing, setEditing] = useState(false);
  const [stampText, setStampText] = useState<string | null>(null);
  const carry = (ov.todayDay?.plan?.checklist ?? []).filter((i) => !i.done && !i.goal);

  if (!day?.plan || editing) {
    return (
      <div className="screen">
        <PlanWizard
          key={day?.plan ? "edit" : "new"}
          date={ov.tomorrow}
          mode="tomorrow"
          initial={day?.plan}
          carry={carry}
          carryDate={ov.today}
          onSaved={(d) => {
            const wasEdit = !!day?.plan;
            patchDay(d);
            setEditing(false);
            setStampText(wasEdit ? t("ИСПРАВЛЕНО", "UPDATED") : t("ЗАПИСАНО", "SAVED"));
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
          <DayHead label={t("Завтра", "Tomorrow")} date={day.date} plan={plan} />
          <Description text={plan.description} />
          {plan.checklist && (
            <ChecklistView
              items={plan.checklist}
              date={day.date}
              preview
              onOpenFrom={(date) => go({ name: "day", date })}
              onOpenGoal={(focus) => go({ name: "map", focus })}
            />
          )}
          {!plan.checklist && !plan.description && (
            <p className="muted">{t("Только имя? Это тоже план.", "Just a name? That's a plan too.")}</p>
          )}
        </div>
        <div className="col-side">
          {plan.auto && (
            <section className="card auto-card">
              <h2 className="card-title">
                <Px name="flag" scale={2} /> {t("План от целей", "Plan from goals")}
              </h2>
              <p>
                {t(
                  "Этот день составился сам из задач твоих целей. Назови его по-своему и добавь свои пункты, если хочешь: задачи целей останутся на месте.",
                  "This day was built from your goal tasks. Give it your own name and add items if you like: goal tasks stay in place.",
                )}
              </p>
              <Button kind="paper" icon="pencil" onClick={() => setEditing(true)}>
                {t("Назвать день", "Name the day")}
              </Button>
            </section>
          )}
          <section className="card">
            <h2 className="card-title">
              <Px name="clock" scale={2} /> {t("До начала дня", "Until the day starts")}
            </h2>
            <p className="big-num">{duration(ov.nextDayInSec)}</p>
            <p className="muted">
              {t(
                "План можно править, пока день не начался. Потом он запечатается, и останется только отмечать пункты чеклиста.",
                "You can edit the plan until the day starts. Then it gets sealed, and you can only tick off checklist items.",
              )}
            </p>
            <Button kind="paper" icon="pencil" onClick={() => setEditing(true)}>
              {t("Изменить план", "Edit plan")}
            </Button>
          </section>
          <section className="card note-card">
            <p>
              {t(
                "Назвать можно только завтрашний день: дальше загадывать не нужно. Утром напомню, как он называется.",
                "You can only name tomorrow: no need to plan further ahead. In the morning I'll remind you of its name.",
              )}
            </p>
          </section>
        </div>
      </div>
      {stampText && <StampOverlay text={stampText} onDone={() => setStampText(null)} />}
    </div>
  );
}
