import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { errText } from "../api";
import { t } from "../i18n";
import { sfx } from "../sound";
import { Button, Check, Progress } from "../ui/kit";
import { Px } from "../ui/Px";
import { Sky } from "../ui/Sky";
import appIcon from "../../src-tauri/icons/icon-32.png";

type Info = {
  uninstall: boolean;
  version: string;
  installDir: string;
  defaultDir: string;
  installedVersion: string | null;
  desktopShortcut: boolean;
  autostart: boolean;
  sizeMb: number;
  dataDir: string;
  dataExists: boolean;
};

type Step = { label: string; state: "wait" | "run" | "done" | "fail" };
type DirCheck = { path: string; hasOtherFiles: boolean };
type DirMsg = { bad: boolean; text: string };

const parentOf = (p: string) => p.replace(/[\\/]+$/, "").replace(/[\\/][^\\/]*$/, "") || p;
type Phase = "form" | "work" | "done" | "error";

export default function Installer() {
  const [info, setInfo] = useState<Info | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [desktop, setDesktop] = useState(true);
  const [autostart, setAutostart] = useState(true);
  const [removeData, setRemoveData] = useState(false);
  const [launch, setLaunch] = useState(true);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState("");
  const [dir, setDir] = useState("");
  const [dirMsg, setDirMsg] = useState<DirMsg | null>(null);

  useEffect(() => {
    invoke<Info>("setup_info").then((i) => {
      setInfo(i);
      setDir(i.installDir);
      document.title = i.uninstall ? t("Удаление Next Day", "Uninstall Next Day") : t("Установка Next Day", "Next Day Setup");
      if (i.installedVersion) {
        setDesktop(i.desktopShortcut);
        setAutostart(i.autostart);
      }
    });
    const un = listen<Step[]>("setup-steps", (e) => setSteps(e.payload));
    return () => void un.then((f) => f());
  }, []);

  const verifyDir = useCallback(async (value: string): Promise<string | null> => {
    try {
      const c = await invoke<DirCheck>("check_dir", { path: value });
      setDir(c.path);
      setDirMsg(
        c.hasOtherFiles
          ? {
              bad: false,
              text: t(
                "В этой папке уже есть другие файлы. Next Day положит рядом свои и при удалении уберёт только их.",
                "This folder already has other files. Next Day will add its own and remove only those on uninstall.",
              ),
            }
          : null,
      );
      return c.path;
    } catch (e) {
      setDirMsg({ bad: true, text: errText(e) });
      return null;
    }
  }, []);

  const browse = async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: t("Куда установить Next Day", "Where to install Next Day"),
        defaultPath: parentOf(dir),
      });
      if (typeof picked === "string") await verifyDir(picked);
    } catch (e) {
      setDirMsg({ bad: true, text: errText(e) });
    }
  };

  const run = useCallback(async () => {
    if (!info) return;
    let target: string | null = null;
    if (!info.uninstall) {
      target = await verifyDir(dir);
      if (!target) {
        sfx.error();
        return;
      }
    }
    setPhase("work");
    setSteps([]);
    try {
      if (info.uninstall) await invoke("uninstall", { removeData });
      else await invoke("install", { opts: { desktop, autostart, dir: target } });
      sfx.seal();
      setPhase("done");
    } catch (e) {
      sfx.error();
      setError(errText(e));
      setPhase("error");
    }
  }, [info, desktop, autostart, removeData, dir, verifyDir]);

  const finish = useCallback(async () => {
    if (info && !info.uninstall && phase === "done" && launch) {
      try {
        await invoke("launch_app");
      } catch (e) {
        setError(errText(e));
        setPhase("error");
        return;
      }
    }
    await invoke("finish");
  }, [info, phase, launch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "work") return;
      if (e.key === "Escape") void invoke("finish");
      if (e.key === "Enter") {
        if (phase === "form") void run();
        else void finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, run, finish]);

  const uninstall = !!info?.uninstall;
  const done = steps.filter((s) => s.state === "done").length;

  return (
    <div className="setup">
      <Sky hour={new Date().getHours()} />
      <header className="setup-bar" data-tauri-drag-region>
        <Px name="moonColor" scale={2} />
        <span className="setup-brand" data-tauri-drag-region>
          NEXT DAY
        </span>
        <span className="setup-tag">{uninstall ? t("удаление", "uninstall") : t("установка", "setup")}</span>
        <span className="grow" data-tauri-drag-region />
        <button className="setup-close" disabled={phase === "work"} onClick={() => void invoke("finish")} title={t("Закрыть", "Close")}>
          <Px name="winClose" scale={1.2} />
        </button>
      </header>

      <main className="setup-card panel">
        {!info && <p className="muted">…</p>}

        {info && phase === "form" && !uninstall && (
          <>
            <div className="setup-hero">
              <img className="setup-logo" src={appIcon} alt="" />
              <div>
                <h1>Next Day</h1>
                <p>
                  {t(
                    "Вечером называешь завтрашний день, днём отмечаешь чеклист, вечером запечатываешь итоги.",
                    "Name tomorrow in the evening, tick off the checklist by day, seal the results at night.",
                  )}
                </p>
                {info.installedVersion ? (
                  <p className="setup-note">
                    {t(
                      `Уже стоит ${info.installedVersion}. Обновлю, дни и доски не трону.`,
                      `Version ${info.installedVersion} is already installed. I'll update it and keep your days and boards.`,
                    )}
                  </p>
                ) : (
                  <p className="muted">
                    {t(
                      `Версия ${info.version} · ${String(info.sizeMb).replace(".", ",")} МБ · без прав администратора`,
                      `Version ${info.version} · ${info.sizeMb} MB · no admin rights needed`,
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="setup-opts">
              <Check checked={desktop} onChange={setDesktop} label={t("Значок на рабочем столе", "Desktop shortcut")} />
              <Check checked={autostart} onChange={setAutostart} label={t("Запускать вместе с Windows", "Start with Windows")} />
            </div>
            <div className="setup-dir">
              <span className="setup-label">{t("Папка установки", "Install folder")}</span>
              <div className="setup-dir-row">
                <input
                  className={`field${dirMsg?.bad ? " bad" : ""}`}
                  value={dir}
                  spellCheck={false}
                  onChange={(e) => {
                    setDir(e.target.value);
                    setDirMsg(null);
                  }}
                  onBlur={() => void verifyDir(dir)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      void verifyDir(dir);
                    }
                  }}
                />
                <Button kind="paper" icon="folder" onClick={() => void browse()}>
                  {t("Обзор…", "Browse")}
                </Button>
              </div>
              {dirMsg && <p className={`setup-dir-msg${dirMsg.bad ? " bad" : ""}`}>{dirMsg.text}</p>}
              {!dirMsg && info.installedVersion && dir !== info.installDir && (
                <p className="setup-dir-msg">
                  {t("Перенесу программу сюда, старая папка освободится.", "I'll move the app here and clean up the old folder.")}
                </p>
              )}
            </div>
            <div className="setup-foot">
              {dir !== info.defaultDir && (
                <button className="setup-link" onClick={() => void verifyDir(info.defaultDir)}>
                  {t("папка по умолчанию", "default folder")}
                </button>
              )}
              <span className="grow" />
              <Button icon="check" disabled={!!dirMsg?.bad} onClick={() => void run()}>
                {info.installedVersion ? t("Обновить", "Update") : t("Установить", "Install")}
              </Button>
            </div>
          </>
        )}

        {info && phase === "form" && uninstall && (
          <>
            <div className="setup-hero">
              <img className="setup-logo" src={appIcon} alt="" />
              <div>
                <h1>{t("Удалить Next Day?", "Uninstall Next Day?")}</h1>
                <p>{t("Уберу программу, значки и автозапуск.", "I'll remove the app, its shortcuts and autostart.")}</p>
              </div>
            </div>
            <div className="setup-opts">
              <Check
                checked={removeData}
                onChange={setRemoveData}
                label={t("Удалить и мои дни, доски и картинки", "Also delete your days, boards and images")}
              />
              <p className="muted small-path">{info.dataDir}</p>
            </div>
            <div className="setup-foot">
              <span className="grow" />
              <Button kind="paper" onClick={() => void invoke("finish")}>
                {t("Отмена", "Cancel")}
              </Button>
              <Button kind="danger" icon="trash" onClick={() => void run()}>
                {t("Удалить", "Uninstall")}
              </Button>
            </div>
          </>
        )}

        {phase === "work" && (
          <div className="setup-work">
            <h2>{uninstall ? t("Удаляю…", "Uninstalling") : t("Устанавливаю…", "Installing")}</h2>
            <Progress value={steps.length ? done / steps.length : 0} />
            <ul className="setup-steps">
              {steps.map((s, i) => (
                <li key={i} className={s.state}>
                  <i>{s.state === "done" ? <Px name="check" scale={1.5} /> : s.state === "run" ? "▸" : ""}</i>
                  {s.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {info && phase === "done" && !uninstall && (
          <div className="setup-done">
            <div className="stamp">{t("УСТАНОВЛЕНО", "INSTALLED")}</div>
            <p>{t("Спасибо за установку! Всё готово :)", "Thanks for installing! All set :)")}</p>
            <div className="setup-foot">
              <Check checked={launch} onChange={setLaunch} label={t("Запустить Next Day", "Launch Next Day")} />
              <span className="grow" />
              <Button icon="arrowR" onClick={() => void finish()}>
                {t("Готово", "Done")}
              </Button>
            </div>
          </div>
        )}

        {info && phase === "done" && uninstall && (
          <div className="setup-done">
            <div className="stamp">{t("УДАЛЕНО", "UNINSTALLED")}</div>
            <p>
              {removeData || !info.dataExists
                ? t("Next Day удалён полностью.", "Next Day is fully removed.")
                : t(
                    `Программа удалена. Ваши дни остались в ${info.dataDir}, при новой установке всё вернётся.`,
                    `The app is removed. Your days stay in ${info.dataDir} and come back when you install again.`,
                  )}
            </p>
            <div className="setup-foot">
              <span className="grow" />
              <Button onClick={() => void finish()}>{t("Закрыть", "Close")}</Button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="setup-done">
            <h2 className="setup-error-title">{t("Не получилось", "Something went wrong")}</h2>
            <p className="setup-error">{error}</p>
            <div className="setup-foot">
              <span className="grow" />
              <Button kind="paper" onClick={() => void invoke("finish")}>
                {t("Закрыть", "Close")}
              </Button>
              <Button onClick={() => void run()}>{t("Попробовать ещё раз", "Try again")}</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
