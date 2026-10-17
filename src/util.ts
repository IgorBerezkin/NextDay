import { lang, t } from "./i18n";

export function toDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function fromDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(s: string, n: number): string {
  const d = toDate(s);
  d.setDate(d.getDate() + n);
  return fromDate(d);
}

const LOCALE = t("ru-RU", "en-US");
const fmtWeekday = new Intl.DateTimeFormat(LOCALE, { weekday: "long" });
const fmtDayMonth = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long" });
const fmtDayMonthYear = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric" });
const fmtShortMonth = new Intl.DateTimeFormat(LOCALE, { month: "short" });
const fmtShortWd = new Intl.DateTimeFormat(LOCALE, { weekday: "short" });

export const weekday = (s: string) => fmtWeekday.format(toDate(s));
export const dayMonth = (s: string) => fmtDayMonth.format(toDate(s));
export const longDate = (s: string) => `${weekday(s)}, ${dayMonth(s)}`;
export const fullDate = (s: string) => fmtDayMonthYear.format(toDate(s)).replace(" г.", "");
export const shortMonth = (s: string) => fmtShortMonth.format(toDate(s)).replace(".", "");
export const shortWeekday = (s: string) => fmtShortWd.format(toDate(s));

export function stamp(dt: string | null | undefined): string {
  if (!dt) return "";
  return t(`${dt.slice(8, 10)}.${dt.slice(5, 7)} ${dt.slice(11, 16)}`, `${shortMonth(dt)} ${Number(dt.slice(8, 10))}, ${dt.slice(11, 16)}`);
}

export function hoursText(h: number): string {
  return t(String(Math.round(h * 100) / 100).replace(".", ","), String(Math.round(h * 100) / 100));
}

export function parseHours(s: string): number | null {
  const v = s.trim().toLowerCase().replace(",", ".");
  if (!v) return null;
  const min = v.match(/^(\d+(?:\.\d+)?)\s*(м|мин|m|min)$/);
  if (min) return Number(min[1]) / 60;
  const h = v.match(/^(\d+(?:\.\d+)?)\s*(ч|h)?$/);
  if (h) return Number(h[1]);
  return NaN;
}

export function plural(n: number, one: string, few: string, many: string, enOne: string, enMany: string): string {
  if (lang() === "en") return `${n} ${n === 1 ? enOne : enMany}`;
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${w}`;
}

export function duration(sec: number): string {
  const m = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const [hu, mu] = t(["ч", "мин"], ["h", "min"]);
  if (h === 0) return `${mm} ${mu}`;
  if (mm === 0) return `${h} ${hu}`;
  return `${h} ${hu} ${mm} ${mu}`;
}

export const RATING_LABELS = t(["", "Тяжко", "Так себе", "Нормально", "Хорошо", "Огонь"], ["", "Rough", "Meh", "Okay", "Good", "Fire"]);

export const NAME_EXAMPLES = t(
  [
    "День 3D-моделирования",
    "День большой уборки",
    "День без телефона",
    "День рефакторинга",
    "День длинной прогулки",
    "День, когда всё допишу",
    "День референсов",
    "День спокойной учёбы",
  ],
  [
    "3D modeling day",
    "Big cleanup day",
    "No phone day",
    "Refactoring day",
    "Long walk day",
    "Finish everything day",
    "Reference hunting day",
    "Quiet study day",
  ],
);

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
