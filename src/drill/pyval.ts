import { t } from "../i18n";

export type Py =
  | { t: "none" }
  | { t: "bool"; v: boolean }
  | { t: "int"; v: string }
  | { t: "float"; v: number }
  | { t: "str"; v: string }
  | { t: "list"; v: Py[] }
  | { t: "tuple"; v: Py[] }
  | { t: "dict"; v: [Py, Py][] }
  | { t: "set"; v: Py[] }
  | { t: "name"; v: string };

class Reader {
  i = 0;
  constructor(readonly s: string) {}
  peek() {
    return this.s[this.i];
  }
  skip() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }
  eat(c: string) {
    this.skip();
    if (this.s[this.i] === c) {
      this.i++;
      return true;
    }
    return false;
  }
  expect(c: string) {
    if (!this.eat(c)) throw new Error(t(`ожидался символ ${c}`, `expected ${c}`));
  }
}

function canonInt(d: string) {
  const neg = d.startsWith("-");
  const t = (neg ? d.slice(1) : d).replace(/^0+/, "") || "0";
  return neg && t !== "0" ? `-${t}` : t;
}

function value(r: Reader, depth: number): Py {
  if (depth > 40) throw new Error(t("слишком глубоко", "nested too deep"));
  r.skip();
  const c = r.peek();
  if (c === undefined) throw new Error(t("ответ оборвался", "the answer ends too early"));
  if (c === "[") {
    r.i++;
    return { t: "list", v: items(r, "]", depth).items };
  }
  if (c === "(") {
    r.i++;
    const { items: xs, comma } = items(r, ")", depth);
    return xs.length === 1 && !comma ? xs[0] : { t: "tuple", v: xs };
  }
  if (c === "{") {
    r.i++;
    return braces(r, depth);
  }
  if (c === "'" || c === '"') return str(r);
  if (c === "-" || c === "+") {
    r.i++;
    const v = value(r, depth + 1);
    if (v.t === "int") return { t: "int", v: c === "-" ? canonInt(`-${v.v}`) : v.v };
    if (v.t === "float") return { t: "float", v: c === "-" ? -v.v : v.v };
    throw new Error(t("знак только перед числом", "a sign goes only before a number"));
  }
  if (/[0-9.]/.test(c)) return num(r);
  if (/[A-Za-z_Ѐ-ӿ]/.test(c)) return word(r, depth);
  throw new Error(t(`непонятный символ ${c}`, `unexpected character ${c}`));
}

function items(r: Reader, close: string, depth: number) {
  const out: Py[] = [];
  let comma = false;
  for (;;) {
    if (r.eat(close)) return { items: out, comma };
    out.push(value(r, depth + 1));
    if (r.eat(",")) {
      comma = true;
      continue;
    }
    r.expect(close);
    return { items: out, comma };
  }
}

function braces(r: Reader, depth: number): Py {
  if (r.eat("}")) return { t: "dict", v: [] };
  const first = value(r, depth + 1);
  if (r.eat(":")) {
    const pairs: [Py, Py][] = [[first, value(r, depth + 1)]];
    while (r.eat(",")) {
      if (r.eat("}")) return { t: "dict", v: pairs };
      const k = value(r, depth + 1);
      r.expect(":");
      pairs.push([k, value(r, depth + 1)]);
    }
    r.expect("}");
    return { t: "dict", v: pairs };
  }
  const xs = [first];
  while (r.eat(",")) {
    if (r.eat("}")) return { t: "set", v: xs };
    xs.push(value(r, depth + 1));
  }
  r.expect("}");
  return { t: "set", v: xs };
}

function word(r: Reader, depth: number): Py {
  const start = r.i;
  while (r.i < r.s.length && /[A-Za-z0-9_Ѐ-ӿ]/.test(r.s[r.i])) r.i++;
  const w = r.s.slice(start, r.i);
  if (w === "True" || w === "False") return { t: "bool", v: w === "True" };
  if (w === "None") return { t: "none" };
  if ((w === "set" || w === "frozenset") && r.eat("(")) {
    if (r.eat(")")) return { t: "set", v: [] };
    const inner = value(r, depth + 1);
    r.expect(")");
    if (inner.t === "list" || inner.t === "tuple" || inner.t === "set") return { t: "set", v: inner.v };
    if (inner.t === "str") return { t: "set", v: [...new Set(inner.v)].map((ch) => ({ t: "str", v: ch }) as Py) };
    throw new Error(t("set() понимает только список, кортеж или строку", "set() takes only a list, tuple or string"));
  }
  return { t: "name", v: w };
}

function num(r: Reader): Py {
  const start = r.i;
  let float = false;
  while (r.i < r.s.length) {
    const c = r.s[r.i];
    if (/[0-9_]/.test(c)) r.i++;
    else if (c === ".") {
      float = true;
      r.i++;
    } else if (c === "e" || c === "E") {
      float = true;
      r.i++;
      if (r.s[r.i] === "+" || r.s[r.i] === "-") r.i++;
    } else break;
  }
  const raw = r.s.slice(start, r.i).replace(/_/g, "");
  if (float) {
    const f = Number(raw);
    if (!Number.isFinite(f)) throw new Error(t(`непонятное число ${raw}`, `bad number ${raw}`));
    return { t: "float", v: f };
  }
  if (!/^\d+$/.test(raw)) throw new Error(t(`непонятное число ${raw}`, `bad number ${raw}`));
  return { t: "int", v: canonInt(raw) };
}

