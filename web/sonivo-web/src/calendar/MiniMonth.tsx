import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "../i18n";
import { cn } from "../ui/cn";
import {
  addDays,
  dayKey,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isToday,
  monthLabel,
  startOfMonth,
  startOfWeek,
  weekdayLabels,
} from "./calendarUtils";

/** Small month picker used in the calendar rail (and mobile month view). */
export function MiniMonth({
  cursor,
  selected,
  eventDays,
  onSelect,
  onPrev,
  onNext,
}: {
  cursor: Date;
  selected: Date;
  eventDays: Set<string>;
  onSelect: (date: Date) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t, lang } = useT();
  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEnd = endOfWeek(endOfMonth(cursor));
  const days: Date[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    days.push(day);
  }
  const letters = weekdayLabels(lang).map((label) =>
    label.charAt(0).toUpperCase(),
  );

  return (
    <section
      className="rounded-2xl border border-border-subtle bg-surface p-3"
      aria-label={t("calendario.title")}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrev}
          aria-label={t("calendario.prev")}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold text-ink first-letter:uppercase">
          {monthLabel(cursor, lang)}
        </p>
        <button
          type="button"
          onClick={onNext}
          aria-label={t("calendario.next")}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-muted">
        {letters.map((letter, index) => (
          <span key={`${letter}-${index}`}>{letter}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = dayKey(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const isSelected = isSameDay(day, selected);
          const hasEvents = eventDays.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(day)}
              aria-pressed={isSelected}
              className={cn(
                "relative grid h-7 w-7 place-items-center rounded-full text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                isSelected
                  ? "bg-primary-strong font-semibold text-primary-foreground"
                  : inMonth
                    ? "text-ink hover:bg-surface-hover"
                    : "text-muted/60 hover:bg-surface-hover",
                !isSelected && isToday(day) && "ring-1 ring-primary",
              )}
            >
              {day.getDate()}
              {hasEvents && !isSelected ? (
                <span
                  className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
