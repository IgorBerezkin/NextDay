import { useState } from "react";
import { api, type CheckMode, type CheckSpec, type CheckTemplate } from "../api";
import { Button, Check, Modal, toast, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { checkNote, DEFAULT_CHECK, groupsOf, MODES, sameCheck } from "./drillKit";

export function ModeFields({ spec, onChange }: { spec: CheckSpec; onChange: (s: CheckSpec) => void }) {
  const option = (m: (typeof MODES)[number]) => (
    <option key={m.value} value={m.value}>
      {m.label}
    </option>
  );
  return (
    <>
      <select className="field select" value={spec.mode} onChange={(e) => onChange({ ...spec, mode: e.target.value as CheckMode })}>
        {MODES.filter((m) => !m.code).map(option)}
        <optgroup label="Для программистов">{MODES.filter((m) => m.code).map(option)}</optgroup>
      </select>
      {(spec.mode === "text" || spec.mode === "choice") && (
        <Check small checked={spec.caseSensitive} onChange={(v) => onChange({ ...spec, caseSensitive: v })} label="регистр важен" />
      )}
      {spec.mode === "text" && (
        <Check small checked={spec.ignoreSpaces} onChange={(v) => onChange({ ...spec, ignoreSpaces: v })} label="пробелы не важны" />
      )}
      {spec.mode === "number" && (
        <label className="row">
          <span>допуск</span>
          <input
            className="field drill-num"
            type="number"
            min={0}
            step="any"
            value={spec.tolerance}
            onChange={(e) => onChange({ ...spec, tolerance: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
      )}
      {spec.mode === "python" && (
        <Check small checked={spec.strictTypes} onChange={(v) => onChange({ ...spec, strictTypes: v })} label="строгие типы" />
      )}
      <input
        className="field chk-hintfield"
        value={spec.hint}
        maxLength={200}
        placeholder="Подсказка под полем ответа"
        onChange={(e) => onChange({ ...spec, hint: e.target.value })}
      />
    </>
  );
}

export function CheckFields({
  spec,
  onChange,
  templates,
  base,
}: {
  spec: CheckSpec | null;
  onChange: (s: CheckSpec | null) => void;
  templates: CheckTemplate[];
  base?: CheckSpec;
}) {
  const [custom, setCustom] = useState(false);
  const match = spec ? templates.find((t) => sameCheck(t.check, spec)) : undefined;
  const value = !spec ? "inherit" : custom || !match ? "custom" : match.id;
  const pick = (v: string) => {
    if (v === "inherit") {
      setCustom(false);
      onChange(null);
    } else if (v === "custom") {
      setCustom(true);
      onChange({ ...(spec ?? base ?? DEFAULT_CHECK) });
    } else {
      const t = templates.find((x) => x.id === v);
      if (!t) return;
      setCustom(false);
      onChange({ ...t.check });
    }
  };
  return (
    <div className="drill-checkfields">
      <select className="field select" value={value} onChange={(e) => pick(e.target.value)}>
        {base && <option value="inherit">как у набора</option>}
        {groupsOf(templates).map(([group, list]) => (
          <optgroup key={group} label={group}>
            {list.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="custom">Своя настройка</option>
      </select>
      {spec && value === "custom" && <ModeFields spec={spec} onChange={onChange} />}
    </div>
  );
}

export function checkHelp(spec: CheckSpec) {
  const mode = MODES.find((m) => m.value === spec.mode)?.hint ?? "";
  return spec.hint ? `${mode} Под полем ответа: «${spec.hint}».` : mode;
}

function CheckEditor({
  value,
  groups,
  onClose,
  onSaved,
}: {
  value: CheckTemplate;
  groups: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [t, setT] = useState<CheckTemplate>(() => structuredClone(value));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.drillSaveCheck(t);
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={value.id ? "Шаблон проверки" : "Новый шаблон проверки"}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Button kind="paper" onClick={onClose}>
            Отмена
          </Button>
          <Button icon="check" disabled={busy || !t.name.trim()} onClick={() => void save()}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="drill-form">
        <label className="drill-field">
          <span>Название</span>
          <input
            className="field"
            value={t.name}
            maxLength={60}
            placeholder="Например, Английское слово"
            onChange={(e) => setT({ ...t, name: e.target.value })}
          />
        </label>
        <label className="drill-field">
          <span>Группа</span>
          <input
            className="field"
            list="chk-groups"
            value={t.group}
            maxLength={40}
            placeholder="Например, Языки"
            onChange={(e) => setT({ ...t, group: e.target.value })}
          />
          <datalist id="chk-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <span className="muted">Новое название создаст новую группу.</span>
        </label>
        <div className="drill-field">
          <span>Как сравнивать ответ</span>
          <div className="drill-checkfields">
            <ModeFields spec={t.check} onChange={(check) => setT({ ...t, check })} />
          </div>
          <p className="muted">{checkHelp(t.check)}</p>
        </div>
      </div>
    </Modal>
  );
}

export function CheckTemplates({ list, reload }: { list: CheckTemplate[]; reload: () => Promise<void> }) {
  const [edit, setEdit] = useState<CheckTemplate | null>(null);
  const [sure, setSure] = useState<{ text: string; run: () => Promise<unknown> } | null>(null);
  const groups = groupsOf(list);

  const run = async (f: () => Promise<unknown>) => {
    try {
      await f();
      await reload();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <section className="card drill-checks">
      <h2 className="card-title">
        <Px name="check" scale={2} /> Шаблоны проверки
      </h2>
      <p className="muted">
        Шаблон говорит, как сравнивать ответ: текстом, числом, выбором из вариантов или самопроверкой, и что подсказать под полем ответа.
        Шаблоны лежат в группах, свою группу можно завести под любую тему. Набор копирует шаблон при выборе, поэтому правка или удаление
        шаблона наборы не меняет.
      </p>
      {groups.map(([group, items]) => (
        <div key={group} className="chk-group">
          <div className="chk-group-head">
            <b>{group}</b>
            <span className="grow" />
            <Button
              kind="ghost"
              small
              icon="trash"
              onClick={() =>
                setSure({
                  text: `Удалить группу «${group}» вместе с шаблонами (${items.length})?`,
                  run: () => api.drillDeleteCheck(null, group),
                })
              }
            >
              Удалить группу
            </Button>
          </div>
          {items.map((t) => {
            const note = checkNote(t.check);
            return (
              <div key={t.id} className="chk-item">
                <span className="chk-name">{t.name}</span>
                {note.toLowerCase() !== t.name.toLowerCase() && <span className="muted">{note}</span>}
                {t.check.hint && <span className="chk-hint">«{t.check.hint}»</span>}
                <span className="grow" />
                <Button kind="ghost" small icon="pencil" title="Изменить" onClick={() => setEdit(t)} />
                <Button
                  kind="ghost"
                  small
                  icon="trash"
                  title="Удалить"
                  onClick={() => setSure({ text: `Удалить шаблон «${t.name}»?`, run: () => api.drillDeleteCheck(t.id, null) })}
                />
              </div>
            );
          })}
        </div>
      ))}
      {!list.length && <p className="muted">Шаблонов нет: верни стандартные или создай свой.</p>}
      <div className="row">
        <Button
          kind="paper"
          small
          icon="plus"
          onClick={() => setEdit({ id: "", group: groups.at(-1)?.[0] ?? "Свои", name: "", check: { ...DEFAULT_CHECK } })}
        >
          Новый шаблон
        </Button>
        <Button
          kind="ghost"
          small
          icon="undo"
          onClick={() =>
            void run(async () => {
              const n = await api.drillResetChecks();
              toast(n ? `Вернул стандартные шаблоны: ${n}.` : "Все стандартные шаблоны уже на месте.", "good");
            })
          }
        >
          Вернуть стандартные
        </Button>
      </div>
      {edit && (
        <CheckEditor
          value={edit}
          groups={groups.map(([g]) => g)}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setEdit(null);
            await reload();
          }}
        />
      )}
      {sure && (
        <Modal
          title="Точно?"
          onClose={() => setSure(null)}
          footer={
            <>
              <Button kind="paper" onClick={() => setSure(null)}>
                Отмена
              </Button>
              <Button
                kind="danger"
                onClick={() => {
                  const s = sure;
                  setSure(null);
                  void run(s.run);
                }}
              >
                Удалить
              </Button>
            </>
          }
        >
          <p>{sure.text}</p>
          <p className="muted">Наборы, где этот способ проверки уже выбран, сохранят свои настройки.</p>
        </Modal>
      )}
    </section>
  );
}
