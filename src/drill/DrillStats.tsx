import type { DrillOverview } from "../api";
import { Px } from "../ui/Px";
import { stamp } from "../util";
import { Boxes } from "./DrillDecks";
import { Code, OUTCOME, Prompt, spent, Stat } from "./drillKit";
import { Markdown } from "./Markdown";

export function DrillStats({ ov }: { ov: DrillOverview }) {
  const acc = ov.today.answers ? Math.round((ov.today.correct / ov.today.answers) * 100) : null;
  return (
    <>
      <div className="drill-stats big">
        <Stat label="дней подряд" value={ov.streak} sub={`лучшая серия ${ov.bestStreak}`} />
        <Stat label="сеансов сегодня" value={ov.today.sessions} />
        <Stat label="ответов сегодня" value={ov.today.answers} sub={acc !== null ? `${acc}% верно` : undefined} />
        <Stat label="к повтору" value={ov.due} />
      </div>

      <section className="card">
        <h2 className="card-title">
          <Px name="map" scale={2} /> Темы
        </h2>
        <table className="drill-table">
          <thead>
            <tr>
              <th>Тема</th>
              <th>Открыта</th>
              <th>Встречалось</th>
              <th>Верно из последних</th>
              <th>Коробки</th>
            </tr>
          </thead>
          <tbody>
            {ov.decks.flatMap((d) =>
              d.topics.map((t) => (
                <tr key={`${d.id}:${t.id}`}>
                  <td>
                    {ov.decks.length > 1 && <span className="muted">{d.title}: </span>}
                    {t.title}
                  </td>
                  <td>{t.open ? "да" : "нет"}</td>
                  <td>
                    {t.seen} из {t.cards}
                  </td>
                  <td>{t.recent ? `${t.recentRight} из ${t.recent} (${Math.round((t.recentRight / t.recent) * 100)}%)` : "нет ответов"}</td>
                  <td>
                    <Boxes boxes={t.boxes} />
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="card-title">
          <Px name="cross" scale={2} /> Частые ошибки
        </h2>
        {ov.weak.length === 0 && <p className="muted">Промахов пока нет.</p>}
        {ov.weak.map((w) => (
          <div key={`${w.deck}:${w.card}`} className="drill-weak">
            <div className="row">
              {w.topic && <span className="drill-chip">{w.topic}</span>}
              <span className="muted">
                мимо {w.wrong}, верно {w.right}, коробка {w.level}
              </span>
            </div>
            {w.code && <Code code={w.code} />}
            <p className="drill-q">
              <Prompt text={w.prompt} />
            </p>
            <div className="drill-row">
              <span className="muted">Правильно:</span> <code className="drill-ans">{w.answer}</code>
            </div>
            {w.lastWrong.length > 0 && (
              <div className="drill-row">
                <span className="muted">Ты отвечал:</span>
                {w.lastWrong.map((x, i) => (
                  <code key={i} className="drill-given">
                    {x}
                  </code>
                ))}
              </div>
            )}
            {w.rule && (
              <div className="drill-rule">
                <Markdown text={w.rule} />
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="card-title">
          <Px name="calendar" scale={2} /> Сеансы
        </h2>
        {ov.sessions.length === 0 ? (
          <p className="muted">Сеансов ещё не было.</p>
        ) : (
          <table className="drill-table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Режим</th>
                <th>Итог</th>
                <th>Верно</th>
                <th>С первого раза</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {ov.sessions.map((r) => (
                <tr key={r.id} className={`drill-out-${r.outcome}`}>
                  <td>{stamp(r.endedAt)}</td>
                  <td>{r.name}</td>
                  <td>{OUTCOME[r.outcome]}</td>
                  <td>
                    {r.correct} из {r.answered}
                  </td>
                  <td>{r.firstTry}</td>
                  <td>{spent(r.seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
