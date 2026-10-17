import type { DrillOverview } from "../api";
import { t } from "../i18n";
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
        <Stat
          label={t("дней подряд", "days in a row")}
          value={ov.streak}
          sub={t(`лучшая серия ${ov.bestStreak}`, `best streak ${ov.bestStreak}`)}
        />
        <Stat label={t("сеансов сегодня", "sessions today")} value={ov.today.sessions} />
        <Stat
          label={t("ответов сегодня", "answers today")}
          value={ov.today.answers}
          sub={acc !== null ? t(`${acc}% верно`, `${acc}% right`) : undefined}
        />
        <Stat label={t("к повтору", "due")} value={ov.due} />
      </div>

      <section className="card">
        <h2 className="card-title">
          <Px name="map" scale={2} /> {t("Темы", "Topics")}
        </h2>
        <table className="drill-table">
          <thead>
            <tr>
              <th>{t("Тема", "Topic")}</th>
              <th>{t("Открыта", "Open")}</th>
              <th>{t("Встречалось", "Seen")}</th>
              <th>{t("Верно из последних", "Recent right")}</th>
              <th>{t("Коробки", "Boxes")}</th>
            </tr>
          </thead>
          <tbody>
            {ov.decks.flatMap((d) =>
              d.topics.map((topic) => (
                <tr key={`${d.id}:${topic.id}`}>
                  <td>
                    {ov.decks.length > 1 && <span className="muted">{d.title}: </span>}
                    {topic.title}
                  </td>
                  <td>{topic.open ? t("да", "yes") : t("нет", "no")}</td>
                  <td>
                    {topic.seen} {t("из", "of")} {topic.cards}
                  </td>
                  <td>
                    {topic.recent
                      ? `${topic.recentRight} ${t("из", "of")} ${topic.recent} (${Math.round((topic.recentRight / topic.recent) * 100)}%)`
                      : t("нет ответов", "no answers")}
                  </td>
                  <td>
                    <Boxes boxes={topic.boxes} />
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="card-title">
          <Px name="cross" scale={2} /> {t("Частые ошибки", "Common mistakes")}
        </h2>
        {ov.weak.length === 0 && <p className="muted">{t("Промахов пока нет.", "No misses yet.")}</p>}
        {ov.weak.map((w) => (
          <div key={`${w.deck}:${w.card}`} className="drill-weak">
            <div className="row">
              {w.topic && <span className="drill-chip">{w.topic}</span>}
              <span className="muted">
                {t(`мимо ${w.wrong}, верно ${w.right}, коробка ${w.level}`, `missed ${w.wrong}, right ${w.right}, box ${w.level}`)}
              </span>
            </div>
            {w.code && <Code code={w.code} />}
            <p className="drill-q">
              <Prompt text={w.prompt} />
            </p>
            <div className="drill-row">
              <span className="muted">{t("Правильно:", "Right answer:")}</span> <code className="drill-ans">{w.answer}</code>
            </div>
            {w.lastWrong.length > 0 && (
              <div className="drill-row">
                <span className="muted">{t("Ты отвечал:", "You answered:")}</span>
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
          <Px name="calendar" scale={2} /> {t("Сеансы", "Sessions")}
        </h2>
        {ov.sessions.length === 0 ? (
          <p className="muted">{t("Сеансов ещё не было.", "No sessions yet.")}</p>
        ) : (
          <table className="drill-table">
            <thead>
              <tr>
                <th>{t("Когда", "When")}</th>
                <th>{t("Режим", "Mode")}</th>
                <th>{t("Итог", "Result")}</th>
                <th>{t("Верно", "Right")}</th>
                <th>{t("С первого раза", "First try")}</th>
                <th>{t("Время", "Time")}</th>
              </tr>
            </thead>
            <tbody>
              {ov.sessions.map((r) => (
                <tr key={r.id} className={`drill-out-${r.outcome}`}>
                  <td>{stamp(r.endedAt)}</td>
                  <td>{r.name}</td>
                  <td>{OUTCOME[r.outcome]}</td>
                  <td>
                    {r.correct} {t("из", "of")} {r.answered}
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
