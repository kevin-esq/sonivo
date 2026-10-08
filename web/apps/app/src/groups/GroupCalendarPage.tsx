import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  getGroup,
  listEvents,
  problemDetail,
  type EventListItem,
  type GroupDetail,
} from "../api/client";
import { useT } from "../i18n";
import { cn } from "../ui/cn";
import { canManageContentRole } from "../repertoire/ui";
import { DayView } from "../calendar/DayView";
import { MiniMonth } from "../calendar/MiniMonth";
import { MonthView } from "../calendar/MonthView";
import { UpcomingList } from "../calendar/UpcomingList";
import { WeekView } from "../calendar/WeekView";
import {
  addDays,
  addMonths,
  dayKey,
  endOfWeek,
  longDate,
  monthLabel,
  rangeFor,
  shortDate,
  startOfWeek,
  type CalendarEvent,
  type CalendarView,
} from "../calendar/calendarUtils";
import {
  GroupButton,
  GroupErrorState,
  GroupLink,
  GroupListSkeleton,
  GroupPageHeader,
  GroupPageSkeleton,
} from "./ui";
import { CreateEventDialog } from "./dialogs";

/** Group-scoped event into the shared calendar shape (ADR-0055 W-C). */
function toCalendarEvent(
  event: EventListItem,
  group: GroupDetail,
): CalendarEvent {
  return {
    groupId: group.id,
    groupName: group.name,
    eventId: event.id,
    title: event.title,
    type: event.type,
    startsAt: event.startsAt,
  };
}

/**
 * W-C — group calendar (`/groups/:id/calendario`). Reuses the calendar views
 * but only ever loads the current group's events, so no cross-group leak is
 * possible. Non-members get a 404 from the API.
 */
