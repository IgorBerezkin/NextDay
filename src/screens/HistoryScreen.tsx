import { useEffect, useMemo, useState } from "react";
import type { Nav } from "../App";
import { api, type DaySummary } from "../api";
import { t } from "../i18n";
import { Button, Linkify, toastError } from "../ui/kit";
import { Face, Px } from "../ui/Px";
import type { IconName } from "../ui/icons";
import { fromDate, hoursText, longDate, plural, RATING_LABELS, shortMonth, shortWeekday, toDate } from "../util";

export function HistoryScreen({ nav }: { nav: Nav }) {
  const { ov, go } = nav;
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [q, setQ] = useState("");
  const [year, setYear] = useState(Number(ov.today.slice(0, 4)));

  useEffect(() => {
    api.days().then(setDays).catch(toastError);
  }, [ov.today, ov.todayDay?.result.updatedAt, ov.todayDay?.result.sealed, ov.yesterdayDay?.result.sealed]);

  const stats = useMemo(() => {
    const ds = days ?? [];
    const total = ds.reduce((s, d) => s + d.itemsTotal, 0);
    const done = ds.reduce((s, d) => s + d.itemsDone, 0);
    const rated = ds.filter((d) => d.rating);
    const avg = rated.length ? rated.reduce((s, d) => s + (d.rating ?? 0), 0) / rated.length : 0;
    return { pct: total ? Math.round((done / total) * 100) : null, avg, rated: rated.length };
  }, [days]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!days) return [];
    if (!t) return days;
    return days.filter((d) => `${d.name} ${d.description} ${d.summary ?? ""}`.toLowerCase().includes(t));
  }, [days, q]);

  const years = useMemo(() => {
    const set = new Set((days ?? []).map((d) => Number(d.date.slice(0, 4))));
    set.add(Number(ov.today.slice(0, 4)));
    return [...set].sort();
  }, [days, ov.today]);

  return (
    <div className="screen history">
      <div className="hist-top">
        <h1 className="screen-title">{t("История", "History")}</h1>
        <div className="stats">
          <Stat
            icon="flame"
            value={ov.streak}
            label={`${plural(ov.streak, "день", "дня", "дней", "day", "days").replace(/^\d+ /, "")} ${t("подряд", "in a row")}`}
          />
          <Stat icon="sTrophy" value={ov.bestStreak} label={t("лучшая серия", "best streak")} />
          <Stat icon="calendar" value={ov.totalDays} label={t("дней с именем", "named days")} />
          <Stat icon="sCheck" value={stats.pct === null ? t("нет", "none") : `${stats.pct}%`} label={t("пунктов сделано", "items done")} />
          <div className="stat">
            {stats.rated ? <Face rating={stats.avg} scale={2} /> : <Px name="sSmile" scale={2} />}
            <b>{stats.rated ? hoursText(Math.round(stats.avg * 10) / 10) : t("нет", "none")}</b>
            <span>{t("средняя оценка", "average rating")}</span>
          </div>
        </div>
      </div>

      <YearPixels
        year={year}
        years={years}
        setYear={setYear}
        days={days ?? []}
        today={ov.today}
        tomorrow={ov.tomorrow}
        onPick={(d) => go({ name: "day", date: d })}
      />

      <div className="hist-list-head">
        <h2 className="card-title">
          <Px name="calendar" scale={2} /> {t("Дни", "Days")}
        </h2>
        <input
          className="field search"
          placeholder={t("Поиск по именам и описаниям", "Search names and descriptions")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {days && days.length === 0 && (
        <div className="empty small">
          <Px name="moonColor" scale={4} />
          {ov.tomorrowDay?.plan ? (
            <p>
              {t(
                `История начнётся завтра, с дня «${ov.tomorrowDay.plan.name}».`,
                `History starts tomorrow, with "${ov.tomorrowDay.plan.name}".`,
              )}
            </p>
          ) : (
            <>
              <p>
                {t(
                  "История пока пустая. Назовите завтрашний день, с него всё и начнётся.",
                  "No history yet. Name tomorrow, and it all starts there.",
                )}
              </p>
              <Button icon="moon" onClick={() => go({ name: "tomorrow" })}>
                {t("Назвать завтрашний день", "Name tomorrow")}
              </Button>
            </>
          )}
        </div>
      )}
      {days && days.length > 0 && filtered.length === 0 && <p className="muted">{t("Ничего не нашлось.", "Nothing found.")}</p>}
      <div className="hist-list">
        {filtered.map((d) => (
          <DayCard key={d.date} d={d} today={ov.today} onOpen={() => go({ name: "day", date: d.date })} />
        ))}
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: React.ReactNode; label: string }) {
  return (
    <div className="stat">
      <Px name={icon} scale={2} />
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

const MONTHS = t(
  ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
);

function YearPixels({
  year,
  years,
  setYear,
  days,
  today,
  tomorrow,
  onPick,
}: {
  year: number;
  years: number[];
  setYear: (y: number) => void;
  days: DaySummary[];
  today: string;
  tomorrow: string;
  onPick: (date: string) => void;
}) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const cells = useMemo(() => {
    const first = new Date(year, 0, 1, 12);
    const offset = (first.getDay() + 6) % 7;
    const out: { date: string; col: number; row: number }[] = [];
    const d = new Date(first);
    let i = 0;
    while (d.getFullYear() === year) {
      out.push({ date: fromDate(d), col: Math.floor((i + offset) / 7), row: (i + offset) % 7 });
      d.setDate(d.getDate() + 1);
      i++;
    }
    return out;
  }, [year]);
  const months = useMemo(() => {
    const res: { col: number; label: string }[] = [];
    for (let m = 0; m < 12; m++) {
      const c = cells.find((x) => Number(x.date.slice(5, 7)) === m + 1);
      if (c) res.push({ col: c.col, label: MONTHS[m] });
    }
    return res;
  }, [cells]);
  const idx = years.indexOf(year);

  return (
    <section className="card year">
      <div className="year-head">
        <h2 className="card-title">
          <Px name="star" scale={2} /> {t("Год в пикселях", "Year in pixels")}
        </h2>
        <div className="year-nav">
          <button
            className="icon-btn"
            disabled={idx <= 0}
            onClick={() => setYear(years[idx - 1])}
            title={t("Предыдущий год", "Previous year")}
          >
            <Px name="arrowL" scale={2} />
          </button>
          <b>{year}</b>
          <button
            className="icon-btn"
            disabled={idx >= years.length - 1}
            onClick={() => setYear(years[idx + 1])}
            title={t("Следующий год", "Next year")}
          >
            <Px name="arrowR" scale={2} />
          </button>
        </div>
      </div>
      <div className="year-scroll">
        <div className="year-grid">
          {months.map((m) => (
            <span key={m.label} className="ym" style={{ gridColumn: m.col + 2, gridRow: 1 }}>
              {m.label}
            </span>
          ))}
          {t(["пн", "", "ср", "", "пт", "", "вс"], ["Mon", "", "Wed", "", "Fri", "", "Sun"]).map((w, i) => (
            <span key={i} className="yw" style={{ gridColumn: 1, gridRow: i + 2 }}>
              {w}
            </span>
          ))}
          {cells.map((c) => {
            const s = byDate.get(c.date);
            const cls = s
              ? s.rating
                ? `r${s.rating}`
                : s.sealed
                  ? "auto"
                  : "open"
              : c.date === tomorrow
                ? "none"
                : c.date > today
                  ? "future"
                  : "none";
            const title = s
              ? `${longDate(c.date)} · ${t(`«${s.name}»`, `"${s.name}"`)}${s.rating ? ` · ${RATING_LABELS[s.rating]}` : s.sealed ? t(" · без оценки", " · no rating") : t(" · итоги открыты", " · results open")}`
              : `${longDate(c.date)}${c.date <= today ? t(" · без имени", " · unnamed") : ""}`;
            return (
              <button
                key={c.date}
                className={`yc ${cls}${c.date === today ? " today" : ""}`}
                style={{ gridColumn: c.col + 2, gridRow: c.row + 2 }}
                title={title}
                disabled={!s}
                onClick={() => s && onPick(c.date)}
              />
            );
          })}
        </div>
      </div>
      <div className="year-legend">
        <span>
          <i className="yc none" /> {t("без имени", "unnamed")}
        </span>
        <span>
          <i className="yc open" /> {t("итоги открыты", "results open")}
        </span>
        <span>
          <i className="yc auto" /> {t("без оценки", "no rating")}
        </span>
        {[1, 2, 3, 4, 5].map((r) => (
          <span key={r}>
            <i className={`yc r${r}`} /> {RATING_LABELS[r].toLowerCase()}
          </span>
        ))}
      </div>
    </section>
  );
}

function DayCard({ d, today, onOpen }: { d: DaySummary; today: string; onOpen: () => void }) {
  const date = toDate(d.date);
  return (
    <button className="day-card" onClick={onOpen}>
      <div className={`dc-date${d.date === today ? " today" : ""}`}>
        <span>{shortWeekday(d.date)}</span>
        <b>{date.getDate()}</b>
        <span>{shortMonth(d.date)}</span>
      </div>
      <div className="dc-body">
        <div className="dc-name">{t(`«${d.name}»`, `"${d.name}"`)}</div>
        {d.summary ? (
          <div className="dc-sum">
            {t(
              <>
                «<Linkify inert text={d.summary} />»
              </>,
              <>
                "<Linkify inert text={d.summary} />"
              </>,
            )}
          </div>
        ) : (
          d.description && (
            <div className="dc-desc">
              <Linkify inert text={d.description} />
            </div>
          )
        )}
        <div className="dc-meta">
          {d.date === today && <span className="tag">{t("сегодня", "today")}</span>}
          {d.hasChecklist && (
            <span>
              <Px name="check" scale={1.5} /> {d.itemsDone}/{d.itemsTotal}
            </span>
          )}
          {d.hoursTotal > 0 && (
            <span>
              <Px name="clock" scale={1.5} />{" "}
              {t(`${hoursText(d.hoursDone)} из ${hoursText(d.hoursTotal)} ч`, `${hoursText(d.hoursDone)} of ${hoursText(d.hoursTotal)} h`)}
            </span>
          )}
          {d.hasResult && (
            <span>
              <Px name="image" scale={1.5} /> {t("доска", "board")}
            </span>
          )}
          {d.late && <span className="tag">{t("назван в тот же день", "named the same day")}</span>}
        </div>
      </div>
      <div
        className="dc-right"
        title={
          d.rating
            ? RATING_LABELS[d.rating]
            : d.sealed
              ? t("Запечатан без оценки", "Sealed, no rating")
              : t("Итоги ещё открыты", "Results still open")
        }
      >
        {d.rating ? (
          <Face rating={d.rating} scale={3} />
        ) : d.sealed ? (
          <Px name="lock" scale={2} />
        ) : (
          <span className="tag open">{t("открыт", "open")}</span>
        )}
      </div>
    </button>
  );
}
