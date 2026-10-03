import type { UpcomingActivity } from "../api/client";
import type { I18nKey } from "../i18n";

export type CalendarView = "month" | "week" | "day";
export type CalendarEvent = UpcomingActivity;

export const GROUP_COLORS = [
  "#8366f1",
  "#0ea5e9",
  "#10b981",
  "#f3b626",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
];

/** Stable color per group id. */
export function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return GROUP_COLORS[hash % GROUP_COLORS.length];
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** Monday-first start of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return addDays(startOfDay(date), -offset);
}

export function endOfWeek(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return addDays(startOfDay(date), 6 - offset);
}

export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function monthLabel(date: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function longDate(date: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function shortDate(date: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function weekdayShort(date: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang, { weekday: "short" }).format(date);
}

export function timeLabel(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function weekdayLabels(lang: string): string[] {
  const monday = startOfWeek(new Date());
  return Array.from({ length: 7 }, (_, index) =>
    weekdayShort(addDays(monday, index), lang),
  );
}

export function eventTypeKey(type: string): I18nKey {
  switch (type) {
    case "rehearsal":
      return "calendario.typeRehearsal";
    case "performance":
      return "calendario.typePerformance";
    default:
      return "calendario.typeOther";
  }
}

/** Groups events by local day key, sorted by start time. */
export function eventsByDay(
  events: CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const date = new Date(event.startsAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  }
  return map;
}

/** The visible range for a view + cursor. `to` is exclusive. */
export function rangeFor(view: CalendarView, cursor: Date): { from: Date; to: Date } {
  if (view === "month") {
    return {
      from: startOfWeek(startOfMonth(cursor)),
      to: addDays(endOfWeek(endOfMonth(cursor)), 1),
    };
  }
  if (view === "week") {
    return { from: startOfWeek(cursor), to: addDays(endOfWeek(cursor), 1) };
  }
  return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 1) };
}
