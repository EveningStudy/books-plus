import { useSyncExternalStore } from "react";
import { translate, translateMessage } from "../desktop/i18n.mjs";
export type Locale = "zh" | "en";
const storageKey = "booksplus.locale.v1";
let language: Locale = "zh";
try {
  if (localStorage.getItem(storageKey) === "en") language = "en";
} catch {
  /* Native settings remain available when browser storage is blocked. */
}
const listeners = new Set<() => void>();
export const getLocale = () => language;
export function applyLocale(next: Locale) {
  if (next !== "zh" && next !== "en") return;
  const changed = language !== next;
  language = next;
  document.documentElement.lang = next === "en" ? "en" : "zh-CN";
  try {
    localStorage.setItem(storageKey, next);
  } catch {}
  if (changed) listeners.forEach((notify) => notify());
}
export function useLocale() {
  return useSyncExternalStore((notify) => {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }, getLocale);
}
export const t = (key: string, values: readonly unknown[] = []) =>
  translate(language, key, values);
export const tm = (message: string) => translateMessage(language, message);
export async function setLocale(next: Locale) {
  const previous = language;
  applyLocale(next);
  try {
    await window.reader?.setLocale(next);
  } catch (error) {
    applyLocale(previous);
    throw error;
  }
}
export async function initializeLocale() {
  window.reader?.onLocaleChange(applyLocale);
  if (window.reader) {
    try {
      applyLocale(await window.reader.getLocale());
    } catch {
      applyLocale(language);
    }
  } else applyLocale(language);
}
