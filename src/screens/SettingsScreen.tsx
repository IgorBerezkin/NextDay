import { listen } from "@tauri-apps/api/event";
import { openPath } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import type { Nav } from "../App";
import { api, type McpInfo, type Settings, type UpdateStatus } from "../api";
import { t, type Lang } from "../i18n";
import { Button, Check, toast, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { stamp } from "../util";

const pad = (n: number) => String(n).padStart(2, "0");

export function SettingsScreen({ nav }: { nav: Nav }) {
  const { ov, refresh } = nav;
  const [s, setS] = useState<Settings>(ov.settings);
  const [auto, setAuto] = useState(ov.autostart);

  useEffect(() => setS(ov.settings), [ov.settings]);
  useEffect(() => setAuto(ov.autostart), [ov.autostart]);

  const save = async (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    try {
      await api.saveSettings(next);
      await refresh();
    } catch (e) {
      toastError(e);
      setS(s);
    }
  };

  return (
    <div className="screen settings">
      <h1 className="screen-title">{t("Настройки", "Settings")}</h1>
      <div className="settings-grid">
        <section className="card">
          <h2 className="card-title">
            <Px name="globe" scale={2} /> Язык / Language
          </h2>
          <select className="field select" value={s.language} onChange={(e) => void save({ language: e.target.value as Lang })}>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </section>

        <section className="card">
          <h2 className="card-title">
            <Px name="sun" scale={2} /> {t("Запуск", "Startup")}
          </h2>
          <Check
            checked={auto}
            label={t("Запускать вместе с Windows", "Start with Windows")}
            onChange={async (v) => {
              try {
                setAuto(await api.setAutostart(v));
              } catch (e) {
                toastError(e);
              }
            }}
          />
          <p className="muted">
            {t(
              "При входе в систему приложение тихо появится в трее (без окна) и напомнит о дне.",
              "At sign-in the app quietly starts in the tray (no window) and reminds you of the day.",
            )}
          </p>
          <p className="muted">
            {t(
              "Кнопки «_» и «×» прячут окно в трей. Совсем выйти можно через меню значка в трее или кнопкой ниже.",
              'The "_" and "×" buttons hide the window in the tray. To fully quit, use the tray icon menu or the button below.',
            )}
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">
            <Px name="clock" scale={2} /> {t("Сутки", "Day")}
          </h2>
          <div className="row">
            <span>{t("Новый день начинается в", "New day starts at")}</span>
            <select className="field select" value={s.dayStartHour} onChange={(e) => void save({ dayStartHour: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 5, 6].map((h) => (
                <option key={h} value={h}>
                  {pad(h)}:00
                </option>
              ))}
            </select>
          </div>
          <p className="muted">
            {t(
              "Для тех, кто ложится после полуночи: в половине второго ночи ещё идёт «сегодня», и «завтра» означает действительно завтрашний день.",
              'For those who go to bed after midnight: at 1:30 am it is still "today", and "tomorrow" really means the next day.',
            )}
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">
            <Px name="bell" scale={2} /> {t("Напоминания", "Reminders")}
          </h2>
          <div className="row">
            <Check
              checked={s.eveningEnabled}
              onChange={(v) => void save({ eveningEnabled: v })}
              label={t("Вечером в", "In the evening at")}
            />
            <TimeField value={s.eveningTime} onChange={(t) => void save({ eveningTime: t })} />
          </div>
          <p className="muted">{t("Назвать завтрашний день и подвести итоги сегодняшнего.", "Name tomorrow and sum up today.")}</p>
          <div className="row">
            <span>{t("Если не сделано, повторить", "If not done, repeat")}</span>
            <select
              className="field select"
              value={s.eveningRepeatMin}
              onChange={(e) => void save({ eveningRepeatMin: Number(e.target.value) })}
            >
              <option value={0}>{t("не повторять", "don't repeat")}</option>
              <option value={30}>{t("через 30 мин", "in 30 min")}</option>
              <option value={60}>{t("через 1 ч", "in 1 h")}</option>
              <option value={90}>{t("через 1,5 ч", "in 1.5 h")}</option>
              <option value={120}>{t("через 2 ч", "in 2 h")}</option>
            </select>
          </div>
          <div className="row">
            <Check
              checked={s.morningEnabled}
              onChange={(v) => void save({ morningEnabled: v })}
              label={t("Утром в", "In the morning at")}
            />
            <TimeField value={s.morningTime} onChange={(t) => void save({ morningTime: t })} />
          </div>
          <p className="muted">
            {t("Как называется сегодняшний день и сколько в нём пунктов.", "Today's name and how many items it has.")}
          </p>
          <Check
            checked={s.taskAlerts}
            onChange={(v) => void save({ taskAlerts: v })}
            label={t("Когда наступает час задачи", "When a task's time comes")}
          />
          <p className="muted">
            {t(
              "Если у пункта чеклиста стоит время, в этот час придёт напоминание «Пора».",
              "If a checklist item has a time, you get a reminder at that hour.",
            )}
          </p>
          <Button
            kind="paper"
            icon="bell"
            onClick={async () => {
              try {
                await api.testNotification();
                toast(t("Уведомление отправлено, посмотрите в угол экрана.", "Notification sent, check the corner of your screen."));
              } catch (e) {
                toastError(e);
              }
            }}
          >
            {t("Проверить уведомление", "Test notification")}
          </Button>
        </section>

        <section className="card">
          <h2 className="card-title">
            <Px name="gear" scale={2} /> {t("Разное", "Other")}
          </h2>
          <Check checked={s.sounds} onChange={(v) => void save({ sounds: v })} label={t("8-битные звуки", "8-bit sounds")} />
          <div className="data-dir">
            <span className="muted">{t("Данные лежат здесь:", "Data is stored here:")}</span>
            <code>{ov.dataDir}</code>
          </div>
          <div className="row">
            <Button kind="paper" icon="folder" onClick={() => void openPath(ov.dataDir).catch(toastError)}>
              {t("Открыть папку", "Open folder")}
            </Button>
            <Button kind="danger" icon="cross" onClick={() => void api.quit()}>
              {t("Выйти из приложения", "Quit the app")}
            </Button>
          </div>
        </section>

        <UpdateCard auto={s.autoUpdate} onAuto={(v) => void save({ autoUpdate: v })} version={ov.version} />
        <McpCard />

        {ov.debug && <DebugCard nav={nav} />}
      </div>
      <p className="about">
        Next Day {ov.version} · {t("шрифты Press Start 2P, Tiny5 и Galmuri (SIL OFL)", "fonts Press Start 2P, Tiny5 and Galmuri (SIL OFL)")}
      </p>
    </div>
  );
}

function McpCard() {
  const [info, setInfo] = useState<McpInfo | null>(null);

  useEffect(() => {
    api.mcpInfo().then(setInfo, toastError);
  }, []);

  const toggle = async (v: boolean) => {
    try {
      setInfo(await api.setMcpEnabled(v));
    } catch (e) {
      toastError(e);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t(`${what} скопирована.`, `${what} copied.`), "good");
    } catch (e) {
      toastError(e);
    }
  };

  if (!info) return null;
  const claudeCode =
    info.url && info.token ? `claude mcp add --scope user --transport http next-day ${info.url} --header "Authorization: Bearer ${info.token}"` : "";
  const desktop = JSON.stringify({ mcpServers: { "next-day": { command: info.exe, args: ["--mcp"] } } }, null, 2);
  return (
    <section className="card">
      <h2 className="card-title">
        <Px name="flag" scale={2} /> {t("ИИ через MCP", "AI over MCP")}
      </h2>
      <Check
        checked={info.enabled}
        label={t("Разрешить ИИ работать с Next Day", "Let AI work with Next Day")}
        onChange={(v) => void toggle(v)}
      />
      <p className="muted">
        {t(
          "Claude и другие ИИ-клиенты смогут читать историю дней, составлять черновики целей, править карту тем, записывать результаты и собирать наборы для зубрилки. Черновик цели заработает, только когда ты его примешь. Всё, что ИИ прочитает, попадёт в его чат.",
          "Claude and other AI clients can read your day history, draft goals, edit the topic map, record results and build drill decks. A goal draft starts working only after you accept it. Everything the AI reads ends up in its chat.",
        )}
      </p>
      {info.error && <p className="mcp-error">{info.error}</p>}
      {info.running && info.url && (
        <>
          <p className="muted">
            {t(
              `Сервер работает на ${info.url} и доступен только с этого компьютера.`,
              `The server runs at ${info.url} and is only reachable from this computer.`,
            )}
          </p>
          <div className="mcp-actions">
            <Button
              kind="paper"
              small
              icon="link"
              onClick={() => void copy(claudeCode, t("Команда для Claude Code", "Claude Code command"))}
            >
              {t("Команда для Claude Code", "Claude Code command")}
            </Button>
            <Button
              kind="paper"
              small
              icon="folder"
              onClick={() => void copy(desktop, t("Настройка для Claude Desktop", "Claude Desktop config"))}
            >
              {t("Настройка для Claude Desktop", "Claude Desktop config")}
            </Button>
          </div>
          <p className="hint">
            {t(
              "Команду выполни в терминале, настройку добавь в claude_desktop_config.json. Потом попроси Claude: «составь мне цель в Next Day».",
              'Run the command in a terminal and add the config to claude_desktop_config.json. Then ask Claude: "make me a goal in Next Day".',
            )}
          </p>
        </>
      )}
    </section>
  );
}

function UpdateCard({ auto, onAuto, version }: { auto: boolean; onAuto: (v: boolean) => void; version: string }) {
  const [u, setU] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    api.updateStatus().then(setU).catch(toastError);
    const off = listen<UpdateStatus>("update-changed", (e) => setU(e.payload));
    return () => void off.then((f) => f());
  }, []);

  const busy = u?.phase === "checking" || u?.phase === "downloading" || u?.phase === "installing";
  const note = u ? updateNote(u, auto) : "";
  return (
    <section className="card">
      <h2 className="card-title">
        <Px name="refresh" scale={2} /> {t("Обновления", "Updates")}
      </h2>
      <Check checked={auto} disabled={!u?.allowed} onChange={onAuto} label={t("Обновлять автоматически", "Update automatically")} />
      <p className="muted">
        {t(
          "Раз в несколько часов Next Day смотрит, не вышла ли новая версия. Она скачивается сама и ставится, пока окно спрятано в трей.",
          "Every few hours Next Day checks for a new version. It downloads by itself and installs while the window is hidden in the tray.",
        )}
      </p>
      <div className="row">
        <span>{t(`Версия ${version}`, `Version ${version}`)}</span>
        {u?.allowed && (
          <Button kind="paper" small icon="refresh" disabled={busy} onClick={() => void api.checkUpdate().catch(toastError)}>
            {t("Проверить", "Check")}
          </Button>
        )}
      </div>
      {note && <p className={`update-note${u?.phase === "failed" ? " bad" : ""}`}>{note}</p>}
      {u?.phase === "ready" && (
        <Button kind="green" icon="refresh" onClick={() => void api.installUpdate().catch(toastError)}>
          {t("Обновить сейчас", "Update now")}
        </Button>
      )}
    </section>
  );
}

