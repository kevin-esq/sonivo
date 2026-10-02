import { Link } from "react-router-dom";
import type { UpcomingActivity } from "../api/client";import { useT } from "../i18n";
import { formatEventType } from "../scheduling/datetime";

function dayLabel(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
  }).format(date);
}

function timeLabel(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "Tu próxima actividad": next events across the caller's groups (ADR-0053 H5). */
export function ActivityRail({ items }: { items: UpcomingActivity[] | null }) {
  const { t, lang } = useT();
  return (
    <section
      aria-labelledby="home-activity-heading"
      className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-activity-heading" className="font-semibold text-ink">
          {t("home.activity")}
        </h2>
        <Link
          to="/grupos"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t("home.viewCalendar")} →
        </Link>
      </div>

      {items === null ? (
        <div
          className="space-y-2"
          role="status"
          aria-live="polite"
          aria-label={t("home.loading")}
        >
          {[0, 1, 2].map((slot) => (
            <div
              key={slot}
              className="h-14 animate-pulse rounded-xl bg-surface-hover motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl bg-surface-hover px-3 py-4 text-sm text-muted">
          {t("home.noActivity")}
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={`${item.groupId}-${item.eventId}`}>
              <Link
                to={`/groups/${item.groupId}/events/${item.eventId}`}
                data-testid="home-activity-item"
                className="flex items-center gap-3 rounded-xl px-2 py-2 no-underline text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-center text-xs font-semibold leading-tight text-primary-ink"
                  aria-hidden="true"
                >
                  {dayLabel(item.startsAt, lang)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {item.title}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {item.groupName} · {timeLabel(item.startsAt, lang)}
                  </span>
                </span>
                <span className="hidden shrink-0 text-xs text-muted sm:block">
                  {formatEventType(item.type)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