const ESC: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "\\": "\\",
  "'": "'",
  '"': '"',
  a: "\x07",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
};

function str(r: Reader): Py {
  const q = r.s[r.i++];
  let out = "";
  for (;;) {
    const c = r.s[r.i++];
    if (c === undefined) throw new Error(t("строка не закрыта кавычкой", "the string has no closing quote"));
    if (c === q) return { t: "str", v: out };
    if (c !== "\\") {
      out += c;
      continue;
    }
    const e = r.s[r.i++];
    if (e === undefined) throw new Error(t("строка оборвалась", "the string ends too early"));
    if (e === "x" || e === "u" || e === "U") {
      const n = e === "x" ? 2 : e === "u" ? 4 : 8;
      const code = parseInt(r.s.slice(r.i, r.i + n), 16);
      if (Number.isNaN(code)) throw new Error(t("непонятный код символа", "bad character code"));
      out += String.fromCodePoint(code);
      r.i += n;
    } else if (e in ESC) out += ESC[e];
    else out += `\\${e}`;
  }
}

export function parsePy(text: string): Py | null {
  try {
    const r = new Reader(text);
    r.skip();
    if (r.i >= r.s.length) return null;
    const first = value(r, 0);
    const all = [first];
    let bare = false;
    while (r.eat(",")) {
      bare = true;
      r.skip();
      if (r.i >= r.s.length) break;
      all.push(value(r, 0));
    }
    r.skip();
    if (r.i < r.s.length) return null;
    return bare ? { t: "tuple", v: all } : first;
  } catch {
    return null;
  }
}

function union(shapes: string[]) {
  const u = [...new Set(shapes)].sort();
  return u.length ? u.join(" | ") : "?";
}

export function shapeOf(v: Py): string {
  switch (v.t) {
    case "none":
      return "None";
    case "bool":
    case "int":
    case "float":
    case "str":
      return v.t;
    case "tuple":
      return `tuple[${v.v.map(shapeOf).join(", ")}]`;
    case "list":
    case "set":
      return `${v.t}[${union(v.v.map(shapeOf))}]`;
    case "dict":
      return `dict[${union(v.v.map(([k]) => shapeOf(k)))}, ${union(v.v.map(([, x]) => shapeOf(x)))}]`;
    case "name":
      return v.v;
  }
}

