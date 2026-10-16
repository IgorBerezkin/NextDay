import { useEffect, useRef, useState } from "react";
import { api, errText, type GenCheck, type GenVariant } from "../api";
import { Button, Modal, toast, toastError } from "../ui/kit";
import { plural } from "../util";
import { Code, LETTERS, Prompt } from "./drillKit";
import { Markdown } from "./Markdown";
import { genMeta, genVariants, type GenMeta } from "./plugin";
import sample from "./sample.plugin.js?raw";

type Result = { meta: GenMeta; made: Record<string, GenVariant[]>; errors: Record<string, string>; check: GenCheck; code: string };

export function GeneratorEditor({
  id,
  builtin,
  onClose,
  onSaved,
}: {
  id: string | null;
  builtin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loaded, setLoaded] = useState(!id);
  const [result, setResult] = useState<Result | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    api
      .drillGenerator(id)
      .then((g) => {
        setCode(g.code);
        setTitle(g.title);
        setDescription(g.description);
        setLoaded(true);
      })
      .catch(toastError);
  }, [id]);

  const check = async () => {
    setBusy(true);
    setFail(null);
    setResult(null);
    try {
      const meta = await genMeta(code);
      const out = await genVariants(
        code,
        meta.templates.map((t) => t.id),
        4,
      );
      const verdict = await api.drillCheckGenerator(meta.topics, meta.templates, out.variants);
      setResult({ meta, made: out.variants, errors: out.errors, check: verdict, code });
      setPick(meta.templates[0]?.id ?? "");
      if (!title.trim() && meta.title) setTitle(meta.title.slice(0, 80));
      if (!description.trim() && meta.description) setDescription(meta.description.slice(0, 1000));
    } catch (e) {
      setFail(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await api.drillSaveGenerator({
        id: id ?? undefined,
        title: title.trim() || result.meta.title || "Генератор",
        description,
        code,
        enabled: true,
        topics: result.meta.topics,
        templates: result.meta.templates,
      });
      toast("Генератор включён. Добавь его в режим, и карточки пойдут в сеансы.", "good");
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const open = async (f: File | undefined) => {
    if (!f) return;
    try {
      setCode(await f.text());
      setResult(null);
    } catch (e) {
      toastError(e);
    }
  };

  const fresh = result !== null && result.code === code;
  const errors = result ? Object.entries(result.errors).map(([t, e]) => `${t}: ${e}`) : [];
  const problems = result ? [...errors, ...result.check.problems] : [];
  const tpl = result?.meta.templates.find((t) => t.id === pick);
  const samples = result?.made[pick] ?? [];

  return (
    <Modal
      wide
      title={builtin ? "Встроенный генератор" : id ? "Генератор карточек" : "Новый генератор"}
      onClose={onClose}
      footer={
        <>
          {result && !fresh && <span className="muted">Код изменился, проверь ещё раз.</span>}
          <span className="grow" />
          <Button kind="paper" onClick={onClose}>
            {builtin ? "Закрыть" : "Отмена"}
          </Button>
          {!builtin && (
            <Button icon="check" disabled={busy || !fresh || !result || result.check.ready === 0} onClick={() => void save()}>
              Сохранить и включить
            </Button>
          )}
        </>
      }
    >
      <div className="drill-form">
        <p className="muted">
          Генератор это скрипт на JavaScript, который в начале каждого сеанса придумывает карточки с новыми данными. Промах вернётся той же
          задачей, но с другими данными. Скрипт работает в песочнице: без сети и без доступа к приложению. Обычно его пишет ИИ через MCP.
        </p>
        {!builtin && (
          <div className="row">
            <label className="drill-field grow">
              <span>Название</span>
              <input
                className="field"
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Из plugin.title"
              />
            </label>
            <label className="drill-field grow">
              <span>Описание</span>
              <input className="field" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
        )}
        <div className="drill-field">
          <span>Код</span>
          <textarea
            className="field area gen-code"
            value={code}
            readOnly={builtin}
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            placeholder={
              loaded ? "const plugin = { title, topics: [...], templates: [{ id, topic, kind, rule, make(r) { ... } }] };" : "Загрузка…"
            }
          />
        </div>
        <div className="row">
          {!builtin && (
            <>
              <input ref={file} type="file" accept=".js,.txt" hidden onChange={(e) => void open(e.target.files?.[0])} />
              <Button kind="paper" small icon="folder" onClick={() => file.current?.click()}>
                Открыть файл
              </Button>
              <Button kind="paper" small icon="note" disabled={!!code.trim()} onClick={() => setCode(sample)}>
                Пример
              </Button>
            </>
          )}
          <span className="grow" />
          <Button kind={fresh ? "paper" : "primary"} icon="sBolt" disabled={busy || !code.trim()} onClick={() => void check()}>
            {busy ? "Проверяю…" : "Проверить"}
          </Button>
        </div>

        {fail && <p className="drill-err">Не сработало: {fail}</p>}

        {result && (
          <div className="gen-result">
            <p className={result.check.ready ? "good" : "drill-err"}>
              {plural(result.check.templates, "шаблон", "шаблона", "шаблонов")}, работают {result.check.ready}, в пробе{" "}
              {plural(result.check.variants, "карточка", "карточки", "карточек")}. Тем: {result.meta.topics.length || "нет"}, теория у{" "}
              {result.meta.topics.filter((t) => t.theory.trim()).length}.
            </p>
            {problems.length > 0 && (
              <ul className="gen-problems">
                {problems.slice(0, 20).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
            <div className="row">
              <span>Пример карточек шаблона</span>
              <select className="field select" value={pick} onChange={(e) => setPick(e.target.value)}>
                {result.meta.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id}
                    {t.kind ? ` (${t.kind})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {tpl?.rule && (
              <div className="drill-rule">
                <Markdown text={tpl.rule} />
              </div>
            )}
            <div className="gen-samples">
              {samples.map((v, i) => (
                <div key={i} className="gen-sample">
                  {v.code && <Code code={v.code} />}
                  <p className="drill-q">
                    <Prompt text={v.question} />
                  </p>
                  {v.choices.length > 0 && (
                    <div className="gen-choices">
                      {v.choices.map((c, j) => (
                        <span key={j} className={c === v.answer ? "right" : ""}>
                          <b>{LETTERS[j]}</b> <code>{c}</code>
                        </span>
                      ))}
                    </div>
                  )}
                  <p>
                    <span className="muted">Ответ:</span> <code className="drill-ans">{v.answer}</code>
                  </p>
                  {v.explain && (
                    <div className="gen-explain">
                      <Markdown text={v.explain} />
                    </div>
                  )}
                </div>
              ))}
              {!samples.length && <p className="muted">Этот шаблон не дал карточек.</p>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
