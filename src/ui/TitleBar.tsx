import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, type Overview } from "../api";
import { plural } from "../util";
import type { IconName } from "./icons";
import { Px } from "./Px";

export type TabKey = "today" | "tomorrow" | "history" | "settings";

export function TitleBar({
  tab,
  onTab,
  ov,
}: {
  tab: TabKey | null;
  onTab: (t: TabKey) => void;
  ov: Overview | null;
}) {
  const needTomorrow = !!ov && !ov.tomorrowDay && ov.evening;
  const needToday = !!ov && ov.evening && !!ov.todayDay && !ov.todayDay.result.sealed;
  const item = (key: TabKey, label: string, icon: IconName, badge = false) => (
    <button
      className={`tab${tab === key ? " active" : ""}`}
      onClick={() => onTab(key)}
      title={label}
      data-tab={key}
    >
      <Px name={icon} scale={2} />
      {key !== "settings" && <span>{label}</span>}
      {badge && <i className="badge" />}
    </button>
  );
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <Px name="moonColor" scale={2} />
        <span data-tauri-drag-region>NEXT DAY</span>
      </div>
      <nav className="tabs">
        {item("today", "Сегодня", "sun", needToday)}
        {item("tomorrow", "Завтра", "moon", needTomorrow)}
        {item("history", "История", "calendar")}
        {item("settings", "Настройки", "gear")}
      </nav>
      <div className="tb-space" data-tauri-drag-region />
      {ov && (
        <div
          className="streak"
          data-tauri-drag-region
          title={`Серия: ${plural(ov.streak, "день", "дня", "дней")} подряд с именем. Лучшая серия: ${ov.bestStreak}.`}
        >
          <Px name="flame" scale={2} />
          <b data-tauri-drag-region>{ov.streak}</b>
        </div>
      )}
      <div className="winctl">
        <button onClick={() => void api.hideToTray()} title="Свернуть в трей">
          <Px name="winMin" scale={1.2} />
        </button>
        <button onClick={() => void getCurrentWindow().toggleMaximize()} title="Развернуть">
          <Px name="winMax" scale={1.2} />
        </button>
        <button className="close" onClick={() => void api.hideToTray()} title="Спрятать в трей (выйти можно через меню значка в трее)">
          <Px name="winClose" scale={1.2} />
        </button>
      </div>
    </header>
  );
}
