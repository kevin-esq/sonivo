import { useT } from "../i18n";
import { cn } from "../ui/cn";
import { colorFor, timeLabel, type CalendarEvent } from "./calendarUtils";

/** Compact event pill used by the month and week views. */
export function EventChip({
  event,
  onClick,
  showGroup = true,
}: {
  event: CalendarEvent;
  onClick: () => void;
  showGroup?: boolean;
}) {
  const { lang } = useT();
  const color = colorFor(event.groupId);
  return (
    <button
      type="button"
      data-testid="calendar-event"
      onClick={onClick}
      title={`${event.title} · ${event.groupName}`}
      className={cn(
        "block w-full rounded-lg border-l-2 bg-surface-hover px-2 py-1 text-left transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
      )}
      style={{ borderLeftColor: color }}
    >
      <span className="block text-[11px] font-semibold" style={{ color }}>
        {timeLabel(event.startsAt, lang)}
      </span>
      <span className="block truncate text-xs font-medium text-ink">
        {event.title}
      </span>
      {showGroup ? (
        <span className="block truncate text-[11px] text-muted">
          {event.groupName}
        </span>
      ) : null}
    </button>
  );
}
