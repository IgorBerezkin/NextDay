import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type CheckItem, type Day, type Plan, type PlanInput } from "../api";
import { sfx } from "../sound";
import { AttachChip, Button, Check, toast, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { hoursText, longDate, NAME_EXAMPLES, parseHours, uid } from "../util";

type Row = { key: string; id?: string; text: string; hours: string; attach: string | null };

const toRow = (i: CheckItem): Row => ({
  key: uid(),
  id: i.id,
  text: i.text,
  hours: i.hours != null ? hoursText(i.hours) : "",
  attach: i.attach,
});

const okHours = (s: string) => {
  const h = parseHours(s);
  return h !== null && !isNaN(h) && h > 0 && h <= 24 ? h : null;
};

const STEPS = ["Имя", "Описание", "Чеклист"];

type Draft = { step: number; name: string; desc: string; need: boolean; rows: Row[] };
const draftKey = (date: string) => `nd.draft.${date}`;

function loadDraft(date: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(date));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function clearDraft(date: string) {
  try {
    localStorage.removeItem(draftKey(date));
  } catch {}
}

export function PlanWizard({
  date,
  mode,
  initial,
  carry = [],
  onSaved,
  onCancel,
}: {
  date: string;
  mode: "tomorrow" | "today";
  initial?: Plan | null;
  carry?: CheckItem[];
  onSaved: (d: Day) => void;
  onCancel?: () => void;
}) {
  const [draft] = useState(() => (initial ? null : loadDraft(date)));
  const [step, setStep] = useState(draft?.step ?? 0);
  const [name, setName] = useState(initial?.name ?? draft?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? draft?.desc ?? "");
  const [need, setNeed] = useState(initial ? !!initial.checklist : (draft?.need ?? false));
  const [rows, setRows] = useState<Row[]>(() => initial?.checklist?.map(toRow) ?? draft?.rows ?? []);
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const example = useMemo(() => NAME_EXAMPLES[Math.floor(Math.random() * NAME_EXAMPLES.length)], []);

  useEffect(() => {
    if (initial) return;
    try {
      if (name || desc || rows.length) localStorage.setItem(draftKey(date), JSON.stringify({ step, name, desc, need, rows }));
    } catch {}
  }, [initial, date, step, name, desc, need, rows]);

  useEffect(() => {
    if (!focusKey) return;
    const el = inputs.current.get(focusKey);
    if (el) {
      el.focus();
      setFocusKey(null);
    }
  }, [focusKey, rows]);

  const canNext = name.trim().length > 0;
  const next = () => {
    if (!canNext) return;
    sfx.step();
    setStep((s) => Math.min(2, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const addRow = (after?: number, from?: Partial<Row>) => {
    const r: Row = { key: uid(), text: "", hours: "", attach: null, ...from };
    setRows((rs) => {
      const c = [...rs];
      c.splice(after === undefined ? c.length : after + 1, 0, r);
      return c;
    });
    if (!from?.text) setFocusKey(r.key);
  };
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const move = (i: number, d: number) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const c = [...rs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const parsed = rows.map((r) => parseHours(r.hours));
  const badHours = rows.some((r, i) => r.text.trim() && parsed[i] !== null && okHours(r.hours) === null);
  const total = rows.reduce((s, r) => s + (r.text.trim() ? (okHours(r.hours) ?? 0) : 0), 0);
  const carryLeft = carry.filter((c) => !rows.some((r) => r.text.trim() === c.text.trim()));

  const save = async () => {
    if (!canNext) {
      setStep(0);
      return;
    }
    if (need && badHours) {
      toast("Проверьте часы: число от 0,25 до 24, например 1,5 или 90м.", "error");
      return;
    }
    const input: PlanInput = {
      name: name.trim(),
      description: desc.trim(),
      checklist: need
        ? rows
            .filter((r) => r.text.trim())
            .map((r) => ({ id: r.id, text: r.text.trim(), hours: okHours(r.hours), attach: r.attach }))
        : null,
    };
    setBusy(true);
    try {
      const d = await api.savePlan(date, input);
      clearDraft(date);
      sfx.save();
      onSaved(d);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  const pickFile = async (key: string) => {
    try {
      const f = await open({ multiple: false, directory: false, title: "Файл для пункта" });
      if (typeof f === "string") update(key, { attach: f });
    } catch (e) {
      toastError(e);
    }
  };

  const itemKey = (e: React.KeyboardEvent<HTMLInputElement>, r: Row, i: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.ctrlKey) void save();
      else addRow(i);
    } else if (e.key === "Backspace" && r.text === "" && rows.length > 1) {
      e.preventDefault();
      const prev = rows[i - 1] ?? rows[i + 1];
      remove(r.key);
      if (prev) setFocusKey(prev.key);
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      move(i, e.key === "ArrowUp" ? -1 : 1);
      setFocusKey(r.key);
    }
  };

  const whichDay = mode === "tomorrow" ? "завтрашний" : "сегодняшний";

  return (
    <div className="wizard">
      <div className="wiz-top">
        <div className="wiz-steps">
          {STEPS.map((s, i) => (
            <button
              key={s}
              className={`wiz-step${i === step ? " on" : ""}${i < step ? " done" : ""}`}
              disabled={i > 0 && !canNext}
              onClick={() => setStep(i)}
            >
              <i>{i < step ? <Px name="check" scale={1} /> : i + 1}</i>
              {s}
            </button>
          ))}
        </div>
        <div className="wiz-date">
          <span className="day-label">{mode === "tomorrow" ? "Завтра" : "Сегодня"}</span>
          <span>{longDate(date)}</span>
        </div>
      </div>

      {step === 0 && (
        <div className="wiz-body" key="s0">
          <h1 className="q">Как назовём {whichDay} день?</h1>
          <input
            className="field big"
            autoFocus
            value={name}
            maxLength={80}
            placeholder={`Например: ${example}`}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                next();
              }
            }}
          />
          <p className="hint">
            Имя задаёт главную тему и настроение дня. Оно будет в трее, в утреннем напоминании и в истории. Enter: дальше.
          </p>
          {mode === "today" && (
            <p className="hint">Вчера этот день не назвали, поэтому он отметится как «назван в тот же день». Это нормально.</p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="wiz-body" key="s1">
          <h1 className="q">Опишите, чем будете заниматься.</h1>
          <textarea
            className="field area"
            autoFocus
            rows={7}
            maxLength={4000}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();
                next();
              }
            }}
            placeholder="Например: буду делать модели для своей игры в Blockbench: сначала соберу референсы, потом блокинг персонажа."
          />
          <p className="hint">Ссылки и пути к файлам станут кликабельными. Ctrl+Enter: дальше.</p>
        </div>
      )}

      {step === 2 && (
        <div className="wiz-body" key="s2">
          <h1 className="q">Нужен чеклист?</h1>
          <Check
            className="big"
            checked={need}
            onChange={(v) => {
              setNeed(v);
              if (v && rows.length === 0) addRow();
            }}
            label="Нужен чеклист"
          />
          {need && (
            <div className="items">
              {rows.map((r, i) => {
                const bad = r.text.trim() && parsed[i] !== null && okHours(r.hours) === null;
                return (
                  <div className="item-row" key={r.key}>
                    <span className="item-num">{i + 1}</span>
                    <div className="item-main">
                      <input
                        className="field"
                        ref={(el) => {
                          if (el) inputs.current.set(r.key, el);
                          else inputs.current.delete(r.key);
                        }}
                        value={r.text}
                        maxLength={300}
                        placeholder={i === 0 ? "Например: посмотреть урок по Blockbench https://…" : "Ещё пункт"}
                        onChange={(e) => update(r.key, { text: e.target.value })}
                        onKeyDown={(e) => itemKey(e, r, i)}
                      />
                      {r.attach && <AttachChip target={r.attach} onRemove={() => update(r.key, { attach: null })} />}
                    </div>
                    <input
                      className={`field hours${bad ? " bad" : ""}`}
                      value={r.hours}
                      maxLength={6}
                      placeholder="ч"
                      title="Часы на пункт, необязательно: 1,5 или 90м"
                      onChange={(e) => update(r.key, { hours: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRow(i))}
                    />
                    <button className="icon-btn" title="Прикрепить файл" onClick={() => void pickFile(r.key)}>
                      <Px name="folder" scale={2} />
                    </button>
                    <button className="icon-btn" title="Удалить пункт" onClick={() => remove(r.key)}>
                      <Px name="cross" scale={2} />
                    </button>
                  </div>
                );
              })}
              <div className="items-foot">
                <Button kind="paper" small icon="plus" onClick={() => addRow()}>
                  Пункт
                </Button>
                <span className={`total${total > 12 ? " warn" : ""}`}>
                  {total > 0 && <>Всего: {hoursText(total)} ч</>}
                  {total > 12 && ", многовато для одного дня"}
                </span>
              </div>
              <p className="hint">Enter: новый пункт. Alt+стрелки: переставить. Часы указывать не обязательно.</p>
              {carryLeft.length > 0 && (
                <div className="carry">
                  <span className="carry-title">Не успели сегодня. Перенести?</span>
                  {carryLeft.map((c) => (
                    <button
                      key={c.id}
                      className="chip-add"
                      onClick={() => {
                        sfx.pop();
                        const from = { text: c.text, hours: c.hours != null ? hoursText(c.hours) : "", attach: c.attach };
                        const blank = rows.find((r) => !r.text.trim());
                        if (blank) update(blank.key, from);
                        else addRow(undefined, from);
                      }}
                    >
                      + {c.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!need && <p className="hint">Можно и без чеклиста: имени и описания бывает достаточно.</p>}
        </div>
      )}

      <div className="wiz-foot">
        {onCancel && (
          <Button
            kind="ghost"
            onClick={() => {
              if (!initial) clearDraft(date);
              onCancel();
            }}
          >
            Отмена
          </Button>
        )}
        <span className="grow" />
        {step > 0 && (
          <Button kind="paper" icon="arrowL" onClick={back}>
            Назад
          </Button>
        )}
        {step < 2 ? (
          <Button icon="arrowR" disabled={!canNext} onClick={next}>
            Дальше
          </Button>
        ) : (
          <Button kind="green" icon="check" disabled={busy || !canNext} onClick={() => void save()}>
            {initial ? "Сохранить план" : "Записать план"}
          </Button>
        )}
      </div>
    </div>
  );
}
