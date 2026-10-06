import { useState } from "react";
import { api, type CheckItem, type Day, type Plan } from "../api";
import { sfx } from "../sound";
import { Px, Face } from "../ui/Px";
import { AttachChip, Button, Check, Linkify, Modal, Progress, toast, toastError } from "../ui/kit";
import { hoursText, longDate, plural, RATING_LABELS, stamp } from "../util";

export function DayHead({ label, date, plan, children }: { label: string; date: string; plan: Plan; children?: React.ReactNode }) {
  return (
    <div className="day-head">
      <div className="day-date">
        <span className="day-label">{label}</span>
        <span>{longDate(date)}</span>
      </div>
      <h1 className="day-name">«{plan.name}»</h1>
      <div className="tags">
        {plan.late && (
          <span className="tag" title="День назвали в тот же день, а не накануне вечером">
            назван в тот же день
          </span>
        )}
        {plan.edits > 0 && <span className="tag">правок: {plan.edits}</span>}
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

export function ChecklistView({
  items,
  date,
  tickable,
  preview,
  onDay,
}: {
  items: CheckItem[];
  date: string;
  tickable?: boolean;
  preview?: boolean;
  onDay?: (d: Day) => void;
}) {
  const done = items.filter((i) => i.done).length;
  const hTotal = items.reduce((s, i) => s + (i.hours ?? 0), 0);
  const hDone = items.reduce((s, i) => s + (i.done ? (i.hours ?? 0) : 0), 0);
  const [flash, setFlash] = useState(false);

  const toggle = async (it: CheckItem, v: boolean) => {
    try {
      const d = await api.setCheck(date, it.id, v);
      onDay?.(d);
      if (v && d.plan?.checklist?.every((i) => i.done)) {
        sfx.allDone();
        setFlash(true);
        setTimeout(() => setFlash(false), 1200);
        toast("Весь чеклист выполнен!", "good");
      }
    } catch (e) {
      toastError(e);
    }
  };

  if (items.length === 0) return null;
  return (
    <div className={`checklist${flash ? " flash" : ""}`}>
      <div className="cl-head">
        <span className="cl-title">Чеклист</span>
        {preview ? (
          <span className="cl-stat">
            {plural(items.length, "пункт", "пункта", "пунктов")}
            {hTotal > 0 && <> · {hoursText(hTotal)} ч</>}
          </span>
        ) : (
          <span className="cl-stat">
            {done}/{items.length}
            {hTotal > 0 && (
              <>
                {" "}
                · {hoursText(hDone)} из {hoursText(hTotal)} ч
              </>
            )}
          </span>
        )}
      </div>
      {!preview && <Progress value={done / items.length} />}
      <ul className="cl-list">
        {items.map((it) => (
          <li key={it.id} className={it.done ? "done" : ""}>
            {tickable ? (
              <Check checked={it.done} onChange={(v) => void toggle(it, v)} />
            ) : (
              <span className={`cl-mark${it.done ? " on" : ""}`}>{it.done && <Px name="check" scale={1.5} />}</span>
            )}
            <div className="cl-body">
              <span className="cl-text">
                <Linkify text={it.text} />
              </span>
              {it.attach && <AttachChip target={it.attach} />}
            </div>
            {it.hours != null && <span className="cl-hours">{hoursText(it.hours)} ч</span>}
          </li>
        ))}
      </ul>
    </div>
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
      title="Запечатать день"
      onClose={onClose}
      wide
      footer={
        <>
          <Button kind="paper" onClick={onClose}>
            Отмена
          </Button>
          <Button kind="green" icon="lock" disabled={!rating || busy} onClick={() => void seal()}>
            Запечатать
          </Button>
        </>
      }
    >
      <p className="seal-name">
        «{plan.name}» · {longDate(day.date)}
      </p>
      {plan.checklist && plan.checklist.length > 0 && (
        <div className="seal-section">
          <ChecklistView items={plan.checklist} date={day.date} tickable onDay={setCur} />
        </div>
      )}
      <div className="seal-section">
        <h3>Как прошёл день?</h3>
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
          Главное одной фразой <span className="muted">(можно пропустить)</span>
        </h3>
        <input
          className="field"
          value={summary}
          maxLength={200}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Например: собрал три модели и разобрался с развёрткой"
          onKeyDown={(e) => e.key === "Enter" && rating && void seal()}
        />
      </div>
      <p className="warn">
        <Px name="lock" scale={1.5} /> После печати итоги и чеклист этого дня можно будет только смотреть.
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
        <b>{r.rating ? RATING_LABELS[r.rating] : r.autoSealed ? "Запечатан сам" : "Запечатан"}</b>
        {r.summary && <p className="seal-summary">«{r.summary}»</p>}
        <p className="muted small">
          {r.autoSealed ? "Срок итогов истёк " : "Печать "}
          {stamp(r.sealedAt)}
        </p>
      </div>
    </div>
  );
}
