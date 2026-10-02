import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  listCalendarEvents,
  problemDetail,
  type UpcomingActivity,
} from "../api/client";
import { useT } from "../i18n";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";

const GROUP_COLORS = [
  "#8366f1",
  "#0ea5e9",
  "#10b981",
  "#f3b626",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
];

function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return GROUP_COLORS[hash % GROUP_COLORS.length];
}

const MAX_CHIPS = 3;

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Monday-first start of the week containing `date`. */
function startOfWeek(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, -offset);
}

function endOfWeek(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, 6 - offset);
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function timeLabel(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Read-only general calendar of every group's events (ADR-0053 addendum). */
export function CalendarPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const [events, setEvents] = useState<UpcomingActivity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const gridStart = useMemo(
    () => startOfWeek(startOfMonth(cursor.year, cursor.month)),
    [cursor],
  );
  const gridEnd = useMemo(
    () => endOfWeek(new Date(cursor.year, cursor.month + 1, 0)),
    [cursor],
  );

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
      list.push(day);
    }
    return list;
  }, [gridStart, gridEnd]);

  useEffect(() => {
    let cancelled = false;
    listCalendarEvents(
      gridStart.toISOString(),
      addDays(gridEnd, 1).toISOString(),
    )
      .then((items) => {
        if (!cancelled) {
          setEvents(items);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(problemDetail(err));
          setEvents([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gridStart, gridEnd, reloadKey]);

  const byDay = useMemo(() => {
    const map = new Map<string, UpcomingActivity[]>();
    for (const event of events ?? []) {
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
  }, [events]);

  const groupsPresent = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events ?? []) map.set(event.groupId, event.groupName);
    return [...map.entries()];
  }, [events]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(lang, {
        month: "long",
        year: "numeric",
      }).format(startOfMonth(cursor.year, cursor.month)),
    [cursor, lang],
  );

  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(lang, { weekday: "short" });
    const monday = startOfWeek(today);
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(addDays(monday, index)),
    );
  }, [lang, today]);

  function shiftMonth(delta: number) {
    setLoading(true);
    setError(null);
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function goToday() {
    setLoading(true);
    setError(null);
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
  }

  const todayKey = dayKey(today);

  return (
    <section className="space-y-6" aria-labelledby="calendar-heading">
      <header className="space-y-1.5">
        <h1 id="calendar-heading" className="text-3xl font-bold tracking-tight text-ink">
          {t("calendario.title")}
        </h1>
        <p className="text-muted">{t("calendario.subtitle")}</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            aria-label={t("calendario.prev")}
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <p
            className="min-w-[10rem] text-center text-lg font-semibold first-letter:uppercase text-ink"
            aria-live="polite"
          >
            {monthLabel}
          </p>
          <Button
            variant="secondary"
            aria-label={t("calendario.next")}
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <Button
          variant="secondary"
          onClick={goToday}
        >
          {t("calendario.today")}
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-error/20 bg-error/10 px-5 py-4"
        >
          <p className="text-sm text-error-ink">{error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              setError(null);
              setReloadKey((key) => key + 1);
            }}
          >
            {t("home.retry")}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-7 border-b border-border-subtle">
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = dayKey(day);
              const inMonth = day.getMonth() === cursor.month;
              const dayEvents = byDay.get(key) ?? [];
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  data-testid="calendar-day"
                  className={cn(
                    "min-h-28 border-b border-r border-border-subtle p-1.5 last:border-r-0",
                    !inMonth && "bg-surface-hover/40",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-xs font-semibold",
                      isToday
                        ? "bg-primary-strong text-primary-foreground"
                        : inMonth
                          ? "text-ink"
                          : "text-muted",
                    )}
                  >
                    {day.getDate()}
                  </div>
                  <ul className="space-y-1">
                    {dayEvents.slice(0, MAX_CHIPS).map((event) => (
                      <li key={event.eventId}>
                        <button
                          type="button"
                          data-testid="calendar-event"
                          onClick={() =>
                            navigate(
                              `/groups/${event.groupId}/events/${event.eventId}`,
                            )
                          }
                          title={`${event.title} · ${event.groupName}`}
                          className="flex w-full items-center gap-1.5 rounded-lg bg-surface-hover px-1.5 py-1 text-left text-xs text-ink hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: colorFor(event.groupId) }}
                            aria-hidden="true"
                          />
                          <span className="shrink-0 font-medium">
                            {timeLabel(event.startsAt, lang)}
                          </span>
                          <span className="truncate">{event.title}</span>
                        </button>
                      </li>
                    ))}
                    {dayEvents.length > MAX_CHIPS ? (
                      <li className="px-1.5 text-[11px] font-medium text-muted">
                        {t("calendario.more", {
                          count: dayEvents.length - MAX_CHIPS,
                        })}
                      </li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <p aria-live="polite" className="text-sm text-muted">
          {t("calendario.loading")}
        </p>
      ) : events && events.length === 0 && !error ? (
        <p className="text-sm text-muted">{t("calendario.noEvents")}</p>
      ) : null}

      {groupsPresent.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label={t("sidebar.myGroups")}>
          {groupsPresent.map(([id, name]) => (
            <li key={id} className="flex items-center gap-2 text-sm text-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colorFor(id) }}
                aria-hidden="true"
              />
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
