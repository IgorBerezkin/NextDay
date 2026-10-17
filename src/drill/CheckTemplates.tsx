import { useState } from "react";
import { api, type CheckMode, type CheckSpec, type CheckTemplate } from "../api";
import { t } from "../i18n";
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
        <optgroup label={t("Для программистов", "For programmers")}>{MODES.filter((m) => m.code).map(option)}</optgroup>
      </select>
      {(spec.mode === "text" || spec.mode === "choice") && (
        <Check
          small
          checked={spec.caseSensitive}
          onChange={(v) => onChange({ ...spec, caseSensitive: v })}
          label={t("регистр важен", "case matters")}
        />
      )}
      {spec.mode === "text" && (
        <Check
          small
          checked={spec.ignoreSpaces}
          onChange={(v) => onChange({ ...spec, ignoreSpaces: v })}
          label={t("пробелы не важны", "spaces ignored")}
        />
      )}
      {spec.mode === "number" && (
        <label className="row">
          <span>{t("допуск", "tolerance")}</span>
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
        <Check
          small
          checked={spec.strictTypes}
          onChange={(v) => onChange({ ...spec, strictTypes: v })}
          label={t("строгие типы", "strict types")}
        />
      )}
      <input
        className="field chk-hintfield"
        value={spec.hint}
        maxLength={200}
        placeholder={t("Подсказка под полем ответа", "Hint under the answer field")}
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
  const match = spec ? templates.find((tpl) => sameCheck(tpl.check, spec)) : undefined;
  const value = !spec ? "inherit" : custom || !match ? "custom" : match.id;
  const pick = (v: string) => {
    if (v === "inherit") {
      setCustom(false);
      onChange(null);
    } else if (v === "custom") {
      setCustom(true);
      onChange({ ...(spec ?? base ?? DEFAULT_CHECK) });
    } else {
      const tpl = templates.find((x) => x.id === v);
      if (!tpl) return;
      setCustom(false);
      onChange({ ...tpl.check });
    }
  };
  return (
    <div className="drill-checkfields">
      <select className="field select" value={value} onChange={(e) => pick(e.target.value)}>
        {base && <option value="inherit">{t("как у набора", "same as deck")}</option>}
        {groupsOf(templates).map(([group, list]) => (
          <optgroup key={group} label={group}>
            {list.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="custom">{t("Своя настройка", "Custom")}</option>
      </select>
      {spec && value === "custom" && <ModeFields spec={spec} onChange={onChange} />}
    </div>
  );
}

export function checkHelp(spec: CheckSpec) {
  const mode = MODES.find((m) => m.value === spec.mode)?.hint ?? "";
  return spec.hint ? t(`${mode} Под полем ответа: «${spec.hint}».`, `${mode} Under the answer field: "${spec.hint}".`) : mode;
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
  const [tpl, setTpl] = useState<CheckTemplate>(() => structuredClone(value));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.drillSaveCheck(tpl);
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={value.id ? t("Шаблон проверки", "Check template") : t("Новый шаблон проверки", "New check template")}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Button kind="paper" onClick={onClose}>
            {t("Отмена", "Cancel")}
          </Button>
          <Button icon="check" disabled={busy || !tpl.name.trim()} onClick={() => void save()}>
            {t("Сохранить", "Save")}
          </Button>
        </>
      }
    >
      <div className="drill-form">
        <label className="drill-field">
          <span>{t("Название", "Name")}</span>
          <input
            className="field"
            value={tpl.name}
            maxLength={60}
            placeholder={t("Например, Английское слово", "For example, Spanish word")}
            onChange={(e) => setTpl({ ...tpl, name: e.target.value })}
          />
        </label>
        <label className="drill-field">
          <span>{t("Группа", "Group")}</span>
          <input
            className="field"
            list="chk-groups"
            value={tpl.group}
            maxLength={40}
            placeholder={t("Например, Языки", "For example, Languages")}
            onChange={(e) => setTpl({ ...tpl, group: e.target.value })}
          />
          <datalist id="chk-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <span className="muted">{t("Новое название создаст новую группу.", "A new name creates a new group.")}</span>
        </label>
        <div className="drill-field">
          <span>{t("Как сравнивать ответ", "How to compare the answer")}</span>
          <div className="drill-checkfields">
            <ModeFields spec={tpl.check} onChange={(check) => setTpl({ ...tpl, check })} />
          </div>
          <p className="muted">{checkHelp(tpl.check)}</p>
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
        <Px name="check" scale={2} /> {t("Шаблоны проверки", "Check templates")}
      </h2>
      <p className="muted">
        {t(
          "Шаблон говорит, как сравнивать ответ: текстом, числом, выбором из вариантов или самопроверкой, и что подсказать под полем ответа. Шаблоны лежат в группах, свою группу можно завести под любую тему. Набор копирует шаблон при выборе, поэтому правка или удаление шаблона наборы не меняет.",
          "A template says how to compare the answer: as text, a number, multiple choice or self-check, and what hint to show under the answer field. Templates live in groups, and you can make a group for any subject. A deck copies a template when you pick it, so editing or deleting a template does not change decks.",
        )}
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
                  text: t(
                    `Удалить группу «${group}» вместе с шаблонами (${items.length})?`,
                    `Delete the group "${group}" with its templates (${items.length})?`,
                  ),
                  run: () => api.drillDeleteCheck(null, group),
                })
              }
            >
              {t("Удалить группу", "Delete group")}
            </Button>
          </div>
          {items.map((tpl) => {
            const note = checkNote(tpl.check);
            return (
              <div key={tpl.id} className="chk-item">
                <span className="chk-name">{tpl.name}</span>
                {note.toLowerCase() !== tpl.name.toLowerCase() && <span className="muted">{note}</span>}
                {tpl.check.hint && <span className="chk-hint">{t(`«${tpl.check.hint}»`, `"${tpl.check.hint}"`)}</span>}
                <span className="grow" />
                <Button kind="ghost" small icon="pencil" title={t("Изменить", "Edit")} onClick={() => setEdit(tpl)} />
                <Button
                  kind="ghost"
                  small
                  icon="trash"
                  title={t("Удалить", "Delete")}
                  onClick={() =>
                    setSure({
                      text: t(`Удалить шаблон «${tpl.name}»?`, `Delete the template "${tpl.name}"?`),
                      run: () => api.drillDeleteCheck(tpl.id, null),
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      ))}
      {!list.length && (
        <p className="muted">
          {t("Шаблонов нет: верни стандартные или создай свой.", "No templates: restore the default ones or make your own.")}
        </p>
      )}
      <div className="row">
        <Button
          kind="paper"
          small
          icon="plus"
          onClick={() => setEdit({ id: "", group: groups.at(-1)?.[0] ?? t("Свои", "Custom"), name: "", check: { ...DEFAULT_CHECK } })}
        >
          {t("Новый шаблон", "New template")}
        </Button>
        <Button
          kind="ghost"
          small
          icon="undo"
          onClick={() =>
            void run(async () => {
              const n = await api.drillResetChecks();
              toast(
                n
                  ? t(`Вернул стандартные шаблоны: ${n}.`, `Restored default templates: ${n}.`)
                  : t("Все стандартные шаблоны уже на месте.", "All default templates are already in place."),
                "good",
              );
            })
          }
        >
          {t("Вернуть стандартные", "Restore defaults")}
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
          title={t("Точно?", "Sure?")}
          onClose={() => setSure(null)}
          footer={
            <>
              <Button kind="paper" onClick={() => setSure(null)}>
                {t("Отмена", "Cancel")}
              </Button>
              <Button
                kind="danger"
                onClick={() => {
                  const s = sure;
                  setSure(null);
                  void run(s.run);
                }}
              >
                {t("Удалить", "Delete")}
              </Button>
            </>
          }
        >
          <p>{sure.text}</p>
          <p className="muted">
            {t(
              "Наборы, где этот способ проверки уже выбран, сохранят свои настройки.",
              "Decks that already use this check keep their settings.",
            )}
          </p>
        </Modal>
      )}
    </section>
  );
}
