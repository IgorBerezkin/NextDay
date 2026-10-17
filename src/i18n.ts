export type Lang = "ru" | "en";

const KEY = "lang";

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const saved = stored();
const current: Lang = saved === "ru" || saved === "en" ? saved : navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
document.documentElement.lang = current;

export const lang = (): Lang => current;

export function t<T>(ru: T, en: T): T {
  return current === "en" ? en : ru;
}

export function follow(next: Lang) {
  if (next === current) return;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    return;
  }
  location.reload();
}
