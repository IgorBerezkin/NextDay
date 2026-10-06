import { openPath } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import type { Nav } from "../App";
import { api, type Settings } from "../api";
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
      <h1 className="screen-title">Настройки</h1>
      <div className="settings-grid">
        <section className="card">
          <h2 className="card-title">
            <Px name="sun" scale={2} /> Запуск
          </h2>
          <Check
            checked={auto}
            label="Запускать вместе с Windows"
            onChange={async (v) => {
              try {
                setAuto(await api.setAutostart(v));
              } catch (e) {
                toastError(e);
              }
            }}
          />
          <p className="muted">При входе в систему приложение тихо появится в трее (без окна) и напомнит о дне.</p>
          <p className="muted">
            Кнопки «_» и «×» прячут окно в трей. Совсем выйти можно через меню значка в трее или кнопкой ниже.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">
            <Px name="clock" scale={2} /> Сутки
          </h2>
          <div className="row">
            <span>Новый день начинается в</span>
            <select className="field select" value={s.dayStartHour} onChange={(e) => void save({ dayStartHour: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 5, 6].map((h) => (
                <option key={h} value={h}>
                  {pad(h)}:00
                </option>
              ))}
            </select>
          </div>
          <p className="muted">
            Для тех, кто ложится после полуночи: в половине второго ночи ещё идёт «сегодня», и «завтра» означает действительно
            завтрашний день.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">
            <Px name="bell" scale={2} /> Напоминания
          </h2>
          <div className="row">
            <Check checked={s.eveningEnabled} onChange={(v) => void save({ eveningEnabled: v })} label="Вечером в" />
            <TimeField value={s.eveningTime} onChange={(t) => void save({ eveningTime: t })} />
          </div>
          <p className="muted">Назвать завтрашний день и подвести итоги сегодняшнего.</p>
          <div className="row">
            <span>Если не сделано, повторить</span>
            <select
              className="field select"
              value={s.eveningRepeatMin}
              onChange={(e) => void save({ eveningRepeatMin: Number(e.target.value) })}
            >
              <option value={0}>не повторять</option>
              <option value={30}>через 30 мин</option>
              <option value={60}>через 1 ч</option>
              <option value={90}>через 1,5 ч</option>
              <option value={120}>через 2 ч</option>
            </select>
          </div>
          <div className="row">
            <Check checked={s.morningEnabled} onChange={(v) => void save({ morningEnabled: v })} label="Утром в" />
            <TimeField value={s.morningTime} onChange={(t) => void save({ morningTime: t })} />
          </div>
          <p className="muted">Как называется сегодняшний день и сколько в нём пунктов.</p>
          <Button
            kind="paper"
            icon="bell"
            onClick={async () => {
              try {
                await api.testNotification();
                toast("Уведомление отправлено, посмотрите в угол экрана.");
              } catch (e) {
                toastError(e);
              }
            }}
          >
            Проверить уведомление
          </Button>
        </section>

        <section className="card">
          <h2 className="card-title">
            <Px name="gear" scale={2} /> Разное
          </h2>
          <Check checked={s.sounds} onChange={(v) => void save({ sounds: v })} label="8-битные звуки" />
          <div className="data-dir">
            <span className="muted">Данные лежат здесь:</span>
            <code>{ov.dataDir}</code>
          </div>
          <div className="row">
            <Button kind="paper" icon="folder" onClick={() => void openPath(ov.dataDir).catch(toastError)}>
              Открыть папку
            </Button>
            <Button kind="danger" icon="cross" onClick={() => void api.quit()}>
              Выйти из приложения
            </Button>
          </div>
        </section>

        {ov.debug && <DebugCard nav={nav} />}
      </div>
      <p className="about">Next Day 0.1 · шрифты Press Start 2P и Tiny5 (SIL OFL)</p>
    </div>
  );
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
        <Px name="clock" scale={2} /> Отладка времени
      </h2>
      <p>
        Часы приложения: <b>{stamp(nav.ov.now)}</b> · логический день {nav.ov.today}
      </p>
      <div className="row wrap">
        <Button small kind="paper" onClick={() => void shift(-1440)}>
          −1 день
        </Button>
        <Button small kind="paper" onClick={() => void shift(60)}>
          +1 ч
        </Button>
        <Button small kind="paper" onClick={() => void shift(180)}>
          +3 ч
        </Button>
        <Button small kind="paper" onClick={() => void shift(1440)}>
          +1 день
        </Button>
        <Button small kind="paper" onClick={() => void api.debugTick().then(() => nav.refresh())}>
          Тик планировщика
        </Button>
      </div>
    </section>
  );
}
