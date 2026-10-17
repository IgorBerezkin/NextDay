import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { api, type Goal, type GoalStatus, type GoalTask, type TaskKind, type Topic } from "../api";
import { t } from "../i18n";
import { toastError } from "../ui/kit";
import { dayMonth, duration, plural, toDate } from "../util";

export const GOAL_STATUS: Record<GoalStatus, string> = {
  draft: t("Черновик", "Draft"),
  active: t("Идёт", "Active"),
  paused: t("На паузе", "Paused"),
  done: t("Достигнута", "Achieved"),
  archived: t("В архиве", "Archived"),
};

export const KIND: Record<TaskKind, string> = {
  learn: t("Учёба", "Learn"),
  practice: t("Практика", "Practice"),
  review: t("Повторение", "Review"),
  check: t("Проверка", "Check"),
};
export const KINDS: TaskKind[] = ["learn", "practice", "review", "check"];
export const WEEK = t(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"], ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
export const HOURS = Array.from({ length: 24 }, (_, h) => h);
export const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
export const mins = (m: number) => duration(m * 60);

export function useGoals() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const load = useCallback(async () => {
    try {
      setGoals(await api.goals());
    } catch (e) {
      toastError(e);
    }
  }, []);
  useEffect(() => {
    void load();
    const un = listen("data-changed", () => void load());
    return () => void un.then((f) => f());
  }, [load]);
  const replace = useCallback(
    (g: Goal) => setGoals((gs) => (gs ? (gs.some((x) => x.id === g.id) ? gs.map((x) => (x.id === g.id ? g : x)) : [...gs, g]) : [g])),
    [],
  );
  const drop = useCallback((id: string) => setGoals((gs) => gs?.filter((g) => g.id !== id) ?? null), []);
  return { goals, load, replace, drop };
}

export type TaskHit = { goal: Goal; topic: Topic; task: GoalTask };

export function findTask(goal: Goal, taskId: string): TaskHit | null {
  for (const topic of goal.topics) {
    const task = topic.tasks.find((t) => t.id === taskId);
    if (task) return { goal, topic, task };
  }
  return null;
}

export function useTaskIndex(on: boolean) {
  const [index, setIndex] = useState<Map<string, TaskHit>>(new Map());
  useEffect(() => {
    if (!on) return;
    const load = () =>
      api.goals().then(
        (gs) => {
          const m = new Map<string, TaskHit>();
          for (const goal of gs)
            for (const topic of goal.topics) for (const task of topic.tasks) m.set(`${goal.id}/${task.id}`, { goal, topic, task });
          setIndex(m);
        },
        () => setIndex(new Map()),
      );
    void load();
    const un = listen("data-changed", () => void load());
    return () => void un.then((f) => f());
  }, [on]);
  return index;
}

export function daysLeft(deadline: string | null, today: string): string | null {
  if (!deadline) return null;
  const n = Math.round((toDate(deadline).getTime() - toDate(today).getTime()) / 86_400_000);
  if (n < 0) return t(`срок прошёл ${dayMonth(deadline)}`, `deadline passed on ${dayMonth(deadline)}`);
  if (n === 0) return t("срок сегодня", "due today");
  const left = plural(n, "день", "дня", "дней", "day", "days");
  return t(`до ${dayMonth(deadline)}, ${left}`, `until ${dayMonth(deadline)}, ${left}`);
}

export function finishText(goal: Goal): { text: string; late: boolean } | null {
  const p = goal.progress;
  if (p.tasksTotal === 0) return null;
  if (p.tasksLeft === 0) return { text: t("все задачи сделаны", "all tasks done"), late: false };
  if (!goal.finish)
    return { text: t("прогноз не сходится: часть тем закрыта навсегда", "can't finish: some topics never unlock"), late: true };
  const late = !!goal.deadline && goal.finish > goal.deadline;
  return {
    text: t(
      `${late ? "по прогнозу закончишь" : "закончишь"} к ${dayMonth(goal.finish)}`,
      `${late ? "at this rate you finish" : "you finish"} by ${dayMonth(goal.finish)}`,
    ),
    late,
  };
}

export function topicState(goal: Goal, topic: Topic): "done" | "going" | "open" | "locked" {
  const finished = (t: Topic) => t.tasks.every((k) => k.status === "done" || k.status === "skipped");
  if (topic.tasks.length > 0 && finished(topic)) return "done";
  const ready = topic.requires.every((r) => {
    const t = goal.topics.find((x) => x.id === r);
    return !t || finished(t);
  });
  if (topic.tasks.some((k) => k.status === "done" || k.status === "planned")) return "going";
  return ready ? "open" : "locked";
}

export function taskWhen(task: GoalTask, today: string, tomorrow: string): string {
  if (task.status === "done") return t("сделано", "done");
  if (task.status === "skipped") return t("пропущено", "skipped");
  if (task.status === "planned") {
    if (task.plannedFor === today) return t("сегодня", "today");
    if (task.plannedFor === tomorrow) return t("завтра", "tomorrow");
    return task.plannedFor
      ? t(`в плане на ${dayMonth(task.plannedFor)}`, `planned for ${dayMonth(task.plannedFor)}`)
      : t("в плане", "planned");
  }
  return "";
}
