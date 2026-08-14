import type { Localized } from "@/db/schema";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";

/** Reads a localised registry label, falling back through Azerbaijani to any populated value. */
export function label(value: Localized | null | undefined, locale: string): string {
  if (!value) return "—";
  const key: Locale = isLocale(locale) ? locale : defaultLocale;
  return value[key] || value[defaultLocale] || Object.values(value).find(Boolean) || "—";
}

/** The operation number an operator reads ("16.1"), falling back to the ordering key. */
export function operationNo(operation: { seq: number; displayNo?: string | null }): string {
  return operation.displayNo || String(operation.seq);
}

/** `datetime-local` input value in the browser's own wall-clock terms. */
export function toLocalInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function formatDateTime(date: Date | null | undefined, locale: string): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function formatDate(date: Date | string | null | undefined, locale: string): string {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  return new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(value);
}

/** hh:mm as the paper journal shows it. */
export function formatTime(date: Date | null | undefined): string {
  if (!date) return "—";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function monthLabel(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

/** Today as YYYY-MM-DD, matching the `date` column type. */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
