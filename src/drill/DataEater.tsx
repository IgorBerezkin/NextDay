import { useRef, useState } from "react";
import { api, errText, type DrillDeckInfo, type ImportReport } from "../api";
import { Button, Modal } from "../ui/kit";
import { plural } from "../util";

type Picked = { name: string; text: string; title: string; topics: number; cards: number; variants: number };

function peek(name: string, text: string): Picked {
  const j = JSON.parse(text) as { title?: unknown; topics?: unknown; cards?: unknown };
  const cards = Array.isArray(j.cards) ? (j.cards as { variants?: unknown }[]) : [];
  return {
    name,
    text,
    title: typeof j.title === "string" ? j.title : "",
    topics: Array.isArray(j.topics) ? j.topics.length : 0,
    cards: cards.length,
    variants: cards.reduce((n, c) => n + (Array.isArray(c?.variants) ? c.variants.length : 0), 0),
  };
}

export function DataEater({ banks, onClose, onDone }: { banks: DrillDeckInfo[]; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<Picked | null>(null);
  const [replace, setReplace] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setFail(null);
    setReport(null);
    try {
      const p = peek(f.name, await f.text());
      setFile(p);
      setReplace(banks.find((b) => b.title === p.title)?.id ?? null);
    } catch (e) {
      setFile(null);
      setFail(`Файл не читается как JSON: ${errText(e)}`);
    }
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setFail(null);
    try {
      setReport(await api.drillImportBank(file.text, replace));
      setFile(null);
      onDone();
    } catch (e) {
      setFail(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const same = file ? banks.find((b) => b.title === file.title) : undefined;

  return (
    <Modal
      wide
      title="DataEater: импорт банка"
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Button kind="paper" onClick={onClose}>
            {report ? "Закрыть" : "Отмена"}
          </Button>
          {!report && (
            <Button icon="check" disabled={busy || !file} onClick={() => void run()}>
              {busy ? "Ем…" : "Импортировать"}
            </Button>
          )}
        </>
      }
    >
      <div className="drill-form">
        <p className="muted">
          DataEater ест готовые банки карточек: JSON в том же формате, что встроенный набор Python. В банке темы с теорией и карточки, у
          каждой карточки много вариантов с разными данными. После промаха карточка вернётся с другим вариантом. Такой файл обычно собирает
          скрипт, который сам выполняет код и считает ответы, или ИИ через MCP (import_drill_bank).
        </p>
        <pre className="eater-format">
          {
            '{ "title": "...", "topics": [{ "id": "t1", "title": "...", "theory": "Markdown" }],\n  "cards": [{ "id": "c1", "topic": "t1", "kind": "pick", "rule": "...",\n    "variants": [{ "question": "...", "code": "...", "answer": "...", "choices": ["..."] }] }] }'
          }
        </pre>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void choose(e.target.files?.[0])} />
        <div className="row">
          <Button kind="paper" icon="folder" onClick={() => input.current?.click()}>
            Выбрать файл .json
          </Button>
          {file && <span className="muted">{file.name}</span>}
        </div>
        {file && (
          <div className="eater-file">
            <p>
              <b>{file.title || "без названия"}</b>: {plural(file.topics, "тема", "темы", "тем")},{" "}
              {plural(file.cards, "карточка", "карточки", "карточек")}, {plural(file.variants, "вариант", "варианта", "вариантов")}.
            </p>
            {same && (
              <div className="seg">
                <button className={replace === same.id ? "on" : ""} onClick={() => setReplace(same.id)}>
                  Заменить «{same.title}», прогресс сохранится
                </button>
                <button className={replace === null ? "on" : ""} onClick={() => setReplace(null)}>
                  Добавить новым банком
                </button>
              </div>
            )}
          </div>
        )}
        {fail && <p className="drill-err">{fail}</p>}
        {report && (
          <div className="eater-file">
            <p className="good">
              {report.replaced ? "Заменён" : "Добавлен"} банк «{report.title}»: {plural(report.topics, "тема", "темы", "тем")},{" "}
              {plural(report.cards, "карточка", "карточки", "карточек")}, {plural(report.variants, "вариант", "варианта", "вариантов")}.
            </p>
            {report.dropped > 0 && <p>Отброшено вариантов: {report.dropped}.</p>}
            {report.problems.length > 0 && (
              <ul className="gen-problems">
                {report.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
            <p className="muted">Чтобы зубрить банк, добавь его в режим на вкладке Старт.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
