import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errText, type DrillAnswer, type DrillRecord, type DrillSessionView } from "../api";
import { t } from "../i18n";
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
      ? { text: t(`Верно ${view.correct} из ${view.amount}`, `${view.correct} of ${view.amount} right`), value: view.correct / view.amount }
      : view.goal === "cards"
        ? {
            text: t(
              `Карточка ${Math.min(view.answered + 1, view.amount)} из ${view.amount}`,
              `Card ${Math.min(view.answered + 1, view.amount)} of ${view.amount}`,
            ),
            value: view.answered / view.amount,
          }
        : {
            text: t(`Осталось ${mmss(view.amount * 60 - elapsed)}`, `${mmss(view.amount * 60 - elapsed)} left`),
            value: elapsed / (view.amount * 60),
          };

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
        <div className="drill-clock" title={t("Сколько идёт сеанс", "Session time")}>
          <Px name="clock" scale={1.5} /> {mmss(elapsed)}
        </div>
        {!lock && !ended && (
          <Button kind="ghost" small onClick={() => void stop()}>
            {t("Закончить", "Finish")}
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
            {card.retry && <span className="drill-chip again">{t("ещё раз, новые данные", "again, new data")}</span>}
            <span className="grow" />
            <span className="muted">{card.deck}</span>
            <button
              className={`drill-bulb${card.hinted ? " used" : ""}`}
              onClick={() => void openTheory()}
              title={
                phase === "ask"
                  ? t(
                      "Открыть теорию. Ответ после подсказки не повысит карточку, если так настроен режим.",
                      "Open theory. If the mode is set that way, an answer after a hint won't promote the card.",
                    )
                  : t("Открыть теорию", "Open theory")
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
              {t("Показать ответ (Enter)", "Show answer (Enter)")}
            </Button>
          )}

          {phase === "ask" && card.mode === "self" && card.revealed && (
            <div className="drill-verdict">
              <div className="drill-row">
                <span className="muted">{t("Ответ:", "Answer:")}</span> <code className="drill-ans">{card.revealed.expected}</code>
              </div>
              {card.revealed.explain && (
                <div className="drill-rule">
                  <Markdown text={card.revealed.explain} inert={lock} />
                </div>
              )}
              <div className="row">
                <Button kind="green" icon="check" disabled={busy} onClick={() => void submit({ knew: true })}>
                  {t("Знал (1)", "I knew it (1)")}
                </Button>
                <Button kind="danger" icon="cross" disabled={busy} onClick={() => void submit({ knew: false })}>
                  {t("Не знал (2)", "I didn't (2)")}
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
                placeholder={t("Ответ", "Answer")}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
              />
              <Button type="submit" disabled={busy || !text.trim()}>
                {t("Ответить", "Answer")}
              </Button>
            </form>
          )}
          {phase === "ask" && <p className="drill-hint">{card.hint || HINT[card.mode]}</p>}

          {phase !== "ask" && last && (
            <div className={`drill-verdict ${last.correct ? "ok" : "bad"}`}>
              <div className="drill-verdict-head">
                <Px name={last.correct ? "check" : "cross"} scale={2} />
                {last.correct ? (last.hinted ? t("Верно, с подсказкой", "Right, with a hint") : t("Верно", "Right")) : t("Мимо", "Miss")}
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
              {last.opened && <p className="drill-opened">{t(`Открыта новая тема: ${last.opened}`, `New topic opened: ${last.opened}`)}</p>}
              {phase === "result" && (
                <Button icon="arrowR" onClick={advance}>
                  {t("Дальше (Enter)", "Next (Enter)")}
                </Button>
              )}
            </div>
          )}
          {err && <p className="drill-err">{err}</p>}
        </div>
      ) : (
        <div className="drill-card">
          <p className="muted">{t("Карточки закончились.", "Out of cards.")}</p>
        </div>
      )}

      {lock && !ended && (
        <footer className="drill-foot">
          {view.escape === "hold" ? (
            hold !== null ? (
              <div className="drill-hold">
                <span>{t(`Держи Esc ещё ${Math.ceil((5000 - hold) / 1000)}`, `Keep holding Esc: ${Math.ceil((5000 - hold) / 1000)}`)}</span>
                <Progress value={hold / 5000} cells={10} />
              </div>
            ) : (
              <span className="muted">
                {t(
                  "Экстренный выход: держать Esc 5 секунд. Сеанс запишется как побег.",
                  "Emergency exit: hold Esc for 5 seconds. The session counts as an escape.",
                )}
              </span>
            )
          ) : (
            <span className="muted">{t("Выход только через ответы.", "The only way out is answering.")}</span>
          )}
          {left !== null && (
            <span className="muted">{t(`Замок откроется сам через ${mmss(left)}`, `The lock opens by itself in ${mmss(left)}`)}</span>
          )}
        </footer>
      )}

      {theory && card && (
        <TheoryPanel deck={card.deckId} topic={card.topicId} label={view.theoryLabel} inert={lock} onClose={() => setTheory(false)} />
      )}

      {confirm && (
        <Modal
          title={t("Сбежать из замка?", "Escape the lock?")}
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button kind="paper" onClick={() => setConfirm(false)}>
                {t("Остаться", "Stay")}
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
                {t("Сбежать", "Escape")}
              </Button>
            </>
          }
        >
          <p>
            {t(
              "Сеанс запишется как побег, а серия дней со Зубрилкой прервётся.",
              "The session counts as an escape, and your Drill streak breaks.",
            )}
          </p>
          <p className="muted">
            {t(
              `Верно ${view.correct} из ${view.amount}. Может, ещё пара карточек?`,
              `${view.correct} of ${view.amount} right. Maybe a couple more cards?`,
            )}
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
        {rec.outcome === "done"
          ? t("Сеанс пройден", "Session complete")
          : t(`Сеанс окончен: ${OUTCOME[rec.outcome].toLowerCase()}`, `Session over: ${OUTCOME[rec.outcome].toLowerCase()}`)}
      </h2>
      <div className="drill-stats">
        <div className="drill-stat">
          <b>{rec.correct}</b>
          <span>
            {t("верно из", "right out of")}{" "}
            {plural(rec.answered, "ответа", "ответов", "ответов", "answer", "answers").replace(/^\d+ /, `${rec.answered} `)}
          </span>
        </div>
        <div className="drill-stat">
          <b>{rec.firstTry}</b>
          <span>{t("с первого раза", "on the first try")}</span>
        </div>
        <div className="drill-stat">
          <b>{spent(rec.seconds)}</b>
          <span>{t("на сеанс", "session time")}</span>
        </div>
        {rec.hinted > 0 && (
          <div className="drill-stat">
            <b>{rec.hinted}</b>
            <span>{t("с подсказкой", "with a hint")}</span>
          </div>
        )}
      </div>
      {misses ? <p>{misses}</p> : rec.answered > 0 && <p className="good">{t("Ни одного промаха.", "Not a single miss.")}</p>}
      {lock ? (
        <p className="muted">{t("Замок открывается…", "Unlocking...")}</p>
      ) : (
        <Button icon="check" onClick={onDone}>
          {t("Готово", "Done")}
        </Button>
      )}
    </div>
  );
}
