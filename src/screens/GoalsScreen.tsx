import { useState } from "react";
import type { Nav } from "../App";
import { api, type Goal, type GoalInput, type GoalStatus } from "../api";
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
        <h1 className="screen-title">Цели</h1>
        {goals.length > 0 && (
          <Button icon="plus" onClick={() => setView({ mode: "edit" })}>
            Новая цель
          </Button>
        )}
      </div>
      {goals.length === 0 ? (
        <div className="empty goals-empty">
          <Px name="flag" scale={5} />
          <h2 className="empty-title">Целей пока нет</h2>
          <p>
            Цель это большой результат, разложенный на темы: что нужно уметь и в каком порядке. У каждой темы свои задачи, от простых к
            сложным. Пока цель идёт, Next Day сам ставит её задачи в план на завтра, сколько помещается в твоё время на день.
          </p>
          <p className="muted">
            Темы и задачи можно расписать самому на вкладке «Карта» или поручить ИИ: включи «ИИ через MCP» в настройках, и Claude составит
            карту по твоей истории. Его черновик появится здесь, останется только принять.
          </p>
          <div className="row">
            <Button icon="plus" onClick={() => setView({ mode: "edit" })}>
              Новая цель
            </Button>
            <Button kind="paper" icon="gear" onClick={() => go({ name: "settings" })}>
              Настройки ИИ
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
        {goal.author === "ai" && <span className="ai-chip">ИИ</span>}
      </span>
      {goal.outcome && (
        <span className="goal-outcome">
          <Linkify inert text={goal.outcome} />
        </span>
      )}
      <Progress value={p.tasksTotal ? p.tasksDone / p.tasksTotal : 0} />
      <span className="goal-meta">
        <span>
          темы {p.topicsDone} из {p.topicsTotal}
        </span>
        <span>
          задачи {p.tasksDone} из {p.tasksTotal}
        </span>
        {p.readiness != null && <span>готовность {p.readiness}%</span>}
        {left && <span>{left}</span>}
      </span>
      {finish && <span className={`goal-finish${finish.late ? " late" : ""}`}>{finish.text}</span>}
      {next && (
        <span className="goal-next">
          {next.date === today ? "Сегодня" : `${shortWeekday(next.date)}, ${dayMonth(next.date)}`}:{" "}
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
      if (s === "active") toast("Цель идёт: её задачи уже в плане на завтра.", "good");
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
          Все цели
        </Button>
        <span className="grow" />
        {goal.status === "draft" && (
          <Button kind="green" icon="check" disabled={busy} onClick={() => void status("active")}>
            Принять и начать
          </Button>
        )}
        {running && (
          <Button kind="paper" disabled={busy} onClick={() => void status("paused")}>
            Пауза
          </Button>
        )}
        {(goal.status === "paused" || goal.status === "done" || goal.status === "archived") && (
          <Button kind="paper" disabled={busy} onClick={() => void status("active")}>
            Продолжить
          </Button>
        )}
        {running && (
          <Button kind="paper" icon="star" disabled={busy} onClick={() => void status("done")}>
            Достигнута
          </Button>
        )}
        <Button kind="paper" icon="map" onClick={() => go({ name: "map", focus: goal.id })}>
          Карта
        </Button>
        <Button kind="paper" icon="pencil" onClick={onEdit}>
          Изменить
        </Button>
        {goal.status !== "archived" && goal.status !== "draft" && (
          <Button kind="ghost" disabled={busy} onClick={() => void status("archived")}>
            В архив
          </Button>
        )}
        {confirmDelete ? (
          <Button kind="danger" icon="trash" onClick={() => void remove()}>
            Точно удалить
          </Button>
        ) : (
          <Button kind="ghost" icon="trash" title="Удалить цель" onClick={() => setConfirmDelete(true)} />
        )}
      </div>

      <div className="cols">
        <div className="col-main">
          <h1 className="goal-title">
            <Px name="flag" scale={3} /> {goal.title}
            <span className={`goal-status s-${goal.status}`}>{GOAL_STATUS[goal.status]}</span>
            {goal.author === "ai" && <span className="ai-chip">план от ИИ</span>}
          </h1>
          {goal.status === "draft" && (
            <p className="goal-draft-note">
              Это черновик. Посмотри темы на карте, поправь, если нужно, и нажми «Принять и начать»: с этого момента Next Day сам ставит
              задачи цели в план на завтра.
            </p>
          )}
          {goal.outcome && (
            <p className="goal-outcome-big">
              <b>Итог:</b> <Linkify text={goal.outcome} />
            </p>
          )}
          {goal.topics.length === 0 ? (
            <div className="goal-empty-map">
              <p>В цели пока нет тем. Разложи её на темы и задачи на карте или попроси ИИ составить карту.</p>
              <Button kind="paper" icon="map" onClick={() => go({ name: "map", focus: goal.id })}>
                Открыть карту
              </Button>
            </div>
          ) : (
            <>
              {todayTasks.length > 0 && (
                <section className="plan-days">
                  <h2 className="route-title">Сегодня</h2>
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
                <h2 className="route-title">{running ? "Ближайшие дни" : "Если начать сейчас"}</h2>
                {goal.forecast.length === 0 ? (
                  <p className="muted">{p.tasksLeft ? "Оставшиеся задачи уже стоят в плане на сегодня." : "Все задачи сделаны."}</p>
                ) : (
                  goal.forecast.map((d) => (
                    <div className="plan-day" key={d.date}>
                      <div className="plan-day-head">
                        <b>{d.date === ov.tomorrow ? "Завтра" : `${shortWeekday(d.date)}, ${dayMonth(d.date)}`}</b>
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
                    План на завтра ставится сам и подстраивается, когда ты отмечаешь задачи, правишь карту или запечатываешь день. Чтобы
                    пропустить дни, поставь цель на паузу.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
        <div className="col-side">
          <section className="card">
            <h2 className="card-title">
              <Px name="flag" scale={2} /> Прогресс
            </h2>
            <Progress value={p.tasksTotal ? p.tasksDone / p.tasksTotal : 0} />
            <p>
              Темы: {p.topicsDone} из {p.topicsTotal}
              <br />
              Задачи: {p.tasksDone} из {p.tasksTotal}
              {p.minutesTotal > 0 && (
                <>
                  <br />
                  Время: {mins(p.minutesDone)} из {mins(p.minutesTotal)}
                </>
              )}
              {p.checksTotal > 0 && (
                <>
                  <br />
                  Проверки: {p.checksDone} из {p.checksTotal}
                </>
              )}
            </p>
            {p.readiness != null && <p className="readiness">Готовность по проверкам: {p.readiness}%</p>}
            {finish && <p className={`goal-finish${finish.late ? " late" : ""}`}>Прогноз: {finish.text}</p>}
          </section>
          <section className="card">
            <h2 className="card-title">
              <Px name="calendar" scale={2} /> Режим
            </h2>
            <p>
              В день: {mins(goal.minutesPerDay ?? 60)}
              <br />
              Дни: {goal.days.length === 0 || goal.days.length === 7 ? "каждый день" : goal.days.map((d) => WEEK[d - 1]).join(" ")}
              {goal.startHour != null && (
                <>
                  <br />
                  Начало: {hh(goal.startHour)}
                </>
              )}
              {left && (
                <>
                  <br />
                  Срок: {left}
                </>
              )}
            </p>
            {running && (
              <Button kind="paper" small icon="moon" onClick={() => go({ name: "tomorrow" })}>
                План на завтра
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
      toast("Дай цели название.", "error");
      return;
    }
    const h = parseHours(budget);
    if (h !== null && (isNaN(h) || h <= 0 || h > 16)) {
      toast("Время в день: число часов, например 2 или 1,5.", "error");
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
      <h1 className="screen-title">{goal ? "Изменить цель" : "Новая цель"}</h1>
      <div className="ge-grid">
        <label className="ge-field wide">
          <span>Название</span>
          <input
            className="field big"
            autoFocus
            maxLength={80}
            value={title}
            placeholder="Например: собеседование по ML"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="ge-field wide">
          <span>Итог: как понять, что цель достигнута</span>
          <textarea
            className="field area"
            rows={2}
            maxLength={600}
            value={outcome}
            placeholder="Например: сам решаю 3 задачи из 6 на пробном контесте за 6 часов"
            onChange={(e) => setOutcome(e.target.value)}
          />
        </label>
        <label className="ge-field">
          <span>Срок</span>
          <input className="field" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label className="ge-field">
          <span>Часов в день</span>
          <input className="field" maxLength={6} value={budget} placeholder="например 2" onChange={(e) => setBudget(e.target.value)} />
        </label>
        <label className="ge-field">
          <span>Начинать в</span>
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
          <span>Дни</span>
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
            {days.length === 0 ? "Ничего не выбрано: каждый день." : `${plural(days.length, "день", "дня", "дней")} в неделю.`}
          </span>
        </div>
        <label className="ge-field wide">
          <span>Заметка: уровень, материалы, ограничения</span>
          <textarea className="field area" rows={2} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {!goal && <p className="hint">Дальше откроется карта: там цель раскладывается на темы и задачи.</p>}
      <div className="wiz-foot">
        <Button kind="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <span className="grow" />
        <Button kind="green" icon="check" disabled={busy} onClick={() => void save()}>
          {goal ? "Сохранить" : "Дальше: карта"}
        </Button>
      </div>
    </div>
  );
}
