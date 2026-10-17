import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { api, type DrillSessionView } from "../api";
import { t } from "../i18n";
import { setSoundEnabled } from "../sound";
import { Button, Progress } from "../ui/kit";
import { Px } from "../ui/Px";
import { DrillSession } from "./DrillSession";

export function DrillLock({ primary }: { primary: boolean }) {
  const [view, setView] = useState<DrillSessionView | null | undefined>(undefined);

  useEffect(() => {
    void api
      .overview()
      .then((o) => setSoundEnabled(o.settings.sounds))
      .catch(() => {});
    const load = () =>
      void api
        .drillSession()
        .then(setView)
        .catch(() => setView(null));
    load();
    const un = listen("drill-changed", () => {
      if (!primary) load();
    });
    const t = primary ? 0 : window.setInterval(load, 1500);
    return () => {
      void un.then((f) => f());
      if (t) clearInterval(t);
    };
  }, [primary]);

  if (view === undefined) return <div className="drill-lock" />;

  if (!view || (!primary && view.ended)) {
    return (
      <div className="drill-lock">
        <div className="drill-away">
          <p>{t("Сеанса нет.", "No session.")}</p>
          <Button kind="paper" onClick={() => void getCurrentWindow().close()}>
            {t("Закрыть", "Close")}
          </Button>
        </div>
      </div>
    );
  }

  if (!primary) {
    const value = view.goal === "correct" ? view.correct / view.amount : view.answered / view.amount;
    return (
      <div className="drill-lock dim">
        <div className="drill-away">
          <Px name="lock" scale={5} />
          <p>{t("Смотри на главный экран", "Look at the main screen")}</p>
          <span className="muted">
            {t(
              `${view.name}: верно ${view.correct}${view.goal === "correct" ? ` из ${view.amount}` : ""}`,
              `${view.name}: ${view.correct}${view.goal === "correct" ? ` of ${view.amount}` : ""} right`,
            )}
          </span>
          {view.goal !== "minutes" && <Progress value={value} cells={10} />}
        </div>
      </div>
    );
  }

  return (
    <div className="drill-lock">
      <DrillSession initial={view} lock onDone={() => void api.drillClose()} />
    </div>
  );
}
