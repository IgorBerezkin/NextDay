import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Nav } from "../App";
import { api, type CheckItem } from "../api";
import { sfx } from "../sound";
import { Button, Linkify, toastError } from "../ui/kit";
import { CENTER, CLOCK_PX, MARK_R, PixelClock, polar, type ClockMark, type Tone } from "../ui/PixelClock";
import { Px } from "../ui/Px";
import { duration, longDate, plural } from "../util";

type Half = "am" | "pm";
type Timed = { it: CheckItem; n: number; at: number; when: number };

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const RANK: Record<Tone, number> = { now: 3, next: 2, todo: 1, done: 0 };

function useNow(ovNow: string) {
  const offset = useRef(0);
  useEffect(() => {
    const d = Date.parse(ovNow) - Date.now();
    offset.current = Math.abs(d) > 60_000 ? d : 0;
  }, [ovNow]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date(Date.now() + offset.current)), 250);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function ClockScreen({ nav }: { nav: Nav }) {
  const { ov, go, patchDay } = nav;
  const now = useNow(ov.now);
  const [which, setWhich] = useState<"today" | "tomorrow">("today");
  const [half, setHalf] = useState<Half>(() => (new Date().getHours() < 12 ? "am" : "pm"));
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ text: string; x: number; y: number } | null>(null);
  const [scale, setScale] = useState(2);
  const leftRef = useRef<HTMLDivElement>(null);
  const dialRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = leftRef.current!;
    const fit = () => setScale(Math.max(1, Math.floor(Math.min(el.clientWidth, el.clientHeight - 150) / CLOCK_PX)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const day = which === "today" ? ov.todayDay : ov.tomorrowDay;
  const date = which === "today" ? ov.today : ov.tomorrow;
  const items = useMemo(() => day?.plan?.checklist ?? [], [day]);
  const editable = !!day?.plan && !day.result.sealed;
  const dsh = ov.settings.dayStartHour;

  const timed: Timed[] = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return items.flatMap((it, i) =>
      it.start == null ? [] : [{ it, n: i + 1, at: it.start, when: new Date(y, m - 1, d + (it.start < dsh ? 1 : 0), it.start).getTime() }],
    );
  }, [items, date, dsh]);

  const t = now.getTime();
  const live = which === "today" ? timed.filter((x) => !x.it.done) : [];
  const current = live.find((x) => x.when <= t && t < x.when + 3_600_000);
  const upcoming = live.filter((x) => x.when > t).sort((a, b) => a.when - b.when)[0];
  const toneOf = (x: Timed): Tone => (x.it.done ? "done" : x === current ? "now" : x === upcoming ? "next" : "todo");

  const marks: ClockMark[] = useMemo(() => {
    const groups = new Map<number, Timed[]>();
    for (const x of timed) if (x.at < 12 === (half === "am")) groups.set(x.at, [...(groups.get(x.at) ?? []), x]);
    return [...groups].map(([hour, xs]) => ({
      hour,
      label: xs.length > 1 ? String(xs.length) : String(xs[0].n),
      tone: xs.map(toneOf).sort((a, b) => RANK[b] - RANK[a])[0],
    }));
  }, [timed, half, current, upcoming]);

  const toBoard = (clientX: number, clientY: number) => {
    const r = dialRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * CLOCK_PX, y: ((clientY - r.top) / r.height) * CLOCK_PX };
  };

  const hourAt = (clientX: number, clientY: number): number | null => {
    const r = dialRef.current?.getBoundingClientRect();
    if (!r || clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    const p = toBoard(clientX, clientY);
    const turn = (Math.atan2(p.x - CENTER, CENTER - p.y) / (Math.PI * 2) + 1) % 1;
    return (Math.round(turn * 12) % 12) + (half === "pm" ? 12 : 0);
  };

  const markAt = (clientX: number, clientY: number): number | null => {
    const p = toBoard(clientX, clientY);
    const hit = marks.find((m) => {
      const [x, y] = polar(MARK_R, (m.hour % 12) / 12);
      return Math.abs(x - p.x) <= 7 && Math.abs(y - p.y) <= 6;
    });
    return hit ? hit.hour : null;
  };

  const setHour = async (list: CheckItem[], hour: number | null) => {
    try {
      let d = day!;
      for (const it of list) d = await api.setStart(date, it.id, hour);
      patchDay(d);
      sfx.pop();
    } catch (e) {
      toastError(e);
    }
  };

  const startDrag = (e: React.PointerEvent, list: CheckItem[], fromDial: boolean) => {
    if (e.button !== 0 || !editable || !list.length) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) < 5) return;
      moved = true;
      setGhost({ text: list.length > 1 ? plural(list.length, "задача", "задачи", "задач") : list[0].text, x: ev.clientX, y: ev.clientY });
      setHoverHour(hourAt(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGhost(null);
      setHoverHour(null);
      if (!moved) return;
      const hour = hourAt(ev.clientX, ev.clientY);
      if (hour !== null) void setHour(list, hour);
      else if (fromDial) void setHour(list, null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onDialDown = (e: React.PointerEvent) => {
    const hour = markAt(e.clientX, e.clientY);
    if (hour !== null)
      startDrag(
        e,
        timed.filter((x) => x.at === hour).map((x) => x.it),
        true,
      );
  };

  const onDialMove = (e: React.PointerEvent) => {
    if (!ghost) setHoverHour(markAt(e.clientX, e.clientY));
  };

  const switchDay = (w: "today" | "tomorrow") => {
    sfx.click();
    setWhich(w);
    setHalf(w === "tomorrow" ? "am" : new Date().getHours() < 12 ? "am" : "pm");
  };

  const hoverList = hoverHour === null ? [] : timed.filter((x) => x.at === hoverHour);

  return (
    <div className="screen clock-screen">
      <div className="clk-left" ref={leftRef}>
        <div
          className={`clk-dial${editable ? " editable" : ""}`}
          ref={dialRef}
          onPointerDown={onDialDown}
          onPointerMove={onDialMove}
          onPointerLeave={() => !ghost && setHoverHour(null)}
        >
          <PixelClock now={now} marks={marks} scale={scale} />
        </div>
        <div className="clk-time">{now.toTimeString().slice(0, 5)}</div>
        <div className="clk-caption">
          {hoverList.length ? (
            <>
              {hh(hoverHour!)} · <Linkify inert text={hoverList.map((x) => x.it.text).join(", ")} />
            </>
          ) : (
            longDate(date)
          )}
        </div>
        <div className="seg">
          <button className={half === "am" ? "on" : ""} onClick={() => setHalf("am")}>
            <Px name="sunColor" scale={1.5} /> До полудня
          </button>
          <button className={half === "pm" ? "on" : ""} onClick={() => setHalf("pm")}>
            <Px name="moonColor" scale={1.5} /> После полудня
          </button>
        </div>
      </div>

      <div className="clk-right">
        <div className="seg">
          <button className={which === "today" ? "on" : ""} onClick={() => switchDay("today")}>
            Сегодня
          </button>
          <button className={which === "tomorrow" ? "on" : ""} onClick={() => switchDay("tomorrow")}>
            Завтра
          </button>
        </div>

        {!day?.plan ? (
          <div className="clk-empty">
            <p className="muted">{which === "today" ? "У сегодняшнего дня нет плана." : "Завтрашний день ещё не назван."}</p>
            <Button kind="paper" icon={which === "today" ? "sun" : "moon"} onClick={() => go({ name: which })}>
              {which === "today" ? "К сегодняшнему дню" : "Назвать завтрашний день"}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="muted clk-empty">В плане нет чеклиста. Время ставится пунктам чеклиста.</p>
        ) : (
          <>
            {which === "today" && (
              <p className="clk-next">
                {current ? (
                  <>
                    <b>Сейчас:</b> «<Linkify inert text={current.it.text} />»
                  </>
                ) : upcoming ? (
                  <>
                    <b>Дальше:</b> «<Linkify inert text={upcoming.it.text} />» в {hh(upcoming.at)}, через{" "}
                    {duration((upcoming.when - t) / 1000)}
                  </>
                ) : timed.length ? (
                  live.length ? (
                    "Задачи со временем на сегодня позади."
                  ) : (
                    "Все задачи со временем сделаны."
                  )
                ) : (
                  "Поставь задачам время, и часы подскажут, когда начинать."
                )}
              </p>
            )}
            <ul className="clk-list">
              {items.map((it, i) => {
                const x = timed.find((y) => y.it.id === it.id);
                return (
                  <li
                    key={it.id}
                    className={`clk-item${it.done ? " done" : ""}${x && x.at === hoverHour ? " hot" : ""}${editable ? " draggable" : ""}`}
                    onPointerDown={(e) => startDrag(e, [it], false)}
                  >
                    <span className={`clk-num tone-${x ? toneOf(x) : "none"}`}>{i + 1}</span>
                    <span className="clk-text">
                      <Linkify inert text={it.text} />
                    </span>
                    <select
                      className="field select clk-hour"
                      value={it.start ?? ""}
                      disabled={!editable}
                      onPointerDown={(e) => e.stopPropagation()}
                      onChange={(e) => void setHour([it], e.target.value === "" ? null : Number(e.target.value))}
                    >
                      <option value="">--:--</option>
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {hh(h)}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
            {editable && (
              <p className="hint">
                Перетащи пункт на нужный час или выбери время справа. Метку можно утащить с часов, тогда время сбросится.
              </p>
            )}
          </>
        )}
      </div>

      {ghost && (
        <div className="task-ghost clk-ghost" style={{ left: ghost.x, top: ghost.y }}>
          <Px name="clock" scale={1.5} />
          <span>
            <Linkify inert text={ghost.text} />
          </span>
          {hoverHour !== null && <b>{hh(hoverHour)}</b>}
        </div>
      )}
    </div>
  );
}
