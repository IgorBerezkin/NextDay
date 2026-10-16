import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errText, type DrillAnswer, type DrillRecord, type DrillSessionView } from "../api";
import { sfx } from "../sound";
import { Button, Modal, Progress } from "../ui/kit";
import { Px } from "../ui/Px";
import { plural } from "../util";
import { choiceKey, Code, HINT, LETTERS, missText, mmss, OUTCOME, Prompt, spent, type Tone } from "./drillKit";
import { Markdown } from "./Markdown";
import { TheoryPanel } from "./Theory";
import { WalkView } from "./Walk";

type Phase = "ask" | "flash" | "result";

export function DrillSession({ initial, lock, onDone }: { initial: DrillSessionView; lock: boolean; onDone: () => void }) {
  const [view, setView] = useState(initial);
  const [phase, setPhase] = useState<Phase>("ask");
  const [last, setLast] = useState<DrillAnswer | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [hold, setHold] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [theory, setTheory] = useState(false);
  const [mark, setMark] = useState<{ line: number | null; tone: Tone }>({ line: null, tone: "err" });
  const onMark = useCallback((line: number | null, tone: Tone) => setMark({ line, tone }), []);
  const base = useRef({ at: Date.now(), elapsed: initial.elapsed });
  const pending = useRef<DrillSessionView | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const elapsed = view.ended ? view.ended.seconds : base.current.elapsed + Math.floor((now - base.current.at) / 1000);
  const card = view.card;
  const ended = view.ended;

  useEffect(() => {
    if (ended) return;
    const un = listen("drill-changed", () => {
      void api
        .drillSession()
        .then((v) => {
          if (v && v.id === view.id && v.ended) setView(v);
        })
        .catch(() => {});
    });
    return () => void un.then((f) => f());
  }, [view.id, ended]);

  const apply = useCallback((v: DrillSessionView) => {
    base.current = { at: Date.now(), elapsed: v.elapsed };
    setView(v);
    setText("");
    setErr(null);
    setLast(null);
    setPhase("ask");
    setMark({ line: null, tone: "err" });
  }, []);

  const advance = useCallback(() => {
    const v = pending.current;
    pending.current = null;
    if (v) apply(v);
  }, [apply]);

  const submit = async (payload: { text?: string; knew?: boolean }) => {
    if (busy || phase !== "ask") return;
    if (payload.text !== undefined && !payload.text.trim()) return;
    setBusy(true);
    try {
      const r = await api.drillAnswer(payload);
      pending.current = r.session;
      setLast(r);
      if (r.correct) sfx.tick();
      else sfx.error();
      if (payload.knew !== undefined || (r.correct && !r.explain && !r.opened)) {
        setPhase("flash");
        window.setTimeout(advance, r.correct ? 650 : 900);
      } else {
        setPhase("result");
      }
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    try {
      setView(await api.drillReveal());
      sfx.pop();
    } catch (e) {
      setErr(errText(e));
    }
  };

  const openTheory = async () => {
    if (phase === "ask" && card && !card.hinted) {
      try {
        await api.drillHint();
        setView((v) => (v.card ? { ...v, card: { ...v.card, hinted: true } } : v));
      } catch (e) {
        setErr(errText(e));
      }
    }
    setTheory(true);
  };

  const stop = async () => {
    try {
      const rec = await api.drillEscape();
      setView((v) => ({ ...v, card: null, ended: rec }));
      setPhase("ask");
    } catch (e) {
      setErr(errText(e));
    }
  };

  useEffect(() => {
    if (phase === "ask" && !ended && !theory) input.current?.focus();
  }, [phase, card, ended, theory]);

  useEffect(() => {
    const refocus = () => {
      if (phase === "ask" && !theory) input.current?.focus();
    };
    window.addEventListener("focus", refocus);
    return () => window.removeEventListener("focus", refocus);
  }, [phase, theory]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || confirm || theory) return;
      if (phase === "result" && e.key === "Enter") {
        e.preventDefault();
        advance();
        return;
      }
      if (phase !== "ask" || !card || ended) return;
      if (card.mode === "choice" || card.mode === "pick") {
        const i = choiceKey(e);
        const c = i === null ? undefined : card.choices[i];
        if (c !== undefined) {
          e.preventDefault();
          void submit({ text: c });
        }
      }
      if (card.mode === "self") {
        if (!card.revealed && e.key === "Enter") void reveal();
        else if (card.revealed && e.key === "1") void submit({ knew: true });
        else if (card.revealed && e.key === "2") void submit({ knew: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!lock || view.escape !== "hold" || ended) return;
    let start: number | null = null;
    let raf = 0;
    const loop = () => {
      if (start === null) return;
      const d = performance.now() - start;
      if (d >= 5000) {
        start = null;
        setHold(null);
        setConfirm(true);
        return;
      }
      setHold(d);
      raf = requestAnimationFrame(loop);
    };
    const down = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.repeat || start !== null) return;
      start = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      start = null;
      cancelAnimationFrame(raf);
      setHold(null);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      cancelAnimationFrame(raf);
    };
  }, [lock, view.escape, ended]);

  useEffect(() => {
    if (!lock || !ended) return;
    const t = window.setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [lock, ended, onDone]);

  const progress =
    view.goal === "correct"
      ? { text: `Верно ${view.correct} из ${view.amount}`, value: view.correct / view.amount }
      : view.goal === "cards"
        ? { text: `Карточка ${Math.min(view.answered + 1, view.amount)} из ${view.amount}`, value: view.answered / view.amount }
        : { text: `Осталось ${mmss(view.amount * 60 - elapsed)}`, value: elapsed / (view.amount * 60) };

  const left = view.limit !== null ? view.limit - elapsed : null;

  return (
    <div className={`drill-session${lock ? " lock" : ""}`}>
      <header className="drill-top">
        <div className="drill-title">
          <Px name="cards" scale={2} />
          <span>{view.name}</span>
        </div>
        <div className="drill-meter">
          <span>{progress.text}</span>
          <Progress value={ended ? 1 : progress.value} cells={view.goal === "minutes" ? 20 : Math.min(20, view.amount)} />
        </div>
        <div className="drill-clock" title="Сколько идёт сеанс">
          <Px name="clock" scale={1.5} /> {mmss(elapsed)}
        </div>
        {!lock && !ended && (
          <Button kind="ghost" small onClick={() => void stop()}>
            Закончить
          </Button>
        )}
      </header>

      {ended ? (
        <Summary rec={ended} lock={lock} onDone={onDone} />
      ) : card ? (
        <div className="drill-card">
          <div className="drill-meta">
            {card.topic && <span className="drill-chip">{card.topic}</span>}
            <span className="drill-kind">{card.kind}</span>
            {card.retry && <span className="drill-chip again">ещё раз, новые данные</span>}
            <span className="grow" />
            <span className="muted">{card.deck}</span>
            <button
              className={`drill-bulb${card.hinted ? " used" : ""}`}
              onClick={() => void openTheory()}
              title={
                phase === "ask" ? "Открыть теорию. Ответ после подсказки не повысит карточку, если так настроен режим." : "Открыть теорию"
              }
            >
              <Px name="sIdea" scale={2} />
              {view.theoryLabel && <span>{view.theoryLabel}</span>}
            </button>
          </div>
          {card.code && <Code code={card.code} mark={phase !== "ask" ? mark.line : null} tone={mark.tone} />}
          <p className="drill-q">
            <Prompt text={card.prompt} />
          </p>

          {phase === "ask" && (card.mode === "choice" || card.mode === "pick") && (
            <div className={`drill-choices${card.mode === "pick" ? " code" : ""}`}>
              {card.choices.map((c, i) => (
                <button key={i} className="drill-choice" disabled={busy} onClick={() => void submit({ text: c })}>
                  <b>{LETTERS[i]}</b> {card.mode === "pick" ? <code>{c}</code> : c}
                </button>
              ))}
            </div>
          )}

          {phase === "ask" && card.mode === "self" && !card.revealed && (
            <Button kind="paper" icon="note" onClick={() => void reveal()}>
              Показать ответ (Enter)
            </Button>
          )}

          {phase === "ask" && card.mode === "self" && card.revealed && (
            <div className="drill-verdict">
              <div className="drill-row">
                <span className="muted">Ответ:</span> <code className="drill-ans">{card.revealed.expected}</code>
              </div>
              {card.revealed.explain && (
                <div className="drill-rule">
                  <Markdown text={card.revealed.explain} inert={lock} />
                </div>
              )}
              <div className="row">
                <Button kind="green" icon="check" disabled={busy} onClick={() => void submit({ knew: true })}>
                  Знал (1)
                </Button>
                <Button kind="danger" icon="cross" disabled={busy} onClick={() => void submit({ knew: false })}>
                  Не знал (2)
                </Button>
              </div>
            </div>
          )}

          {phase === "ask" && card.mode !== "choice" && card.mode !== "pick" && card.mode !== "self" && (
            <form
              className="drill-answer"
              onSubmit={(e) => {
                e.preventDefault();
                void submit({ text });
              }}
            >
              <input
                ref={input}
                className="field drill-input"
                value={text}
                spellCheck={false}
                autoComplete="off"
                placeholder="Ответ"
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
              />
              <Button type="submit" disabled={busy || !text.trim()}>
                Ответить
              </Button>
            </form>
          )}
          {phase === "ask" && <p className="drill-hint">{HINT[card.mode]}</p>}

          {phase !== "ask" && last && (
            <div className={`drill-verdict ${last.correct ? "ok" : "bad"}`}>
              <div className="drill-verdict-head">
                <Px name={last.correct ? "check" : "cross"} scale={2} />
                {last.correct ? (last.hinted ? "Верно, с подсказкой" : "Верно") : "Мимо"}
              </div>
              {last.note && <p className="drill-note">{last.note}</p>}
              {!last.correct ? (
                <WalkView
                  code={card.code}
                  mode={card.mode}
                  expected={last.expected}
                  given={last.given}
                  walk={last.walk}
                  rule={last.explain}
                  theory={{ label: view.theoryLabel, open: () => setTheory(true) }}
                  inert={lock}
                  onMark={onMark}
                />
              ) : (
                last.explain && (
                  <div className="drill-rule">
                    <Markdown text={last.explain} inert={lock} />
                  </div>
                )
              )}
              {last.opened && <p className="drill-opened">Открыта новая тема: {last.opened}</p>}
              {phase === "result" && (
                <Button icon="arrowR" onClick={advance}>
                  Дальше (Enter)
                </Button>
              )}
            </div>
          )}
          {err && <p className="drill-err">{err}</p>}
        </div>
      ) : (
        <div className="drill-card">
          <p className="muted">Карточки закончились.</p>
        </div>
      )}

      {lock && !ended && (
        <footer className="drill-foot">
          {view.escape === "hold" ? (
            hold !== null ? (
              <div className="drill-hold">
                <span>Держи Esc ещё {Math.ceil((5000 - hold) / 1000)}</span>
                <Progress value={hold / 5000} cells={10} />
              </div>
            ) : (
              <span className="muted">Экстренный выход: держать Esc 5 секунд. Сеанс запишется как побег.</span>
            )
          ) : (
            <span className="muted">Выход только через ответы.</span>
          )}
          {left !== null && <span className="muted">Замок откроется сам через {mmss(left)}</span>}
        </footer>
      )}

      {theory && card && (
        <TheoryPanel deck={card.deckId} topic={card.topicId} label={view.theoryLabel} inert={lock} onClose={() => setTheory(false)} />
      )}

      {confirm && (
        <Modal
          title="Сбежать из замка?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button kind="paper" onClick={() => setConfirm(false)}>
                Остаться
              </Button>
              <Button
                kind="danger"
                onClick={async () => {
                  setConfirm(false);
                  try {
                    await api.drillEscape();
                  } catch (e) {
                    setErr(errText(e));
                  }
                }}
              >
                Сбежать
              </Button>
            </>
          }
        >
          <p>Сеанс запишется как побег, а серия дней со Зубрилкой прервётся.</p>
          <p className="muted">
            Верно {view.correct} из {view.amount}. Может, ещё пара карточек?
          </p>
        </Modal>
      )}
    </div>
  );
}

