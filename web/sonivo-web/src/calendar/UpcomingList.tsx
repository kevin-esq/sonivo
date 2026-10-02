import { CalendarDays } from "lucide-react";
import { useT } from "../i18n";
import { colorFor, shortDate, timeLabel, type CalendarEvent } from "./calendarUtils";

/** "Próximos eventos" rail list. */
export function UpcomingList({
  events,
  loading,
  onSelectDay,
  onViewAll,
}: {
  events: CalendarEvent[];
  loading: boolean;
  onSelectDay: (date: Date) => void;
  onViewAll: () => void;
}) {
  const { t, lang } = useT();
  return (
    <section
      className="rounded-2xl border border-border-subtle bg-surface p-3"
      aria-labelledby="calendar-upcoming-heading"
    >
      <h2
        id="calendar-upcoming-heading"
        className="text-sm font-semibold text-ink"
      >
        {t("calendario.upcoming")}
      </h2>

      {loading ? (
        <p aria-live="polite" className="py-3 text-sm text-muted">
          {t("calendario.loading")}
        </p>
      ) : events.length === 0 ? (
        <p className="py-3 text-sm text-muted">{t("calendario.noEvents")}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {events.slice(0, 6).map((event) => {
            const color = colorFor(event.groupId);
            const date = new Date(event.startsAt);
            return (
              <li key={`${event.groupId}-${event.eventId}`}>
                <button
                  type="button"
                  onClick={() => onSelectDay(date)}
                  className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                    style={{ backgroundColor: `${color}22`, color }}
                    aria-hidden="true"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-ink">
                      {shortDate(date, lang)} · {timeLabel(event.startsAt, lang)}
                    </span>
                    <span className="block truncate text-sm font-medium text-ink">
                      {event.title}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {event.groupName}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onViewAll}
        className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold text-primary-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {t("calendario.viewAll")}
      </button>
    </section>
  );
}