function updateNote(u: UpdateStatus, auto: boolean) {
  if (!u.allowed) return t("Обновления работают только в установленной программе.", "Updates work only in the installed app.");
  switch (u.phase) {
    case "checking":
      return t("Проверяю…", "Checking...");
    case "downloading":
      return t(`Скачиваю версию ${u.version}…`, `Downloading version ${u.version}...`);
    case "ready":
      return auto
        ? t(
            `Версия ${u.version} скачана и встанет, когда окно спрячется в трей.`,
            `Version ${u.version} is downloaded and will install when the window hides in the tray.`,
          )
        : t(`Версия ${u.version} скачана.`, `Version ${u.version} is downloaded.`);
    case "installing":
      return t("Ставлю обновление, Next Day сейчас перезапустится.", "Installing the update, Next Day will restart now.");
    case "latest":
      return t("У вас последняя версия.", "You have the latest version.");
    case "failed":
      return u.error ?? t("Обновиться не получилось.", "The update failed.");
    default:
      return "";
  }
}

function TimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="field time"
      type="time"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v && v !== value && onChange(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function DebugCard({ nav }: { nav: Nav }) {
  const shift = async (min: number) => {
    try {
      await api.debugShift(min);
      await nav.refresh();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <section className="card debug">
      <h2 className="card-title">
        <Px name="clock" scale={2} /> {t("Отладка времени", "Time debug")}
      </h2>
      <p>
        {t(
          <>
            Часы приложения: <b>{stamp(nav.ov.now)}</b> · логический день {nav.ov.today}
          </>,
          <>
            App clock: <b>{stamp(nav.ov.now)}</b> · logical day {nav.ov.today}
          </>,
        )}
      </p>
      <div className="row wrap">
        <Button small kind="paper" onClick={() => void shift(-1440)}>
          {t("−1 день", "−1 day")}
        </Button>
        <Button small kind="paper" onClick={() => void shift(60)}>
          {t("+1 ч", "+1 h")}
        </Button>
        <Button small kind="paper" onClick={() => void shift(180)}>
          {t("+3 ч", "+3 h")}
        </Button>
        <Button small kind="paper" onClick={() => void shift(1440)}>
          {t("+1 день", "+1 day")}
        </Button>
        <Button small kind="paper" onClick={() => void api.debugTick().then(() => nav.refresh())}>
          {t("Тик планировщика", "Scheduler tick")}
        </Button>
      </div>
    </section>
  );
}
