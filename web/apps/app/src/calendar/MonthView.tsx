import { ChevronDown } from "lucide-react";
import { useT } from "../i18n";
import { cn } from "../ui/cn";
import { EventChip } from "./EventChip";
import {
  addDays,
  dayKey,
  endOfMonth,
  endOfWeek,
  eventsByDay,
  isToday,
  startOfMonth,
  startOfWeek,
  weekdayLabels,
  type CalendarEvent,
} from "./calendarUtils";

const MAX_CHIPS = 3;
export function MonthView({
  cursor,
  events,
  onOpen,
  onSelectDay,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onOpen: (event: CalendarEvent) => void;
  onSelectDay: (date: Date) => void;
}) {
  const { t, lang } = useT();
  const byDay = eventsByDay(events);
  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEnd = endOfWeek(endOfMonth(cursor));
  const days: Date[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    days.push(day);
  }
  const letters = weekdayLabels(lang);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
      <div className="min-w-[44rem]">
        <div className="grid grid-cols-7 border-b border-border-subtle">
          {letters.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="flex items-center justify-center gap-1 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted"
            >
              {label}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = dayKey(day);
            const inMonth = day.getMonth() === cursor.getMonth();
            const list = byDay.get(key) ?? [];
            return (
              <div
                key={key}
                data-testid="calendar-day"
                className={cn(
                  "min-h-28 border-b border-r border-border-subtle p-1.5",
                  !inMonth && "bg-surface-hover/40",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className={cn(
                    "mb-1 grid h-11 w-11 place-items-center rounded-full text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    isToday(day)
                      ? "bg-primary-strong text-primary-foreground"
                      : inMonth
                        ? "text-ink hover:bg-surface-hover"
                        : "text-muted hover:bg-surface-hover",
                  )}
                >
                  {day.getDate()}
                </button>
                <ul className="space-y-1">
                  {list.slice(0, MAX_CHIPS).map((event) => (
                    <li key={event.eventId}>
                      <EventChip event={event} onClick={() => onOpen(event)} />
                    </li>
                  ))}
                  {list.length > MAX_CHIPS ? (
                    <li className="px-1.5 text-[11px] font-medium text-muted">
                      {t("calendar.more", {
                        count: list.length - MAX_CHIPS,
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
  );
}
