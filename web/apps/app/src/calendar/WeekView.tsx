import { useT } from "../i18n";
import { cn } from "../ui/cn";
import { EventChip } from "./EventChip";
import {
  addDays,
  dayKey,
  eventsByDay,
  isToday,
  startOfWeek,
  weekdayShort,
  type CalendarEvent,
} from "./calendarUtils";

export function WeekView({
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
  const { lang } = useT();
  const byDay = eventsByDay(events);
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface">
      {/* Desktop: seven columns */}
      <div className="hidden lg:grid lg:grid-cols-7">
        {days.map((day) => {
          const list = byDay.get(dayKey(day)) ?? [];
          return (
            <div
              key={dayKey(day)}
              className="min-h-[24rem] border-r border-border-subtle p-2 last:border-r-0"
            >
              <div className="mb-2 flex items-center justify-between gap-1">
                <span className="text-xs font-semibold uppercase text-muted">
                  {weekdayShort(day, lang)}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    isToday(day)
                      ? "bg-primary-strong text-primary-foreground"
                      : "text-ink hover:bg-surface-hover",
                  )}
                >
                  {day.getDate()}
                </button>
              </div>
              <ul className="space-y-1">
                {list.map((event) => (
                  <li key={event.eventId}>
                    <EventChip event={event} onClick={() => onOpen(event)} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Mobile: day list */}
      <ul className="divide-y divide-border-subtle lg:hidden">
        {days.map((day) => {
          const list = byDay.get(dayKey(day)) ?? [];
          return (
            <li key={dayKey(day)} className="flex gap-3 p-3">
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                className={cn(
                  "flex w-12 shrink-0 flex-col items-center rounded-xl py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  isToday(day)
                    ? "bg-primary-strong text-primary-foreground"
                    : "text-ink",
                )}
              >
                <span className="text-[10px] uppercase">
                  {weekdayShort(day, lang)}
                </span>
                <span className="text-lg font-semibold">{day.getDate()}</span>
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                {list.map((event) => (
                  <EventChip
                    key={event.eventId}
                    event={event}
                    onClick={() => onOpen(event)}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
