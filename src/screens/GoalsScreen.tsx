import { useState } from "react";
import type { Nav } from "../App";
import { api, type Goal, type GoalInput, type GoalStatus } from "../api";
import { t } from "../i18n";
import { sfx } from "../sound";
import { Button, Linkify, Progress, toast, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { dayMonth, hoursText, parseHours, plural, shortWeekday } from "../util";
import { daysLeft, findTask, finishText, GOAL_STATUS, hh, HOURS, mins, useGoals, WEEK } from "./goalKit";

type View = { mode: "list" } | { mode: "goal"; id: string } | { mode: "edit"; id?: string };

export function GoalsScreen({ nav, focus }: { nav: Nav; focus?: string }) {
  const { ov, go } = nav;
  const { goals, replace, drop } = useGoals();
  const [view, setView] = useState<View>(focus ? { mode: "goal", id: focus } : { mode: "list" });

  if (!goals) return <div className="screen goals-screen" />;

  const changed = (g: Goal) => {
    replace(g);
    void nav.refresh();
  };

  if (view.mode === "edit") {
    const goal = view.id ? goals.find((g) => g.id === view.id) : undefined;
    return (
      <div className="screen goals-screen">
        <GoalEditor
          goal={goal}
          onCancel={() => setView(goal ? { mode: "goal", id: goal.id } : { mode: "list" })}
          onSaved={(g) => {
            changed(g);
            if (goal) setView({ mode: "goal", id: g.id });
            else go({ name: "map", focus: g.id });
          }}
        />
      </div>
    );
  }

  if (view.mode === "goal") {
    const goal = goals.find((g) => g.id === view.id);
    if (goal)
      return (
        <div className="screen goals-screen">
          <GoalDetail
            goal={goal}
            nav={nav}
            onBack={() => setView({ mode: "list" })}
            onEdit={() => setView({ mode: "edit", id: goal.id })}
            onChanged={changed}
            onDeleted={() => {
              drop(goal.id);
              void nav.refresh();
              setView({ mode: "list" });
            }}
          />
        </div>
      );
  }

  return (
    <div className="screen goals-screen">
      <div className="goals-head">
        <h1 className="screen-title">{t("Цели", "Goals")}</h1>
        {goals.length > 0 && (
          <Button icon="plus" onClick={() => setView({ mode: "edit" })}>
            {t("Новая цель", "New goal")}
          </Button>
        )}
      </div>
      {goals.length === 0 ? (
        <div className="empty goals-empty">
          <Px name="flag" scale={5} />
          <h2 className="empty-title">{t("Целей пока нет", "No goals yet")}</h2>
          <p>
            {t(
              <>
                Цель это большой результат, разложенный на темы: что нужно уметь и в каком порядке. У каждой темы свои задачи, от простых к
                сложным. Пока цель идёт, Next Day сам ставит её задачи в план на завтра, сколько помещается в твоё время на день.
              </>,
              <>
                A goal is a big result broken into topics: what you need to master and in what order. Each topic has its own tasks, from
                simple to hard. While a goal is active, Next Day adds its tasks to your plan for tomorrow on its own, as many as fit into
                your daily time.
              </>,
            )}
          </p>
          <p className="muted">
            {t(
              <>
                Темы и задачи можно расписать самому на вкладке «Карта» или поручить ИИ: включи «ИИ через MCP» в настройках, и Claude
                составит карту по твоей истории. Его черновик появится здесь, останется только принять.
              </>,
              <>
                You can lay out topics and tasks yourself on the "Map" tab or hand them to AI: turn on "AI over MCP" in Settings, and Claude
                will build a map from your history. Its draft appears here for you to accept.
              </>,
            )}
          </p>
          <div className="row">
            <Button icon="plus" onClick={() => setView({ mode: "edit" })}>
              {t("Новая цель", "New goal")}
            </Button>
            <Button kind="paper" icon="gear" onClick={() => go({ name: "settings" })}>
              {t("Настройки ИИ", "AI settings")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="goals-list">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} today={ov.today} onOpen={() => setView({ mode: "goal", id: g.id })} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal, today, onOpen }: { goal: Goal; today: string; onOpen: () => void }) {
  const p = goal.progress;
  const left = daysLeft(goal.deadline, today);
  const finish = finishText(goal);
  const next = goal.status === "active" ? goal.forecast[0] : undefined;
  return (
    <button className={`goal-card status-${goal.status}`} onClick={onOpen}>
      <span className="goal-card-top">
        <Px name="flag" scale={2} />
        <b>{goal.title}</b>
        <span className={`goal-status s-${goal.status}`}>{GOAL_STATUS[goal.status]}</span>
        {goal.author === "ai" && <span className="ai-chip">{t("ИИ", "AI")}</span>}
      </span>
      {goal.outcome && (
        <span className="goal-outcome">
          <Linkify inert text={goal.outcome} />
        </span>
      )}
      <Progress value={p.tasksTotal ? p.tasksDone / p.tasksTotal : 0} />
      <span className="goal-meta">
        <span>{t(`темы ${p.topicsDone} из ${p.topicsTotal}`, `${p.topicsDone} of ${p.topicsTotal} topics`)}</span>
        <span>{t(`задачи ${p.tasksDone} из ${p.tasksTotal}`, `${p.tasksDone} of ${p.tasksTotal} tasks`)}</span>
        {p.readiness != null && <span>{t(`готовность ${p.readiness}%`, `readiness ${p.readiness}%`)}</span>}
        {left && <span>{left}</span>}
      </span>
      {finish && <span className={`goal-finish${finish.late ? " late" : ""}`}>{finish.text}</span>}
      {next && (
        <span className="goal-next">
          {next.date === today ? t("Сегодня", "Today") : `${shortWeekday(next.date)}, ${dayMonth(next.date)}`}:{" "}
          {next.tasks
            .map((id) => findTask(goal, id)?.task.text)
            .filter(Boolean)
            .join(", ")}
        </span>
      )}
    </button>
  );
}

function GoalDetail({
  goal,
  nav,
  onBack,
  onEdit,
  onChanged,
  onDeleted,
}: {
  goal: Goal;
  nav: Nav;
  onBack: () => void;
  onEdit: () => void;
  onChanged: (g: Goal) => void;
  onDeleted: () => void;
}) {
  const { ov, go } = nav;
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const p = goal.progress;
  const left = daysLeft(goal.deadline, ov.today);
  const finish = finishText(goal);
  const todayTasks = goal.topics.flatMap((t) => t.tasks.filter((k) => k.plannedFor === ov.today).map((k) => ({ topic: t, task: k })));
  const running = goal.status === "active";

  const status = async (s: GoalStatus) => {
    setBusy(true);
    try {
      onChanged(await api.setGoalStatus(goal.id, s));
      sfx.save();
      if (s === "active")
        toast(
          t("Цель идёт: её задачи уже в плане на завтра.", "The goal is active: its tasks are already in your plan for tomorrow."),
          "good",
        );
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  };

  const remove = async () => {
    try {
      await api.deleteGoal(goal.id);
      onDeleted();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="goal-detail">
      <div className="goal-detail-head">
        <Button kind="ghost" icon="arrowL" onClick={onBack}>
          {t("Все цели", "All goals")}
        </Button>
        <span className="grow" />
        {goal.status === "draft" && (
          <Button kind="green" icon="check" disabled={busy} onClick={() => void status("active")}>
            {t("Принять и начать", "Accept and start")}
          </Button>
        )}
        {running && (
          <Button kind="paper" disabled={busy} onClick={() => void status("paused")}>
            {t("Пауза", "Pause")}
          </Button>
        )}
        {(goal.status === "paused" || goal.status === "done" || goal.status === "archived") && (
          <Button kind="paper" disabled={busy} onClick={() => void status("active")}>
            {t("Продолжить", "Resume")}
          </Button>
        )}
        {running && (
          <Button kind="paper" icon="star" disabled={busy} onClick={() => void status("done")}>
            {t("Достигнута", "Achieved")}
          </Button>
        )}
        <Button kind="paper" icon="map" onClick={() => go({ name: "map", focus: goal.id })}>
          {t("Карта", "Map")}
        </Button>
        <Button kind="paper" icon="pencil" onClick={onEdit}>
          {t("Изменить", "Edit")}
        </Button>
        {goal.status !== "archived" && goal.status !== "draft" && (
          <Button kind="ghost" disabled={busy} onClick={() => void status("archived")}>
            {t("В архив", "Archive")}
          </Button>
        )}
        {confirmDelete ? (
          <Button kind="danger" icon="trash" onClick={() => void remove()}>
            {t("Точно удалить", "Really delete")}
          </Button>
        ) : (
          <Button kind="ghost" icon="trash" title={t("Удалить цель", "Delete goal")} onClick={() => setConfirmDelete(true)} />
        )}
      </div>

      <div className="cols">
        <div className="col-main">
          <h1 className="goal-title">
            <Px name="flag" scale={3} /> {goal.title}
            <span className={`goal-status s-${goal.status}`}>{GOAL_STATUS[goal.status]}</span>
            {goal.author === "ai" && <span className="ai-chip">{t("план от ИИ", "plan by AI")}</span>}
          </h1>
          {goal.status === "draft" && (
            <p className="goal-draft-note">
              {t(
                <>
                  Это черновик. Посмотри темы на карте, поправь, если нужно, и нажми «Принять и начать»: с этого момента Next Day сам ставит
                  задачи цели в план на завтра.
                </>,
                <>
                  This is a draft. Look over the topics on the map, fix them if needed, and press "Accept and start": from then on Next Day
                  adds the goal's tasks to your plan for tomorrow on its own.
                </>,
              )}
            </p>
          )}
          {goal.outcome && (
            <p className="goal-outcome-big">
              <b>{t("Итог:", "Outcome:")}</b> <Linkify text={goal.outcome} />
            </p>
          )}
          {goal.topics.length === 0 ? (
            <div className="goal-empty-map">
              <p>
                {t(
                  "В цели пока нет тем. Разложи её на темы и задачи на карте или попроси ИИ составить карту.",
                  "This goal has no topics yet. Break it into topics and tasks on the map or ask AI to build the map.",
                )}
              </p>
              <Button kind="paper" icon="map" onClick={() => go({ name: "map", focus: goal.id })}>
                {t("Открыть карту", "Open map")}
              </Button>
            </div>
          ) : (
            <>
              {todayTasks.length > 0 && (
                <section className="plan-days">
                  <h2 className="route-title">{t("Сегодня", "Today")}</h2>
                  <ul className="day-tasks">
                    {todayTasks.map(({ topic, task }) => (
                      <li key={task.id} className={task.status === "done" ? "done" : ""}>
                        <span className={`cl-mark${task.status === "done" ? " on" : ""}`}>
                          {task.status === "done" && <Px name="check" scale={1} />}
                        </span>
                        <span className="day-topic">{topic.title}:</span> <Linkify inert text={task.text} />
                        {task.minutes != null && <span className="cl-hours">{mins(task.minutes)}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section className="plan-days">
                <h2 className="route-title">{running ? t("Ближайшие дни", "Coming days") : t("Если начать сейчас", "If you start now")}</h2>
                {goal.forecast.length === 0 ? (
                  <p className="muted">
                    {p.tasksLeft
                      ? t("Оставшиеся задачи уже стоят в плане на сегодня.", "The remaining tasks are already in today's plan.")
                      : t("Все задачи сделаны.", "All tasks are done.")}
                  </p>
                ) : (
                  goal.forecast.map((d) => (
                    <div className="plan-day" key={d.date}>
                      <div className="plan-day-head">
                        <b>{d.date === ov.tomorrow ? t("Завтра", "Tomorrow") : `${shortWeekday(d.date)}, ${dayMonth(d.date)}`}</b>
                        {d.minutes > 0 && <span className="muted">{mins(d.minutes)}</span>}
                      </div>
                      <ul className="day-tasks">
                        {d.tasks.map((id) => {
                          const hit = findTask(goal, id);
                          if (!hit) return null;
                          return (
                            <li key={id}>
                              <span className="day-topic">{hit.topic.title}:</span> <Linkify inert text={hit.task.text} />
                              {hit.task.minutes != null && <span className="cl-hours">{mins(hit.task.minutes)}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
                )}
                {running && (
                  <p className="hint">
                    {t(
                      <>
                        План на завтра ставится сам и подстраивается, когда ты отмечаешь задачи, правишь карту или запечатываешь день. Чтобы
                        пропустить дни, поставь цель на паузу.
                      </>,
                      <>
                        The plan for tomorrow fills in by itself and adjusts when you check off tasks, edit the map or seal the day. To skip
                        days, pause the goal.
                      </>,
                    )}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
        <div className="col-side">
          <section className="card">
            <h2 className="card-title">
              <Px name="flag" scale={2} /> {t("Прогресс", "Progress")}
            </h2>
            <Progress value={p.tasksTotal ? p.tasksDone / p.tasksTotal : 0} />
            <p>
              {t(`Темы: ${p.topicsDone} из ${p.topicsTotal}`, `Topics: ${p.topicsDone} of ${p.topicsTotal}`)}
              <br />
              {t(`Задачи: ${p.tasksDone} из ${p.tasksTotal}`, `Tasks: ${p.tasksDone} of ${p.tasksTotal}`)}
              {p.minutesTotal > 0 && (
                <>
                  <br />
                  {t(`Время: ${mins(p.minutesDone)} из ${mins(p.minutesTotal)}`, `Time: ${mins(p.minutesDone)} of ${mins(p.minutesTotal)}`)}
                </>
              )}
              {p.checksTotal > 0 && (
                <>
                  <br />
                  {t(`Проверки: ${p.checksDone} из ${p.checksTotal}`, `Checks: ${p.checksDone} of ${p.checksTotal}`)}
                </>
              )}
            </p>
            {p.readiness != null && (
              <p className="readiness">{t(`Готовность по проверкам: ${p.readiness}%`, `Readiness from checks: ${p.readiness}%`)}</p>
            )}
            {finish && (
              <p className={`goal-finish${finish.late ? " late" : ""}`}>
                {t("Прогноз:", "Forecast:")} {finish.text}
              </p>
            )}
          </section>
          <section className="card">
            <h2 className="card-title">
              <Px name="calendar" scale={2} /> {t("Режим", "Schedule")}
            </h2>
            <p>
              {t("В день:", "Per day:")} {mins(goal.minutesPerDay ?? 60)}
              <br />
              {t("Дни:", "Days:")}{" "}
              {goal.days.length === 0 || goal.days.length === 7
                ? t("каждый день", "every day")
                : goal.days.map((d) => WEEK[d - 1]).join(" ")}
              {goal.startHour != null && (
                <>
                  <br />
                  {t("Начало:", "Start:")} {hh(goal.startHour)}
                </>
              )}
              {left && (
                <>
                  <br />
                  {t("Срок:", "Deadline:")} {left}
                </>
              )}
            </p>
            {running && (
              <Button kind="paper" small icon="moon" onClick={() => go({ name: "tomorrow" })}>
                {t("План на завтра", "Plan for tomorrow")}
              </Button>
            )}
          </section>
          {goal.note && (
            <section className="card note-card">
              <p>
                <Linkify text={goal.note} />
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function GoalEditor({ goal, onCancel, onSaved }: { goal?: Goal; onCancel: () => void; onSaved: (g: Goal) => void }) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [outcome, setOutcome] = useState(goal?.outcome ?? "");
  const [note, setNote] = useState(goal?.note ?? "");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [budget, setBudget] = useState(goal?.minutesPerDay ? hoursText(goal.minutesPerDay / 60) : "1");
  const [days, setDays] = useState<number[]>(goal?.days ?? []);
  const [startHour, setStartHour] = useState<number | null>(goal?.startHour ?? 18);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      toast(t("Дай цели название.", "Give the goal a name."), "error");
      return;
    }
    const h = parseHours(budget);
    if (h !== null && (isNaN(h) || h <= 0 || h > 16)) {
      toast(t("Время в день: число часов, например 2 или 1,5.", "Time per day: a number of hours, like 2 or 1.5."), "error");
      return;
    }
    const input: GoalInput = {
      id: goal?.id,
      title: title.trim(),
      outcome: outcome.trim(),
      note: note.trim(),
      deadline: deadline || null,
      minutesPerDay: h === null ? null : Math.round(h * 60),
      days,
      startHour,
      topics: [],
    };
    setBusy(true);
    try {
      onSaved(await api.saveGoal(input));
      sfx.save();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  return (
    <div className="goal-editor">
      <h1 className="screen-title">{goal ? t("Изменить цель", "Edit goal") : t("Новая цель", "New goal")}</h1>
      <div className="ge-grid">
        <label className="ge-field wide">
          <span>{t("Название", "Name")}</span>
          <input
            className="field big"
            autoFocus
            maxLength={80}
            value={title}
            placeholder={t("Например: собеседование по ML", "For example: ML interview")}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="ge-field wide">
          <span>{t("Итог: как понять, что цель достигнута", "Outcome: how you know the goal is achieved")}</span>
          <textarea
            className="field area"
            rows={2}
            maxLength={600}
            value={outcome}
            placeholder={t(
              "Например: сам решаю 3 задачи из 6 на пробном контесте за 6 часов",
              "For example: I solve 3 of 6 problems on my own in a 6-hour mock contest",
            )}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </label>
        <label className="ge-field">
          <span>{t("Срок", "Deadline")}</span>
          <input className="field" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label className="ge-field">
          <span>{t("Часов в день", "Hours per day")}</span>
          <input
            className="field"
            maxLength={6}
            value={budget}
            placeholder={t("например 2", "e.g. 2")}
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
        <label className="ge-field">
          <span>{t("Начинать в", "Start at")}</span>
          <select
            className="field select"
            value={startHour ?? ""}
            onChange={(e) => setStartHour(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">--:--</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hh(h)}
              </option>
            ))}
          </select>
        </label>
        <div className="ge-field">
          <span>{t("Дни", "Days")}</span>
          <div className="ge-days">
            {WEEK.map((w, i) => {
              const d = i + 1;
              return (
                <button
                  key={w}
                  className={`day-toggle${days.includes(d) ? " on" : ""}`}
                  onClick={() => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort((a, b) => a - b)))}
                >
                  {w}
                </button>
              );
            })}
          </div>
          <span className="hint">
            {days.length === 0
              ? t("Ничего не выбрано: каждый день.", "Nothing picked: every day.")
              : `${plural(days.length, "день", "дня", "дней", "day", "days")} ${t("в неделю.", "a week.")}`}
          </span>
        </div>
        <label className="ge-field wide">
          <span>{t("Заметка: уровень, материалы, ограничения", "Note: level, materials, limits")}</span>
          <textarea className="field area" rows={2} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {!goal && (
        <p className="hint">
          {t(
            "Дальше откроется карта: там цель раскладывается на темы и задачи.",
            "Next, the map opens: there you break the goal into topics and tasks.",
          )}
        </p>
      )}
      <div className="wiz-foot">
        <Button kind="ghost" onClick={onCancel}>
          {t("Отмена", "Cancel")}
        </Button>
        <span className="grow" />
        <Button kind="green" icon="check" disabled={busy} onClick={() => void save()}>
          {goal ? t("Сохранить", "Save") : t("Дальше: карта", "Next: map")}
        </Button>
      </div>
    </div>
  );
}