function quote(s: string) {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  const body = s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
  return q + (q === "'" ? body.replace(/'/g, "\\'") : body) + q;
}

function floatText(f: number) {
  if (Number.isInteger(f) && Math.abs(f) < 1e16) return `${f}.0`;
  return String(f);
}

export function reprPy(v: Py): string {
  switch (v.t) {
    case "none":
      return "None";
    case "bool":
      return v.v ? "True" : "False";
    case "int":
      return v.v;
    case "float":
      return floatText(v.v);
    case "str":
      return quote(v.v);
    case "list":
      return `[${v.v.map(reprPy).join(", ")}]`;
    case "tuple":
      return v.v.length === 1 ? `(${reprPy(v.v[0])},)` : `(${v.v.map(reprPy).join(", ")})`;
    case "set":
      return v.v.length ? `{${v.v.map(reprPy).join(", ")}}` : "set()";
    case "dict":
      return `{${v.v.map(([k, x]) => `${reprPy(k)}: ${reprPy(x)}`).join(", ")}}`;
    case "name":
      return v.v;
  }
}

export function samePy(a: Py, b: Py): boolean {
  if (a.t !== b.t) return false;
  switch (a.t) {
    case "list":
    case "tuple": {
      const bv = (b as typeof a).v;
      return a.v.length === bv.length && a.v.every((x, i) => samePy(x, bv[i]));
    }
    case "set": {
      const rest = [...(b as typeof a).v];
      if (rest.length !== a.v.length) return false;
      for (const x of a.v) {
        const i = rest.findIndex((y) => samePy(x, y));
        if (i < 0) return false;
        rest.splice(i, 1);
      }
      return true;
    }
    case "dict": {
      const bv = (b as typeof a).v;
      return a.v.length === bv.length && a.v.every(([k, x]) => bv.some(([k2, y]) => samePy(k, k2) && samePy(x, y)));
    }
    case "none":
      return true;
    default:
      return (a as { v: unknown }).v === (b as { v: unknown }).v;
  }
}

const TYPE_NAME: Record<Py["t"], string> = t(
  {
    none: "None",
    bool: "логическое значение",
    int: "целое число",
    float: "дробное число",
    str: "строка",
    list: "список",
    tuple: "кортеж",
    dict: "словарь",
    set: "множество",
    name: "имя",
  },
  {
    none: "None",
    bool: "bool",
    int: "int",
    float: "float",
    str: "str",
    list: "list",
    tuple: "tuple",
    dict: "dict",
    set: "set",
    name: "name",
  },
);

const ROOT = t("ответ", "answer");

function code(s: string) {
  return s.includes("`") ? s : `\`${s}\``;
}

function what(v: Py) {
  const r = reprPy(v);
  const shown = code(r.length > 40 ? r.slice(0, 39) + "…" : r);
  return v.t === "none" ? shown : `${TYPE_NAME[v.t]} ${shown}`;
}

function at(path: string) {
  return path === ROOT ? path : code(path);
}

function key(v: Py) {
  return code(reprPy(v));
}

export function explainDiff(want: Py, got: Py, path = ROOT): string[] {
  if (samePy(want, got)) return [];
  if (want.t !== got.t) {
    const special =
      (want.t === "int" && got.t === "str") || (want.t === "str" && got.t === "int")
        ? t(
            " Число и строка с цифрами это разные значения: `3` не равно `'3'`.",
            " A number and a string of digits are different values: `3` is not `'3'`.",
          )
        : (want.t === "int" && got.t === "float") || (want.t === "float" && got.t === "int")
          ? t(" Целое и дробное это разные типы: `3` не равно `3.0`.", " Integers and floats are different types: `3` is not `3.0`.")
          : (want.t === "list" && got.t === "tuple") || (want.t === "tuple" && got.t === "list")
            ? t(" Квадратные скобки это список, круглые это кортеж.", " Square brackets make a list, round ones a tuple.")
            : want.t === "name"
              ? t(" Здесь код падает с ошибкой.", " Here the code crashes with an error.")
              : "";
    return [
      t(
        `${at(path)}: правильно ${what(want)}, а у тебя ${what(got)}.${special}`,
        `${at(path)}: should be ${what(want)}, you have ${what(got)}.${special}`,
      ),
    ];
  }
  if (want.t === "list" || want.t === "tuple") {
    const gv = (got as typeof want).v;
    const out: string[] = [];
    if (want.v.length !== gv.length)
      out.push(
        t(
          `${at(path)}: правильная длина ${want.v.length}, а у тебя ${gv.length}.`,
          `${at(path)}: length should be ${want.v.length}, you have ${gv.length}.`,
        ),
      );
    const flat = want.v.some((x) => x.t === "list" || x.t === "tuple") !== gv.some((x) => x.t === "list" || x.t === "tuple");
    if (flat)
      out.push(
        t(
          `${at(path)}: разная вложенность, правильно ${code(shapeOf(want))}, а у тебя ${code(shapeOf(got))}.`,
          `${at(path)}: different nesting, should be ${code(shapeOf(want))}, you have ${code(shapeOf(got))}.`,
        ),
      );
    for (let i = 0; i < Math.min(want.v.length, gv.length) && out.length < 3; i++) {
      out.push(...explainDiff(want.v[i], gv[i], `${path}[${i}]`));
    }
    if (!out.length) out.push(t(`${at(path)}: другой порядок элементов.`, `${at(path)}: items are in a different order.`));
    return out.slice(0, 3);
  }
  if (want.t === "dict") {
    const gv = (got as typeof want).v;
    const out: string[] = [];
    for (const [k] of want.v)
      if (!gv.some(([k2]) => samePy(k, k2))) out.push(t(`${at(path)}: нет ключа ${key(k)}.`, `${at(path)}: missing key ${key(k)}.`));
    for (const [k] of gv)
      if (!want.v.some(([k2]) => samePy(k, k2))) out.push(t(`${at(path)}: лишний ключ ${key(k)}.`, `${at(path)}: extra key ${key(k)}.`));
    for (const [k, x] of want.v) {
      const hit = gv.find(([k2]) => samePy(k, k2));
      if (hit && out.length < 3) out.push(...explainDiff(x, hit[1], `${path}[${reprPy(k)}]`));
    }
    return out.slice(0, 3);
  }
  if (want.t === "set") {
    const gv = (got as typeof want).v;
    const miss = want.v.filter((x) => !gv.some((y) => samePy(x, y)));
    const extra = gv.filter((x) => !want.v.some((y) => samePy(x, y)));
    const out: string[] = [];
    if (miss.length)
      out.push(
        t(
          `${at(path)}: не хватает ${miss.map((x) => code(reprPy(x))).join(", ")}.`,
          `${at(path)}: missing ${miss.map((x) => code(reprPy(x))).join(", ")}.`,
        ),
      );
    if (extra.length)
      out.push(
        t(
          `${at(path)}: лишние ${extra.map((x) => code(reprPy(x))).join(", ")}.`,
          `${at(path)}: extra ${extra.map((x) => code(reprPy(x))).join(", ")}.`,
        ),
      );
    if (!out.length) out.push(t(`${at(path)}: в множестве повторы не считаются.`, `${at(path)}: repeats don't count in a set.`));
    return out;
  }
  return [
    t(
      `${at(path)}: правильно ${code(reprPy(want))}, а у тебя ${code(reprPy(got))}.`,
      `${at(path)}: should be ${code(reprPy(want))}, you have ${code(reprPy(got))}.`,
    ),
  ];
}
