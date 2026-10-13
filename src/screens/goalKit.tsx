import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { api, type Goal, type GoalStatus, type GoalTask, type TaskKind, type Topic } from "../api";
import { toastError } from "../ui/kit";
import { dayMonth, duration, plural, toDate } from "../util";

export const GOAL_STATUS: Record<GoalStatus, string> = {
  draft: "Черновик",
  active: "Идёт",
  paused: "На паузе",
  done: "Достигнута",
  archived: "В архиве",
};

export const KIND: Record<TaskKind, string> = { learn: "Учёба", practice: "Практика", review: "Повторение", check: "Проверка" };
export const KINDS: TaskKind[] = ["learn", "practice", "review", "check"];
export const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
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
  if (n < 0) return `срок прошёл ${dayMonth(deadline)}`;
  if (n === 0) return "срок сегодня";
  return `до ${dayMonth(deadline)}, ${plural(n, "день", "дня", "дней")}`;
}

export function finishText(goal: Goal): { text: string; late: boolean } | null {
  const p = goal.progress;
  if (p.tasksTotal === 0) return null;
  if (p.tasksLeft === 0) return { text: "все задачи сделаны", late: false };
  if (!goal.finish) return { text: "прогноз не сходится: часть тем закрыта навсегда", late: true };
  const late = !!goal.deadline && goal.finish > goal.deadline;
  return { text: `${late ? "по прогнозу закончишь" : "закончишь"} к ${dayMonth(goal.finish)}`, late };
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
  if (task.status === "done") return "сделано";
  if (task.status === "skipped") return "пропущено";
  if (task.status === "planned") {
    if (task.plannedFor === today) return "сегодня";
    if (task.plannedFor === tomorrow) return "завтра";
    return task.plannedFor ? `в плане на ${dayMonth(task.plannedFor)}` : "в плане";
  }
  return "";
}
