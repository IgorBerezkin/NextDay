import { useEffect, useState } from "react";
import { api, type TaskNode } from "../api";
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
    <Modal title="Какую задачу продолжает пункт?" onClose={onClose} wide>
      <input
        className="field search pick-search"
        autoFocus
        placeholder="Поиск по задачам и дням"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="pick-list">
        {list.map((t) => (
          <li key={`${t.date}/${t.id}`}>
            <button onClick={() => onPick(t)}>
              <Px name={t.done ? "check" : "box"} scale={1.5} />
              <span className="pick-text">
                <Linkify inert text={t.text} />
              </span>
              <span className="pick-day">
                {dayMonth(t.date)} · «{t.dayName}»
              </span>
            </button>
          </li>
        ))}
      </ul>
      {all && !list.length && <p className="muted">{needle ? "Ничего не нашлось." : "Раньше задач с чеклистом не было."}</p>}
    </Modal>
  );
}
