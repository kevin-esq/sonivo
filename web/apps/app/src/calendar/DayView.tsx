import { useT } from "../i18n";
import { colorFor, timeLabel, type CalendarEvent } from "./calendarUtils";

export function DayView({
  events,
  onOpen,
}: {
  events: CalendarEvent[];
  onOpen: (event: CalendarEvent) => void;
}) {
  const { t, lang } = useT();
  const list = [...events].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center text-sm text-muted">
        {t("calendar.noEvents")}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-3">
      <ul className="space-y-2">
        {list.map((event) => {
          const color = colorFor(event.groupId);
          return (
            <li key={event.eventId}>
              <button
                type="button"
                data-testid="calendar-event"
                onClick={() => onOpen(event)}
                className="flex w-full items-stretch gap-3 rounded-xl border border-border-subtle text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <span className="w-16 shrink-0 py-3 text-center text-xs font-semibold text-ink">
                  {timeLabel(event.startsAt, lang)}
                </span>
                <span className="min-w-0 flex-1 py-3 pr-3">
                  <span className="block truncate text-sm font-semibold text-ink">
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
    </div>
  );
}
