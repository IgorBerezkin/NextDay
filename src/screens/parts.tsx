import { useState } from "react";
import { api, type CheckItem, type Day, type Plan } from "../api";
import { t } from "../i18n";
import { sfx } from "../sound";
import { Px, Face } from "../ui/Px";
import { AttachChip, Button, Check, Linkify, Modal, Progress, toast, toastError } from "../ui/kit";
import { dayMonth, hoursText, longDate, plural, RATING_LABELS, stamp } from "../util";
import { useTaskIndex, type TaskHit } from "./goalKit";

export function DayHead({ label, date, plan, children }: { label: string; date: string; plan: Plan; children?: React.ReactNode }) {
  return (
    <div className="day-head">
      <div className="day-date">
        <span className="day-label">{label}</span>
        <span>{longDate(date)}</span>
      </div>
      <h1 className="day-name">{t(`«${plan.name}»`, `"${plan.name}"`)}</h1>
      <div className="tags">
        {plan.late && (
          <span
            className="tag"
            title={t("День назвали в тот же день, а не накануне вечером", "The day was named that same day, not the evening before")}
          >
            {t("назван в тот же день", "named the same day")}
          </span>
        )}
        {plan.edits > 0 && <span className="tag">{t(`правок: ${plan.edits}`, `edits: ${plan.edits}`)}</span>}
        {children}
      </div>
    </div>
  );
}

export function Description({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <p className="desc">
      <Linkify text={text} />
    </p>
  );
}

function GoalChip({ hit, onOpen }: { hit: TaskHit; onOpen?: (focus: string) => void }) {
  return (
    <button
      className="cl-from cl-goal"
      disabled={!onOpen}
      onClick={() => onOpen?.(`${hit.goal.id}/${hit.topic.id}`)}
      title={t("Открыть тему на карте", "Open the topic on the map")}
    >
      <Px name="flag" scale={1} />
      <span>
        {t(
          <>
            цель «<Linkify inert text={hit.goal.title} />
            »: {hit.topic.title}
          </>,
          <>
            goal "<Linkify inert text={hit.goal.title} />
            ": {hit.topic.title}
          </>,
        )}
      </span>
    </button>
  );
}

