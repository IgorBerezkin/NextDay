import { t } from "../i18n";
import { parsePy, reprPy, shapeOf, type Py } from "./pyval";

const LIMIT = 10;

function isAtom(v: Py) {
  return v.t !== "list" && v.t !== "tuple" && v.t !== "dict" && v.t !== "set";
}

function asGrid(v: Py): Py[][] | null {
  if (v.t !== "list" || v.v.length < 2) return null;
  const rows = v.v;
  if (!rows.every((r) => (r.t === "list" || r.t === "tuple") && r.v.length > 0 && r.v.length <= LIMIT && r.v.every(isAtom))) return null;
  const n = (rows[0] as { v: Py[] }).v.length;
  if (!rows.every((r) => (r as { v: Py[] }).v.length === n)) return null;
  return rows.map((r) => (r as { v: Py[] }).v);
}

function Atom({ v }: { v: Py }) {
  return <span className={`dv-atom dv-${v.t}`}>{reprPy(v)}</span>;
}

function More({ n }: { n: number }) {
  return n > 0 ? <span className="dv-more">{t(`…ещё ${n}`, `+${n} more`)}</span> : null;
}

function Node({ v, depth }: { v: Py; depth: number }) {
  if (isAtom(v)) return <Atom v={v} />;
  if (depth > 4) return <span className="dv-atom">{reprPy(v).slice(0, 30)}…</span>;
  if (v.t === "dict") {
    if (!v.v.length) return <span className="dv-empty">{"{}"}</span>;
    return (
      <span className="dv-dict">
        {v.v.slice(0, LIMIT).map(([k, x], i) => (
          <span key={i} className="dv-pair">
            <span className="dv-key">
              <Node v={k} depth={depth + 1} />
            </span>
            <span className="dv-arrow">→</span>
            <Node v={x} depth={depth + 1} />
          </span>
        ))}
        <More n={v.v.length - LIMIT} />
      </span>
    );
  }
  const grid = asGrid(v);
  if (grid) {
    return (
      <table className="dv-grid">
        <thead>
          <tr>
            <th />
            {grid[0].map((_, j) => (
              <th key={j}>{j}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.slice(0, LIMIT).map((row, i) => (
            <tr key={i}>
              <th>{i}</th>
              {row.map((x, j) => (
                <td key={j} className={(v.v[i] as Py).t === "tuple" ? "dv-tuprow" : ""}>
                  <Atom v={x} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {grid.length > LIMIT && (
          <tfoot>
            <tr>
              <td colSpan={grid[0].length + 1}>
                <More n={grid.length - LIMIT} />
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    );
  }
  const items = v.v;
  if (!items.length) return <span className="dv-empty">{v.t === "list" ? "[ ]" : v.t === "tuple" ? "( )" : "set()"}</span>;
  return (
    <span className={`dv-seq dv-${v.t}`}>
      {items.slice(0, LIMIT).map((x, i) => (
        <span key={i} className="dv-cell">
          {v.t !== "set" && <i className="dv-idx">{i}</i>}
          <Node v={x} depth={depth + 1} />
        </span>
      ))}
      <More n={items.length - LIMIT} />
    </span>
  );
}

function size(v: Py): string | null {
  if (v.t === "str") return t(`длина ${v.v.length}`, `length ${v.v.length}`);
  if (v.t === "list" || v.t === "tuple" || v.t === "set" || v.t === "dict") {
    const grid = asGrid(v);
    if (grid) return `${grid.length} x ${grid[0].length}`;
    return t(`длина ${v.v.length}`, `length ${v.v.length}`);
  }
  return null;
}

function tidy(shape: string | undefined) {
  return shape?.replace(/\[\?(, \?)?\]/g, "");
}

export function DataView({ value, name, shape, plain }: { value: string; name?: string; shape?: string; plain?: boolean }) {
  const v = parsePy(value);
  const head = (sh: string | undefined, len: string | null) =>
    !plain && (name || sh) ? (
      <div className="dv-head">
        {name && <b className="dv-name">{name}</b>}
        {sh && <code className="dv-shape">{tidy(sh)}</code>}
        {len && <span className="dv-len">{len}</span>}
      </div>
    ) : null;
  if (!v || v.t === "name") {
    return (
      <div className="dv">
        {head(shape, null)}
        <code className="dv-raw">{value}</code>
      </div>
    );
  }
  return (
    <div className="dv">
      {head(shape ?? shapeOf(v), size(v))}
      <div className="dv-body">
        <Node v={v} depth={0} />
      </div>
    </div>
  );
}
