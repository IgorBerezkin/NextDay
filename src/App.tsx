import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errText, type Day, type Overview } from "./api";
import { BoardScreen } from "./board/BoardScreen";
import { ClockScreen } from "./screens/ClockScreen";
import { DayScreen } from "./screens/DayScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { TomorrowScreen } from "./screens/TomorrowScreen";
import { setSoundEnabled } from "./sound";
import { Toasts } from "./ui/kit";
import { Sky } from "./ui/Sky";
import { TitleBar, type TabKey } from "./ui/TitleBar";

export type Route =
  | { name: "today" }
  | { name: "tomorrow" }
  | { name: "clock" }
  | { name: "history" }
  | { name: "day"; date: string }
  | { name: "board"; date: string }
  | { name: "settings" };

export type Nav = {
  ov: Overview;
  go: (r: Route) => void;
  refresh: () => Promise<Overview | null>;
  patchDay: (d: Day) => void;
};

function tabOf(r: Route, ov: Overview | null): TabKey | null {
  switch (r.name) {
    case "today":
    case "tomorrow":
    case "clock":
    case "history":
    case "settings":
      return r.name;
    case "day":
      return "history";
    case "board":
      return ov && (r.date === ov.today || r.date === ov.yesterday) ? "today" : "history";
  }
}

export default function App() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [route, setRoute] = useState<Route>({ name: "today" });
  const [fatal, setFatal] = useState<string | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

  const refresh = useCallback(async () => {
    try {
      const o = await api.overview();
      setOv(o);
      setSoundEnabled(o.settings.sounds);
      setFatal(null);
      return o;
    } catch (e) {
      setFatal(errText(e));
      return null;
    }
  }, []);

  const patchDay = useCallback((d: Day) => {
    setOv((o) => {
      if (!o) return o;
      if (d.date === o.today) return { ...o, todayDay: d };
      if (d.date === o.tomorrow) return { ...o, tomorrowDay: d };
      if (d.date === o.yesterday) return { ...o, yesterdayDay: d, yesterdayOpen: !d.result.sealed };
      return o;
    });
  }, []);

  const external = useCallback(
    async (where: string) => {
      const o = await refresh();
      if (where === "results" && o?.todayDay && !o.todayDay.result.sealed) setRoute({ name: "board", date: o.today });
      else if (where === "tomorrow") setRoute({ name: "tomorrow" });
      else if (where === "clock") setRoute({ name: "clock" });
      else if (where === "history") setRoute({ name: "history" });
      else if (where === "settings") setRoute({ name: "settings" });
      else setRoute({ name: "today" });
    },
    [refresh],
  );

  useEffect(() => {
    void refresh().then(async () => {
      const pending = await api.takePendingRoute();
      if (pending) void external(pending);
    });
    const subs: Promise<UnlistenFn>[] = [
      listen<string>("navigate", (e) => {
        void api.takePendingRoute();
        void external(e.payload);
      }),
      listen("day-changed", () => void refresh()),
      listen("settings-changed", () => void refresh()),
    ];
    const timer = window.setInterval(() => void refresh(), 30_000);
    const wake = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      subs.forEach((p) => void p.then((f) => f()));
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [refresh, external]);

  const go = useCallback((r: Route) => {
    setRoute(r);
  }, []);

  const hour = ov ? Number(ov.now.slice(11, 13)) : new Date().getHours();
  const nav: Nav | null = ov ? { ov, go, refresh, patchDay } : null;

  let screen: React.ReactNode = <div className="loading">Загрузка…</div>;
  if (fatal && !ov) screen = <div className="loading error">Не удалось загрузить данные: {fatal}</div>;
  else if (nav) {
    switch (route.name) {
      case "today":
        screen = <TodayScreen nav={nav} />;
        break;
      case "tomorrow":
        screen = <TomorrowScreen nav={nav} />;
        break;
      case "clock":
        screen = <ClockScreen nav={nav} />;
        break;
      case "history":
        screen = <HistoryScreen nav={nav} />;
        break;
      case "day":
        screen = <DayScreen nav={nav} date={route.date} key={route.date} />;
        break;
      case "board":
        screen = <BoardScreen nav={nav} date={route.date} key={route.date} />;
        break;
      case "settings":
        screen = <SettingsScreen nav={nav} />;
        break;
    }
  }

  return (
    <div className="app">
      <Sky hour={hour} />
      <TitleBar tab={tabOf(route, ov)} onTab={(t) => go({ name: t })} ov={ov} />
      <main className={`sheet panel route-${route.name}`}>{screen}</main>
      <Toasts />
    </div>
  );
}
