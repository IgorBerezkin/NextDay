import { useRef, useState } from "react";
import { api, errText, type DrillDeckInfo, type ImportReport } from "../api";
import { t } from "../i18n";
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
      setFail(t(`Файл не читается как JSON: ${errText(e)}`, `The file is not valid JSON: ${errText(e)}`));
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
      title={t("DataEater: импорт банка", "DataEater: import a bank")}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Button kind="paper" onClick={onClose}>
            {report ? t("Закрыть", "Close") : t("Отмена", "Cancel")}
          </Button>
          {!report && (
            <Button icon="check" disabled={busy || !file} onClick={() => void run()}>
              {busy ? t("Ем…", "Eating...") : t("Импортировать", "Import")}
            </Button>
          )}
        </>
      }
    >
      <div className="drill-form">
        <p className="muted">
          {t(
            "DataEater ест готовые банки карточек: JSON в том же формате, что встроенный набор Python. В банке темы с теорией и карточки, у каждой карточки много вариантов с разными данными. После промаха карточка вернётся с другим вариантом. Такой файл обычно собирает скрипт, который сам выполняет код и считает ответы, или ИИ через MCP (import_drill_bank).",
            "DataEater eats ready card banks: JSON in the same format as the built-in Python deck. A bank has topics with theory and cards, and each card has many variants with different data. After a miss the card comes back with another variant. Such a file is usually built by a script that runs the code and computes the answers itself, or by AI over MCP (import_drill_bank).",
          )}
        </p>
        <pre className="eater-format">
          {
            '{ "title": "...", "topics": [{ "id": "t1", "title": "...", "theory": "Markdown" }],\n  "cards": [{ "id": "c1", "topic": "t1", "kind": "pick", "rule": "...",\n    "variants": [{ "question": "...", "code": "...", "answer": "...", "choices": ["..."] }] }] }'
          }
        </pre>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void choose(e.target.files?.[0])} />
        <div className="row">
          <Button kind="paper" icon="folder" onClick={() => input.current?.click()}>
            {t("Выбрать файл .json", "Choose a .json file")}
          </Button>
          {file && <span className="muted">{file.name}</span>}
        </div>
        {file && (
          <div className="eater-file">
            <p>
              <b>{file.title || t("без названия", "untitled")}</b>: {plural(file.topics, "тема", "темы", "тем", "topic", "topics")},{" "}
              {plural(file.cards, "карточка", "карточки", "карточек", "card", "cards")},{" "}
              {plural(file.variants, "вариант", "варианта", "вариантов", "variant", "variants")}.
            </p>
            {same && (
              <div className="seg">
                <button className={replace === same.id ? "on" : ""} onClick={() => setReplace(same.id)}>
                  {t(`Заменить «${same.title}», прогресс сохранится`, `Replace "${same.title}", progress is kept`)}
                </button>
                <button className={replace === null ? "on" : ""} onClick={() => setReplace(null)}>
                  {t("Добавить новым банком", "Add as a new bank")}
                </button>
              </div>
            )}
          </div>
        )}
        {fail && <p className="drill-err">{fail}</p>}
        {report && (
          <div className="eater-file">
            <p className="good">
              {t(
                `${report.replaced ? "Заменён" : "Добавлен"} банк «${report.title}»`,
                `${report.replaced ? "Replaced" : "Added"} the bank "${report.title}"`,
              )}
              : {plural(report.topics, "тема", "темы", "тем", "topic", "topics")},{" "}
              {plural(report.cards, "карточка", "карточки", "карточек", "card", "cards")},{" "}
              {plural(report.variants, "вариант", "варианта", "вариантов", "variant", "variants")}.
            </p>
            {report.dropped > 0 && <p>{t(`Отброшено вариантов: ${report.dropped}.`, `Variants dropped: ${report.dropped}.`)}</p>}
            {report.problems.length > 0 && (
              <ul className="gen-problems">
                {report.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
            <p className="muted">
              {t("Чтобы зубрить банк, добавь его в режим на вкладке Старт.", "To drill the bank, add it to a mode on the Start tab.")}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