export function ChecklistView({
  items,
  date,
  tickable,
  preview,
  onDay,
  onOpenFrom,
  onOpenGoal,
}: {
  items: CheckItem[];
  date: string;
  tickable?: boolean;
  preview?: boolean;
  onDay?: (d: Day) => void;
  onOpenFrom?: (date: string) => void;
  onOpenGoal?: (focus: string) => void;
}) {
  const goalTasks = useTaskIndex(items.some((i) => i.goal));
  const done = items.filter((i) => i.done).length;
  const hTotal = items.reduce((s, i) => s + (i.hours ?? 0), 0);
  const hDone = items.reduce((s, i) => s + (i.done ? (i.hours ?? 0) : 0), 0);
  const [flash, setFlash] = useState(false);

  const toggle = async (id: string, v: boolean) => {
    try {
      const d = await api.setCheck(date, id, v);
      onDay?.(d);
      if (v && d.plan?.checklist?.every((i) => i.done)) {
        sfx.allDone();
        setFlash(true);
        setTimeout(() => setFlash(false), 1200);
        toast(t("Весь чеклист выполнен!", "Whole checklist done!"), "good");
      }
    } catch (e) {
      toastError(e);
    }
  };

  if (items.length === 0) return null;
  return (
    <div className={`checklist${flash ? " flash" : ""}`}>
      <div className="cl-head">
        <span className="cl-title">{t("Чеклист", "Checklist")}</span>
        {preview ? (
          <span className="cl-stat">
            {plural(items.length, "пункт", "пункта", "пунктов", "item", "items")}
            {hTotal > 0 && <> · {t(`${hoursText(hTotal)} ч`, `${hoursText(hTotal)} h`)}</>}
          </span>
        ) : (
          <span className="cl-stat">
            {done}/{items.length}
            {hTotal > 0 && <> · {t(`${hoursText(hDone)} из ${hoursText(hTotal)} ч`, `${hoursText(hDone)} of ${hoursText(hTotal)} h`)}</>}
          </span>
        )}
      </div>
      {!preview && <Progress value={done / items.length} />}
      <ul className="cl-list">
        {items.map((it) => {
          const subs = it.subs ?? [];
          return (
            <li key={it.id} className={it.done ? "done" : ""}>
              {tickable ? <Check checked={it.done} onChange={(v) => void toggle(it.id, v)} /> : <Mark done={it.done} />}
              <div className="cl-body">
                <span className="cl-text">
                  {it.start != null && <span className="cl-start">{String(it.start).padStart(2, "0")}:00</span>}
                  <Linkify text={it.text} />
                </span>
                {it.from && (
                  <button
                    className="cl-from"
                    disabled={!onOpenFrom}
                    onClick={() => onOpenFrom?.(it.from!.date)}
                    title={t("Открыть день, где задача началась", "Open the day where the task started")}
                  >
                    <Px name="link" scale={1} />
                    <span>
                      {t(
                        <>
                          продолжает «<Linkify inert text={it.from.text} />
                          », {dayMonth(it.from.date)}
                        </>,
                        <>
                          continues "<Linkify inert text={it.from.text} />
                          ", {dayMonth(it.from.date)}
                        </>,
                      )}
                    </span>
                  </button>
                )}
                {it.goal && goalTasks.get(`${it.goal.goal}/${it.goal.task}`) && (
                  <GoalChip hit={goalTasks.get(`${it.goal.goal}/${it.goal.task}`)!} onOpen={onOpenGoal} />
                )}
                {it.attach && <AttachChip target={it.attach} />}
                {subs.length > 0 && (
                  <ul className="cl-subs">
                    {subs.map((s) => (
                      <li key={s.id} className={s.done ? "done" : ""}>
                        {tickable ? (
                          <Check small checked={s.done} onChange={(v) => void toggle(s.id, v)} />
                        ) : (
                          <Mark done={s.done} small />
                        )}
                        <span className="cl-text">
                          <Linkify text={s.text} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {subs.length > 0 && !preview && (
                <span className="cl-subcount">
                  {subs.filter((s) => s.done).length}/{subs.length}
                </span>
              )}
              {it.hours != null && <span className="cl-hours">{t(`${hoursText(it.hours)} ч`, `${hoursText(it.hours)} h`)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Mark({ done, small }: { done: boolean; small?: boolean }) {
  return (
    <span className={`cl-mark${done ? " on" : ""}${small ? " small" : ""}`}>
      {done && <Px name="check" scale={small ? 1 : 1.5} />}
    </span>
  );
}

export function SealDialog({ day, onClose, onSealed }: { day: Day; onClose: () => void; onSealed: (d: Day) => void }) {
  const [rating, setRating] = useState<number | null>(null);
  const [summary, setSummary] = useState("");
  const [cur, setCur] = useState(day);
  const [busy, setBusy] = useState(false);
  const plan = cur.plan!;

  const seal = async () => {
    if (!rating) return;
    setBusy(true);
    try {
      const d = await api.seal(day.date, rating, summary.trim() || null);
      sfx.seal();
      onSealed(d);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t("Запечатать день", "Seal the day")}
      onClose={onClose}
      wide
      footer={
        <>
          <Button kind="paper" onClick={onClose}>
            {t("Отмена", "Cancel")}
          </Button>
          <Button kind="green" icon="lock" disabled={!rating || busy} onClick={() => void seal()}>
            {t("Запечатать", "Seal")}
          </Button>
        </>
      }
    >
      <p className="seal-name">
        {t(`«${plan.name}»`, `"${plan.name}"`)} · {longDate(day.date)}
      </p>
      {plan.checklist && plan.checklist.length > 0 && (
        <div className="seal-section">
          <ChecklistView items={plan.checklist} date={day.date} tickable onDay={setCur} />
        </div>
      )}
      <div className="seal-section">
        <h3>{t("Как прошёл день?", "How was the day?")}</h3>
        <div className="faces">
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              className={`face-btn${rating === r ? " on" : ""}`}
              onClick={() => {
                sfx.pop();
                setRating(r);
              }}
            >
              <Face rating={r} scale={4} />
              <span>{RATING_LABELS[r]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="seal-section">
        <h3>
          {t("Главное одной фразой", "Summary in one sentence")} <span className="muted">{t("(можно пропустить)", "(optional)")}</span>
        </h3>
        <input
          className="field"
          value={summary}
          maxLength={200}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t(
            "Например: собрал три модели и разобрался с развёрткой",
            "For example: built three models and figured out UV unwrapping",
          )}
          onKeyDown={(e) => e.key === "Enter" && rating && void seal()}
        />
      </div>
      <p className="warn">
        <Px name="lock" scale={1.5} />{" "}
        {t(
          "После печати итоги и чеклист этого дня можно будет только смотреть.",
          "Once sealed, this day's results and checklist are view only.",
        )}
      </p>
    </Modal>
  );
}

export function SealInfo({ day }: { day: Day }) {
  const r = day.result;
  if (!r.sealed) return null;
  return (
    <div className="seal-info">
      {r.rating ? <Face rating={r.rating} scale={3} /> : <Px name="lock" scale={3} />}
      <div>
        <b>{r.rating ? RATING_LABELS[r.rating] : r.autoSealed ? t("Запечатан сам", "Auto-sealed") : t("Запечатан", "Sealed")}</b>
        {r.summary && (
          <p className="seal-summary">
            {t(
              <>
                «<Linkify text={r.summary} />»
              </>,
              <>
                "<Linkify text={r.summary} />"
              </>,
            )}
          </p>
        )}
        <p className="muted small">
          {r.autoSealed ? t("Срок итогов истёк ", "Results deadline passed ") : t("Печать ", "Sealed ")}
          {stamp(r.sealedAt)}
        </p>
      </div>
    </div>
  );
}
