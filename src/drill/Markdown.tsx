import type { ReactNode } from "react";
import { t } from "../i18n";
import { Linkify, openTarget } from "../ui/kit";
import { DataView } from "./DataView";
import { Code } from "./drillKit";
import { Chart, Graph, SafePlot, type ChartSpec } from "./viz";

type Item = { text: string; sub: string[] };
type Block =
  | { k: "h"; level: number; text: string }
  | { k: "p"; text: string }
  | { k: "ul" | "ol"; items: Item[] }
  | { k: "quote"; text: string }
  | { k: "table"; head: string[]; rows: string[][] }
  | { k: "hr" }
  | { k: "code"; lang: string; text: string };

const LIST = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

function parse(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ k: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      out.push({ k: "code", lang: fence[1].toLowerCase(), text: body.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      out.push({ k: "h", level: Math.min(3, h[1].length), text: h[2] });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      out.push({ k: "hr" });
      continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      i--;
      out.push({ k: "table", head, rows });
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      i--;
      out.push({ k: "quote", text: body.join(" ") });
      continue;
    }
    const li = line.match(LIST);
    if (li) {
      flush();
      const kind = /\d/.test(li[2]) ? "ol" : "ul";
      const items: Item[] = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST);
        if (!m) {
          if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
            items[items.length - 1].text += ` ${lines[i].trim()}`;
            i++;
            continue;
          }
          break;
        }
        if (m[1].length >= 2 && items.length) items[items.length - 1].sub.push(m[3]);
        else items.push({ text: m[3], sub: [] });
        i++;
      }
      i--;
      out.push({ k: kind, items });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}

const INLINE = /(`[^`]+`)|(\*\*(?:`[^`]*`|[^*`]|\*(?!\*))+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function Inline({ text, inert }: { text: string; inert?: boolean }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) parts.push(<Linkify key={`t${last}`} text={text.slice(last, m.index)} inert={inert} />);
    const tok = m[0];
    if (m[1])
      parts.push(
        <code key={m.index} className="md-inline">
          {tok.slice(1, -1)}
        </code>,
      );
    else if (m[2])
      parts.push(
        <b key={m.index}>
          <Inline text={tok.slice(2, -2)} inert={inert} />
        </b>,
      );
    else if (m[3]) parts.push(<i key={m.index}>{tok.slice(1, -1)}</i>);
    else {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const label = lm?.[1] ?? tok;
      const url = lm?.[2] ?? "";
      parts.push(
        inert || !/^https?:\/\//i.test(url) ? (
          <span key={m.index} className="link inert" title={url}>
            {label}
          </span>
        ) : (
          <a
            key={m.index}
            className="link"
            href="#"
            title={url}
            onClick={(e) => {
              e.preventDefault();
              void openTarget(url);
            }}
          >
            {label}
          </a>
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(<Linkify key={`t${last}`} text={text.slice(last)} inert={inert} />);
  return <>{parts}</>;
}

function DataBlock({ text }: { text: string }) {
  return (
    <div className="md-data">
      {text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line, i) => {
          const arrow = line.split(/\s+->\s+/);
          if (arrow.length === 2) {
            return (
              <div key={i} className="md-flow">
                <DataView value={arrow[0]} />
                <span className="md-flow-arrow">→</span>
                <DataView value={arrow[1]} />
              </div>
            );
          }
          const named = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
          return named ? <DataView key={i} name={named[1]} value={named[2]} /> : <DataView key={i} value={line} />;
        })}
    </div>
  );
}

function ChartBlock({ text }: { text: string }) {
  let spec: ChartSpec | null = null;
  let err = "";
  try {
    spec = JSON.parse(text) as ChartSpec;
    if (!Array.isArray(spec.series) || !spec.series.length) throw new Error(t("нет series", "no series"));
  } catch (e) {
    err = (e as Error).message;
  }
  if (!spec || err) return <pre className="viz-error">{t(`График не построен: ${err}`, `Can't draw the chart: ${err}`)}</pre>;
  return <Chart spec={spec} />;
}

function BlockView({ b, inert }: { b: Block; inert?: boolean }) {
  switch (b.k) {
    case "h": {
      const Tag = (["h2", "h3", "h4"] as const)[b.level - 1];
      return (
        <Tag className={`md-h${b.level}`}>
          <Inline text={b.text} inert={inert} />
        </Tag>
      );
    }
    case "p":
      return (
        <p className="md-p">
          <Inline text={b.text} inert={inert} />
        </p>
      );
    case "hr":
      return <hr className="md-hr" />;
    case "quote":
      return (
        <blockquote className="md-quote">
          <Inline text={b.text} inert={inert} />
        </blockquote>
      );
    case "ul":
    case "ol": {
      const Tag = b.k;
      return (
        <Tag className="md-list">
          {b.items.map((it, i) => (
            <li key={i}>
              <Inline text={it.text} inert={inert} />
              {it.sub.length > 0 && (
                <ul className="md-list">
                  {it.sub.map((s, j) => (
                    <li key={j}>
                      <Inline text={s} inert={inert} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {b.head.map((c, i) => (
                  <th key={i}>
                    <Inline text={c} inert={inert} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      <Inline text={c} inert={inert} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      if (b.lang === "data") return <DataBlock text={b.text} />;
      if (b.lang === "chart") return <ChartBlock text={b.text} />;
      if (b.lang === "plot") return <SafePlot src={b.text} />;
      if (b.lang === "graph") return <Graph src={b.text} />;
      if (b.lang === "python" || b.lang === "py") return <Code code={b.text} />;
      return <pre className="md-code">{b.text}</pre>;
  }
}

export function Markdown({ text, inert }: { text: string; inert?: boolean }) {
  const blocks = parse(text);
  return (
    <div className="md">
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} inert={inert} />
      ))}
    </div>
  );
}
