import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api, type Article, type ArticleInput, type DrillDeckInfo, type DrillOverview } from "../api";
import { Button, Modal, toastError } from "../ui/kit";
import { Px } from "../ui/Px";
import { stamp } from "../util";
import { Markdown } from "./Markdown";

const SNIPPETS: { label: string; text: string }[] = [
  { label: "Схема данных", text: "```data\nlines = ['1 2', '3 4']\nrows = [[1, 2], [3, 4]]\n'1 2' -> ['1', '2']\n```" },
  {
    label: "График",
    text: '```chart\n{"type": "line", "title": "Название", "x": [1, 2, 3], "series": [{"name": "train", "y": [0.9, 0.5, 0.3]}, {"name": "test", "y": [0.95, 0.7, 0.6]}]}\n```',
  },
  { label: "Функция", text: "```plot\ny = 1 / (1 + exp(-x))\nx = -6..6\ntitle: сигмоида\n```" },
  { label: "Граф", text: "```graph\na -> b\na -> c\nb -> d\nc -> d\n```" },
  { label: "Таблица", text: "| выражение | форма | пример |\n|---|---|---|\n| line.split() | list[str] | ['1', '2'] |" },
  { label: "Код", text: "```python\nrows = [list(map(int, s.split())) for s in lines]\n```" },
];

function topicTitle(decks: DrillDeckInfo[], deck: string, topic: string) {
  const d = decks.find((x) => x.id === deck);
  if (!topic) return d ? `${d.title}: весь набор` : "весь набор";
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

  if (!list) return <div className="loading">Загрузка…</div>;

  return (
    <div className="th">
      <aside className="th-list">
        <Button
          kind="paper"
          small
          icon="plus"
          onClick={() => setEdit({ deck: current?.deck ?? "python", topic: current?.topic ?? "", title: "", body: "" })}
        >
          Новая статья
        </Button>
        {ov.decks.map((d) => {
          const groups = [{ id: "", title: "Весь набор" }, ...d.topics.filter((t) => t.id).map((t) => ({ id: t.id, title: t.title }))];
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
                        <span>{a.builtin ? "Встроенная статья" : a.title}</span>
                      </button>
                    ))}
                    {!arts.length && (
                      <button className="th-item th-add" onClick={() => setEdit({ deck: d.id, topic: g.id, title: g.title, body: "" })}>
                        <Px name="plus" scale={1.5} />
                        <span>написать</span>
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
                  ? ", встроенная"
                  : current.author === "ai"
                    ? `, от ИИ, ${stamp(current.updatedAt)}`
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
                  Своя статья к теме
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
                    Изменить
                  </Button>
                  <Button kind="ghost" small icon="trash" title="Удалить" onClick={() => setSure(current)} />
                </>
              )}
            </div>
            <Markdown text={current.body} />
          </>
        ) : (
          <p className="muted">Статей пока нет. Напиши первую или попроси ИИ через MCP.</p>
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
          title="Удалить статью?"
          onClose={() => setSure(null)}
          footer={
            <>
              <Button kind="paper" onClick={() => setSure(null)}>
                Отмена
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
                Удалить
              </Button>
            </>
          }
        >
          <p>«{sure.title}» пропадёт из справочника.</p>
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
      title={init.id ? "Статья" : "Новая статья"}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Button kind="paper" onClick={onClose}>
            Отмена
          </Button>
          <Button icon="check" disabled={busy || !a.title.trim()} onClick={() => void save()}>
            Сохранить
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
            placeholder="Заголовок"
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
            <option value="">весь набор</option>
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
            placeholder={"## Модель\nКак представлять эти данные...\n\n```data\nrows = [[1, 2], [3, 4]]\n```"}
            onChange={(e) => setA({ ...a, body: e.target.value })}
          />
          <div className="th-preview">
            {a.body.trim() ? <Markdown text={a.body} /> : <p className="muted">Здесь будет предпросмотр.</p>}
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
          <b>{label || "Теория"}</b>
          <select className="field select" value={current?.id ?? ""} onChange={(e) => setSel(e.target.value)}>
            {ordered.map((a) => (
              <option key={a.id} value={a.id}>
                {topicTitle(decks, a.deck, a.topic)}: {a.builtin ? "встроенная" : a.title}
              </option>
            ))}
          </select>
          <span className="grow" />
          <button className="icon-btn" onClick={onClose} title="Закрыть">
            <Px name="cross" scale={2} />
          </button>
        </div>
        <div className="th-panel-body">
          {list === null ? (
            <p className="muted">Загрузка…</p>
          ) : current ? (
            <>
              {current.deck === deck && current.topic !== topic && current.topic && (
                <p className="muted">По этой теме статьи нет, вот соседняя.</p>
              )}
              <h2 className="md-h1">{current.title}</h2>
              <Markdown text={current.body} inert={inert} />
            </>
          ) : (
            <p className="muted">В справочнике пока пусто. Статьи пишутся во вкладке «Справочник» или через ИИ по MCP.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
