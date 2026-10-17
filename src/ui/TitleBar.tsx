import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, type Overview } from "../api";
import { t } from "../i18n";
import { plural } from "../util";
import type { IconName } from "./icons";
import { Px } from "./Px";

export type TabKey = "today" | "tomorrow" | "clock" | "map" | "goals" | "drill" | "history" | "settings";

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
  const streakDays = ov ? plural(ov.streak, "день", "дня", "дней", "named day", "named days") : "";
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
        {item("today", t("Сегодня", "Today"), "sun", needToday)}
        {item("tomorrow", t("Завтра", "Tomorrow"), "moon", needTomorrow)}
        {item("clock", t("Часы", "Clock"), "clock")}
        {item("map", t("Карта", "Map"), "map")}
        {item("goals", t("Цели", "Goals"), "flag")}
        {item("drill", t("Зубрилка", "Drill"), "cards")}
        {item("history", t("История", "History"), "calendar")}
        {item("settings", t("Настройки", "Settings"), "gear")}
      </nav>
      <div className="tb-space" data-tauri-drag-region />
      {ov && (
        <div
          className="streak"
          data-tauri-drag-region
          title={t(
            `Серия: ${streakDays} подряд с именем. Лучшая серия: ${ov.bestStreak}.`,
            `Streak: ${streakDays} in a row. Best streak: ${ov.bestStreak}.`,
          )}
        >
          <Px name="flame" scale={2} />
          <b data-tauri-drag-region>{ov.streak}</b>
        </div>
      )}
      <div className="winctl">
        <button onClick={() => void api.hideToTray()} title={t("Свернуть в трей", "Minimize to tray")}>
          <Px name="winMin" scale={1.2} />
        </button>
        <button onClick={() => void getCurrentWindow().toggleMaximize()} title={t("Развернуть", "Maximize")}>
          <Px name="winMax" scale={1.2} />
        </button>
        <button
          className="close"
          onClick={() => void api.hideToTray()}
          title={t("Спрятать в трей (выйти можно через меню значка в трее)", "Hide to tray (to quit, use the tray icon menu)")}
        >
          <Px name="winClose" scale={1.2} />
        </button>
      </div>
    </header>
  );
}
