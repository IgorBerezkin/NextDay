import { useEffect, useState } from "react";
import { api, type TaskNode } from "../api";
import { t } from "../i18n";
import { Linkify, Modal, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { dayMonth } from "../util";

export function TaskPicker({ before, onPick, onClose }: { before: string; onPick: (t: TaskNode) => void; onClose: () => void }) {
  const [all, setAll] = useState<TaskNode[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.tasks().then(setAll).catch(toastError);
  }, []);

  const needle = q.trim().toLowerCase();
  const list = (all ?? [])
    .filter((t) => t.date < before)
    .filter((t) => !needle || `${t.text} ${t.dayName}`.toLowerCase().includes(needle))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 100);

  return (
    <Modal title={t("Какую задачу продолжает пункт?", "Which task does this item continue?")} onClose={onClose} wide>
      <input
        className="field search pick-search"
        autoFocus
        placeholder={t("Поиск по задачам и дням", "Search tasks and days")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="pick-list">
        {list.map((task) => (
          <li key={`${task.date}/${task.id}`}>
            <button onClick={() => onPick(task)}>
              <Px name={task.done ? "check" : "box"} scale={1.5} />
              <span className="pick-text">
                <Linkify inert text={task.text} />
              </span>
              <span className="pick-day">
                {t(`${dayMonth(task.date)} · «${task.dayName}»`, `${dayMonth(task.date)} · "${task.dayName}"`)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {all && !list.length && (
        <p className="muted">
          {needle ? t("Ничего не нашлось.", "Nothing found.") : t("Раньше задач с чеклистом не было.", "No earlier checklist tasks.")}
        </p>
      )}
    </Modal>
  );
}
