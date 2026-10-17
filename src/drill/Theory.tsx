import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api, type Article, type ArticleInput, type DrillDeckInfo, type DrillOverview } from "../api";
import { t } from "../i18n";
import { Button, Modal, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { stamp } from "../util";
import { Markdown } from "./Markdown";

const SNIPPETS: { label: string; text: string }[] = [
  { label: t("Схема данных", "Data diagram"), text: "```data\nlines = ['1 2', '3 4']\nrows = [[1, 2], [3, 4]]\n'1 2' -> ['1', '2']\n```" },
  {
    label: t("График", "Chart"),
    text: t(
      '```chart\n{"type": "line", "title": "Название", "x": [1, 2, 3], "series": [{"name": "train", "y": [0.9, 0.5, 0.3]}, {"name": "test", "y": [0.95, 0.7, 0.6]}]}\n```',
      '```chart\n{"type": "line", "title": "Title", "x": [1, 2, 3], "series": [{"name": "train", "y": [0.9, 0.5, 0.3]}, {"name": "test", "y": [0.95, 0.7, 0.6]}]}\n```',
    ),
  },
  {
    label: t("Функция", "Function"),
    text: t(
      "```plot\ny = 1 / (1 + exp(-x))\nx = -6..6\ntitle: сигмоида\n```",
      "```plot\ny = 1 / (1 + exp(-x))\nx = -6..6\ntitle: sigmoid\n```",
    ),
  },
  { label: t("Граф", "Graph"), text: "```graph\na -> b\na -> c\nb -> d\nc -> d\n```" },
  {
    label: t("Таблица", "Table"),
    text: t(
      "| выражение | форма | пример |\n|---|---|---|\n| line.split() | list[str] | ['1', '2'] |",
      "| expression | shape | example |\n|---|---|---|\n| line.split() | list[str] | ['1', '2'] |",
    ),
  },
  { label: t("Код", "Code"), text: "```python\nrows = [list(map(int, s.split())) for s in lines]\n```" },
];

function topicTitle(decks: DrillDeckInfo[], deck: string, topic: string) {
  const d = decks.find((x) => x.id === deck);
  if (!topic) return d ? t(`${d.title}: весь набор`, `${d.title}: whole deck`) : t("весь набор", "whole deck");
  return d?.topics.find((t) => t.id === topic)?.title ?? topic;
}

export function useArticles() {
  const [list, setList] = useState<Article[] | null>(null);
  const load = useCallback(async () => {
    try {
      setList(await api.drillArticles());
    } catch (e) {
      toastError(e);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { list, load };
}

export function TheoryBrowser({ ov }: { ov: DrillOverview }) {
  const { list, load } = useArticles();
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<ArticleInput | null>(null);
  const [sure, setSure] = useState<Article | null>(null);
  const current = list?.find((a) => a.id === sel) ?? list?.[0] ?? null;

  if (!list) return <div className="loading">{t("Загрузка…", "Loading...")}</div>;

  return (
    <div className="th">
      <aside className="th-list">
        <Button
          kind="paper"
          small
          icon="plus"
          onClick={() => setEdit({ deck: current?.deck ?? "python", topic: current?.topic ?? "", title: "", body: "" })}
        >
          {t("Новая статья", "New article")}
        </Button>
        {ov.decks.map((d) => {
          const groups = [
            { id: "", title: t("Весь набор", "Whole deck") },
            ...d.topics.filter((t) => t.id).map((t) => ({ id: t.id, title: t.title })),
          ];
          return (
            <div key={d.id} className="th-deck">
              <b>{d.title}</b>
              {groups.map((g) => {
                const arts = list.filter((a) => a.deck === d.id && a.topic === g.id);
                if (!arts.length && !g.id && d.topics.some((t) => t.id)) return null;
                return (
                  <div key={g.id || "deck"} className="th-topic">
                    <span className="th-topic-title">{g.title}</span>
                    {arts.map((a) => (
                      <button key={a.id} className={`th-item${current?.id === a.id ? " on" : ""}`} onClick={() => setSel(a.id)}>
                        <Px name={a.builtin ? "cards" : a.author === "ai" ? "sBolt" : "note"} scale={1.5} />
                        <span>{a.builtin ? t("Встроенная статья", "Built-in article") : a.title}</span>
                      </button>
                    ))}
                    {!arts.length && (
                      <button className="th-item th-add" onClick={() => setEdit({ deck: d.id, topic: g.id, title: g.title, body: "" })}>
                        <Px name="plus" scale={1.5} />
                        <span>{t("написать", "write")}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </aside>
      <section className="th-read card">
        {current ? (
          <>
            <div className="th-meta">
              <h2 className="card-title">{current.title}</h2>
              <span className="muted">
                {topicTitle(ov.decks, current.deck, current.topic)}
                {current.builtin
                  ? t(", встроенная", ", built-in")
                  : current.author === "ai"
                    ? t(`, от ИИ, ${stamp(current.updatedAt)}`, `, by AI, ${stamp(current.updatedAt)}`)
                    : `, ${stamp(current.updatedAt)}`}
              </span>
              <span className="grow" />
              {current.builtin ? (
                <Button
                  kind="paper"
                  small
                  icon="plus"
                  onClick={() => setEdit({ deck: current.deck, topic: current.topic, title: "", body: "" })}
                >
                  {t("Своя статья к теме", "Your own article")}
                </Button>
              ) : (
                <>
                  <Button
                    kind="paper"
                    small
                    icon="pencil"
                    onClick={() =>
                      setEdit({ id: current.id, deck: current.deck, topic: current.topic, title: current.title, body: current.body })
                    }
                  >
                    {t("Изменить", "Edit")}
                  </Button>
                  <Button kind="ghost" small icon="trash" title={t("Удалить", "Delete")} onClick={() => setSure(current)} />
                </>
              )}
            </div>
            <Markdown text={current.body} />
          </>
        ) : (
          <p className="muted">
            {t("Статей пока нет. Напиши первую или попроси ИИ через MCP.", "No articles yet. Write the first one or ask AI over MCP.")}
          </p>
        )}
      </section>

      {edit && (
        <ArticleEditor
          init={edit}
          decks={ov.decks}
          onClose={() => setEdit(null)}
          onSaved={async (a) => {
            setEdit(null);
            await load();
            setSel(a.id);
          }}
        />
      )}
      {sure && (
        <Modal
          title={t("Удалить статью?", "Delete article?")}
          onClose={() => setSure(null)}
          footer={
            <>
              <Button kind="paper" onClick={() => setSure(null)}>
                {t("Отмена", "Cancel")}
              </Button>
              <Button
                kind="danger"
                onClick={async () => {
                  const id = sure.id;
                  setSure(null);
                  try {
                    await api.drillDeleteArticle(id);
                    setSel(null);
                    await load();
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                {t("Удалить", "Delete")}
              </Button>
            </>
          }
        >
          <p>{t(`«${sure.title}» пропадёт из справочника.`, `"${sure.title}" will be removed from the reference.`)}</p>
        </Modal>
      )}
    </div>
  );
}

function ArticleEditor({
  init,
  decks,
  onClose,
  onSaved,
}: {
  init: ArticleInput;
  decks: DrillDeckInfo[];
  onClose: () => void;
  onSaved: (a: Article) => void;
}) {
  const [a, setA] = useState<ArticleInput>(init);
  const [busy, setBusy] = useState(false);
  const deck = decks.find((d) => d.id === a.deck);
  const insert = (text: string) => setA((x) => ({ ...x, body: `${x.body.trimEnd()}${x.body.trim() ? "\n\n" : ""}${text}\n` }));
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await api.drillSaveArticle(a));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      wide
      title={init.id ? t("Статья", "Article") : t("Новая статья", "New article")}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Button kind="paper" onClick={onClose}>
            {t("Отмена", "Cancel")}
          </Button>
          <Button icon="check" disabled={busy || !a.title.trim()} onClick={() => void save()}>
            {t("Сохранить", "Save")}
          </Button>
        </>
      }
    >
      <div className="th-edit">
        <div className="row">
          <input
            className="field th-title"
            value={a.title}
            maxLength={120}
            placeholder={t("Заголовок", "Title")}
            onChange={(e) => setA({ ...a, title: e.target.value })}
          />
          <select className="field select" value={a.deck} onChange={(e) => setA({ ...a, deck: e.target.value, topic: "" })}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <select className="field select" value={a.topic} onChange={(e) => setA({ ...a, topic: e.target.value })}>
            <option value="">{t("весь набор", "whole deck")}</option>
            {deck?.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <div className="row th-snips">
          {SNIPPETS.map((s) => (
            <Button key={s.label} kind="ghost" small icon="plus" onClick={() => insert(s.text)}>
              {s.label}
            </Button>
          ))}
        </div>
        <div className="th-split">
          <textarea
            className="field area th-src"
            value={a.body}
            spellCheck={false}
            placeholder={t(
              "## Модель\nКак представлять эти данные...\n\n```data\nrows = [[1, 2], [3, 4]]\n```",
              "## Model\nHow to picture this data...\n\n```data\nrows = [[1, 2], [3, 4]]\n```",
            )}
            onChange={(e) => setA({ ...a, body: e.target.value })}
          />
          <div className="th-preview">
            {a.body.trim() ? (
              <Markdown text={a.body} />
            ) : (
              <p className="muted">{t("Здесь будет предпросмотр.", "The preview will appear here.")}</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function TheoryPanel({
  deck,
  topic,
  label,
  inert,
  onClose,
}: {
  deck: string;
  topic: string;
  label: string;
  inert: boolean;
  onClose: () => void;
}) {
  const { list } = useArticles();
  const [decks, setDecks] = useState<DrillDeckInfo[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    void api
      .drillOverview()
      .then((o) => setDecks(o.decks))
      .catch(() => {});
  }, []);
  const ordered = useMemo(() => {
    if (!list) return [];
    const rank = (a: Article) => (a.deck === deck && a.topic === topic ? 0 : a.deck === deck && !a.topic ? 1 : a.deck === deck ? 2 : 3);
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [list, deck, topic]);
  const current = ordered.find((a) => a.id === sel) ?? ordered[0] ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="th-panel-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="th-panel panel">
        <div className="th-panel-head">
          <Px name="sIdea" scale={2} />
          <b>{label || t("Теория", "Theory")}</b>
          <select className="field select" value={current?.id ?? ""} onChange={(e) => setSel(e.target.value)}>
            {ordered.map((a) => (
              <option key={a.id} value={a.id}>
                {topicTitle(decks, a.deck, a.topic)}: {a.builtin ? t("встроенная", "built-in") : a.title}
              </option>
            ))}
          </select>
          <span className="grow" />
          <button className="icon-btn" onClick={onClose} title={t("Закрыть", "Close")}>
            <Px name="cross" scale={2} />
          </button>
        </div>
        <div className="th-panel-body">
          {list === null ? (
            <p className="muted">{t("Загрузка…", "Loading...")}</p>
          ) : current ? (
            <>
              {current.deck === deck && current.topic !== topic && current.topic && (
                <p className="muted">{t("По этой теме статьи нет, вот соседняя.", "No article on this topic, here is a nearby one.")}</p>
              )}
              <h2 className="md-h1">{current.title}</h2>
              <Markdown text={current.body} inert={inert} />
            </>
          ) : (
            <p className="muted">
              {t(
                "В справочнике пока пусто. Статьи пишутся во вкладке «Справочник» или через ИИ по MCP.",
                'The reference is empty for now. Articles are written in the "Reference" tab or by AI over MCP.',
              )}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
