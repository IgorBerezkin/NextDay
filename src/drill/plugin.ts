import type { BankCard, BankTopic, GenVariant } from "../api";

export type GenMeta = { title: string; description: string; topics: BankTopic[]; templates: BankCard[] };
export type GenOutput = { variants: Record<string, GenVariant[]>; errors: Record<string, string> };

const PRELUDE = `
;(() => {
  const names = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "SharedWorker", "BroadcastChannel", "indexedDB", "caches", "WebTransport"];
  for (const k of names) {
    try { delete self[k]; } catch (e) {}
    try { Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false }); } catch (e) {}
  }
})();
`;

const HARNESS = `
;(() => {
  const P = typeof plugin !== "undefined" ? plugin : null;
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => {
    let s = (seed >>> 0) || 1;
    const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
    return {
      random: next,
      int: (a, b) => a + Math.floor(next() * (b - a + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p = 0.5) => next() < p,
      shuffle,
      sample: (arr, k) => shuffle(arr).slice(0, k),
    };
  };
  const str = (v) => (v === undefined || v === null ? "" : typeof v === "string" ? v : String(v));
  const list = (v) => (Array.isArray(v) ? v.map(str) : []);
  const variant = (v) => ({ question: str(v.question ?? v.prompt), code: str(v.code), answer: str(v.answer), choices: list(v.choices), alternatives: list(v.alternatives), explain: str(v.explain) });
  onmessage = (e) => {
    const req = e.data;
    try {
      if (!P || !Array.isArray(P.templates)) throw new Error("скрипт должен объявить const plugin = { topics: [...], templates: [...] }");
      if (req.op === "meta") {
        const topics = Array.isArray(P.topics) ? P.topics : [];
        postMessage({ ok: true, data: {
          title: str(P.title),
          description: str(P.description),
          topics: topics.map((t) => ({ id: str(t && t.id), title: str(t && t.title), theory: str(t && t.theory) })),
          templates: P.templates.map((t) => ({ id: str(t && t.id), topic: str(t && t.topic), kind: str(t && t.kind), rule: str(t && t.rule), check: t && t.check && typeof t.check === "object" ? JSON.parse(JSON.stringify(t.check)) : null })),
        } });
        return;
      }
      const variants = {};
      const errors = {};
      for (const id of req.templates) {
        const t = P.templates.find((x) => x && x.id === id);
        const out = [];
        variants[id] = out;
        if (!t || typeof t.make !== "function") { errors[id] = "у шаблона нет функции make(r)"; continue; }
        const seen = new Set();
        try {
          for (let k = 0; k < req.count * 6 && out.length < req.count; k++) {
            const v = variant(t.make(rng(req.seed + Math.imul(k + 1, 7919) + hash(id))) || {});
            const key = JSON.stringify(v);
            if (!seen.has(key)) { seen.add(key); out.push(v); }
          }
        } catch (err) {
          errors[id] = str((err && err.message) || err);
        }
      }
      postMessage({ ok: true, data: { variants, errors } });
    } catch (err) {
      postMessage({ ok: false, error: str((err && err.message) || err) });
    }
  };
})();
`;

function run<T>(code: string, req: object, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([`${PRELUDE}\n${code}\n${HARNESS}`], { type: "text/javascript" }));
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch (e) {
      URL.revokeObjectURL(url);
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const finish = (f: () => void) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      f();
    };
    const timer = setTimeout(() => finish(() => reject(new Error(`генератор думает дольше ${timeoutMs / 1000} с`))), timeoutMs);
    worker.onmessage = (e: MessageEvent<{ ok: boolean; data?: T; error?: string }>) =>
      finish(() => (e.data.ok ? resolve(e.data.data as T) : reject(new Error(e.data.error ?? "ошибка генератора"))));
    worker.onerror = (e) => {
      e.preventDefault();
      finish(() => reject(new Error(e.message ? `ошибка в коде: ${e.message}` : "ошибка в коде генератора")));
    };
    worker.postMessage(req);
  });
}

export async function genMeta(code: string): Promise<GenMeta> {
  const m = await run<GenMeta>(code, { op: "meta" }, 3000);
  if (!m.templates.length) throw new Error("в plugin.templates нет ни одного шаблона");
  return m;
}

export async function genVariants(code: string, templates: string[], count: number): Promise<GenOutput> {
  const seed = Math.floor(Math.random() * 2 ** 31);
  return run<GenOutput>(code, { op: "make", templates, count, seed }, 6000);
}