export function GroupCalendarPage() {
  const { groupId } = useParams();
  const { t, lang } = useT();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);

  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mobile-first default (owner 2026-10-05): the 7-column month grid cannot
  // reach 44px targets at 320px, so phones open on the agenda list instead.
  const [view, setView] = useState<CalendarView>(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 639px)").matches
      ? "agenda"
      : "month",
  );
  const [cursor, setCursor] = useState<Date>(today);
  const [showCreate, setShowCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    getGroup(groupId)
      .then((result) => {
        if (!cancelled) setGroup(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setGroup(null);
          setError(problemDetail(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !group) return;
    let cancelled = false;
    setEvents(null);
    listEvents(groupId)
      .then((list) => {
        if (!cancelled) setEvents(list.map((event) => toCalendarEvent(event, group)));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(problemDetail(err));
          setEvents([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, group, reloadKey]);

  const { from, to } = useMemo(() => rangeFor(view, cursor), [view, cursor]);

  const inRange = useMemo(
    () =>
      (events ?? []).filter((event) => {
        const at = new Date(event.startsAt).getTime();
        return !Number.isNaN(at) && at >= from.getTime() && at < to.getTime();
      }),
    [events, from, to],
  );

  const upcoming = useMemo(
    () =>
      (events ?? [])
        .filter((event) => new Date(event.startsAt).getTime() >= Date.now())
        .sort(
          (a, b) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
        ),
    [events],
  );

  const eventDays = useMemo(
    () =>
      new Set(inRange.map((event) => dayKey(new Date(event.startsAt)))),
    [inRange],
  );

  const navLabel = useMemo(() => {
    if (view === "month") return monthLabel(cursor, lang);
    if (view === "week") {
      return `${shortDate(startOfWeek(cursor), lang)} – ${shortDate(endOfWeek(cursor), lang)}`;
    }
    return longDate(cursor, lang);
  }, [view, cursor, lang]);

  function shift(delta: number) {
    setCursor((current) => {
      if (view === "month") return addMonths(current, delta);
      if (view === "week") return addDays(current, delta * 7);
      return addDays(current, delta);
    });
  }

  function openEvent(event: CalendarEvent) {
    navigate(`/groups/${event.groupId}/events/${event.eventId}`);
  }

  function selectDay(date: Date) {
    setCursor(date);
    setView("day");
  }

  if (group === undefined) {
    return <GroupPageSkeleton label={t("calendar.loading")} />;
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={error} />
        <GroupLink variant="soft" to="/grupos">
          {t("workspace.myGroups")}
        </GroupLink>
      </div>
    );
  }

  const canCreate = canManageContentRole(group.role);
  const views: Array<{ id: CalendarView; label: string }> = [
    { id: "month", label: t("calendar.month") },
    { id: "week", label: t("calendar.week") },
    { id: "day", label: t("calendar.day") },
    { id: "agenda", label: t("calendar.agenda") },
  ];

  return (
    <section className="space-y-4" aria-labelledby="group-calendar-heading">
      <GroupPageHeader
        headingId="group-calendar-heading"
        icon={CalendarDays}
        title={t("calendar.title")}
        subtitle={t("calendar.groupSubtitle")}
        actions={
          canCreate ? (
            <GroupButton
              className="hidden lg:inline-flex"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("calendar.newEvent")}
            </GroupButton>
          ) : null
        }
      >
        <div className="hidden items-center gap-2 lg:flex">
          <GroupButton variant="secondary" onClick={() => setCursor(new Date())}>
            {t("calendar.today")}
          </GroupButton>
          <div className="flex items-center gap-1 rounded-xl border border-border-subtle bg-surface px-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label={t("calendar.prev")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <p
              className="min-w-[9rem] text-center text-sm font-semibold text-ink first-letter:uppercase"
              aria-live="polite"
            >
              {navLabel}
            </p>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label={t("calendar.next")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex rounded-xl border border-border-subtle bg-surface p-0.5">
            {views.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={view === option.id}
                onClick={() => setView(option.id)}
                className={cn(
                  "min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  view === option.id
                    ? "bg-primary-strong text-primary-foreground"
                    : "text-muted hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 lg:hidden">
          <div className="flex items-center gap-1 rounded-xl border border-border-subtle bg-surface px-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label={t("calendar.prev")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <p
              className="min-w-[8rem] text-center text-sm font-semibold text-ink first-letter:uppercase"
              aria-live="polite"
            >
              {navLabel}
            </p>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label={t("calendar.next")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <GroupButton variant="secondary" onClick={() => setCursor(new Date())}>
            {t("calendar.today")}
          </GroupButton>
        </div>
      </GroupPageHeader>

      <GroupErrorState message={error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          {events === null ? (
            <GroupListSkeleton rows={4} label={t("calendar.loading")} />
          ) : view === "month" ? (
            <>
              <div className="hidden lg:block">
                <MonthView
                  cursor={cursor}
                  events={inRange}
                  onOpen={openEvent}
                  onSelectDay={selectDay}
                />
              </div>
              <div className="space-y-4 lg:hidden">
                <MiniMonth
                  cursor={cursor}
                  selected={cursor}
                  eventDays={eventDays}
                  onSelect={selectDay}
                  onPrev={() => setCursor((current) => addMonths(current, -1))}
                  onNext={() => setCursor((current) => addMonths(current, 1))}
                />
                <UpcomingList
                  events={upcoming}
                  loading={false}
                  onSelectDay={selectDay}
                  onViewAll={() => setView("week")}
                  viewAllKey="calendar.viewFull"
                  showGroup={false}
                />
              </div>
            </>
          ) : view === "week" ? (
            <WeekView
              cursor={cursor}
              events={inRange}
              onOpen={openEvent}
              onSelectDay={selectDay}
            />
          ) : view === "agenda" ? (
            <DayView events={upcoming.length > 0 ? upcoming : inRange} onOpen={openEvent} />
          ) : (
            <DayView events={inRange} onOpen={openEvent} />
          )}
        </div>

        <div className="hidden space-y-4 lg:block">
          <MiniMonth
            cursor={cursor}
            selected={cursor}
            eventDays={eventDays}
            onSelect={selectDay}
            onPrev={() => setCursor((current) => addMonths(current, -1))}
            onNext={() => setCursor((current) => addMonths(current, 1))}
          />
          <UpcomingList
            events={upcoming}
            loading={events === null}
            onSelectDay={selectDay}
            onViewAll={() => setView("week")}
            viewAllKey="calendar.viewFull"
            showGroup={false}
          />
        </div>
      </div>

      {canCreate ? (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          aria-label={t("calendar.newEvent")}
          data-testid="calendar-fab"
          className="fixed bottom-20 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-primary-strong text-primary-foreground shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
      ) : null}

      {showCreate ? (
        <CreateEventDialog
          groupId={group.id}
          initialDate={cursor}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}
    </section>
  );
}