function Summary({ rec, lock, onDone }: { rec: DrillRecord; lock: boolean; onDone: () => void }) {
  const misses = missText(rec.misses, rec.wrong);
  return (
    <div className="drill-card drill-summary">
      <h2 className="drill-sum-title">
        {rec.outcome === "done" ? "Сеанс пройден" : `Сеанс окончен: ${OUTCOME[rec.outcome].toLowerCase()}`}
      </h2>
      <div className="drill-stats">
        <div className="drill-stat">
          <b>{rec.correct}</b>
          <span>верно из {plural(rec.answered, "ответа", "ответов", "ответов").replace(/^\d+ /, `${rec.answered} `)}</span>
        </div>
        <div className="drill-stat">
          <b>{rec.firstTry}</b>
          <span>с первого раза</span>
        </div>
        <div className="drill-stat">
          <b>{spent(rec.seconds)}</b>
          <span>на сеанс</span>
        </div>
        {rec.hinted > 0 && (
          <div className="drill-stat">
            <b>{rec.hinted}</b>
            <span>с подсказкой</span>
          </div>
        )}
      </div>
      {misses ? <p>{misses}</p> : rec.answered > 0 && <p className="good">Ни одного промаха.</p>}
      {lock ? (
        <p className="muted">Замок открывается…</p>
      ) : (
        <Button icon="check" onClick={onDone}>
          Готово
        </Button>
      )}
    </div>
  );
}
