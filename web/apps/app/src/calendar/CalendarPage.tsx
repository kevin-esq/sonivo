import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import {
  listCalendarEvents,
  listMyGroups,
  listUpcomingActivity,
  problemDetail,
  type GroupSummary,
} from "../api/client";
import { useT } from "../i18n";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { CalendarChips, CalendarFilterPanel } from "./CalendarFilters";
import { CreateEventDialog } from "./CreateEventDialog";
import { DayView } from "./DayView";
import { MiniMonth } from "./MiniMonth";
import { MonthView } from "./MonthView";
import { UpcomingList } from "./UpcomingList";
import { WeekView } from "./WeekView";
import {
  addDays,
  addMonths,
  dayKey,
  longDate,
  monthLabel,
  rangeFor,
  shortDate,
  startOfWeek,
  endOfWeek,
  type CalendarEvent,
  type CalendarView,
} from "./calendarUtils";

export function CalendarPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);

  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState<Date>(today);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [upcoming, setUpcoming] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [otherOnly, setOtherOnly] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [allGroups, setAllGroups] = useState(true);

  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const { from, to } = useMemo(() => rangeFor(view, cursor), [view, cursor]);

  useEffect(() => {
    let cancelled = false;
    void listMyGroups()
      .then((result) => {
        if (!cancelled) setGroups(result);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    void listUpcomingActivity()
      .then((result) => {
        if (!cancelled) setUpcoming(result);
      })
      .catch(() => {
        if (!cancelled) setUpcoming([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listCalendarEvents(from.toISOString(), to.toISOString())
      .then((result) => {
        if (!cancelled) setEvents(result);
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
  }, [from, to, reloadKey]);

  const applyFilters = useMemo(
    () => (list: CalendarEvent[]) =>
      list.filter((event) => {
        if (onlyMine && !event.myResponse) return false;
        if (otherOnly) return event.type === "other";
        if (
          !allGroups &&
          selectedGroupIds.length > 0 &&
          !selectedGroupIds.includes(event.groupId)
        ) {
          return false;
        }
        return true;
      }),
    [onlyMine, otherOnly, allGroups, selectedGroupIds],
  );

  const filteredEvents = useMemo(
    () => applyFilters(events ?? []),
    [applyFilters, events],
  );
  const filteredUpcoming = useMemo(
    () => applyFilters(upcoming ?? []),
    [applyFilters, upcoming],
  );

  const eventDays = useMemo(
    () =>
      new Set(
        filteredEvents.map((event) => dayKey(new Date(event.startsAt))),
      ),
    [filteredEvents],
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

  function goToday() {
    setCursor(new Date());
  }

  function openEvent(event: CalendarEvent) {
    navigate(`/groups/${event.groupId}/events/${event.eventId}`);
  }

  function selectDay(date: Date) {
    setCursor(date);
    setView("day");
  }

  function toggleGroup(id: string) {
    setOtherOnly(false);
    setSelectedGroupIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function toggleOther() {
    setOtherOnly((value) => !value);
  }

  function clearFilters() {
    setSelectedGroupIds([]);
    setOtherOnly(false);
  }

  const views: Array<{ id: CalendarView; label: string }> = [
    { id: "month", label: t("calendar.month") },
    { id: "week", label: t("calendar.week") },
    { id: "day", label: t("calendar.day") },
  ];

  return (
    <section className="space-y-4" aria-labelledby="calendar-heading">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1
              id="calendar-heading"
              className="text-3xl font-bold tracking-tight text-ink"
            >
              {t("calendar.title")}
            </h1>
            <p className="text-muted">{t("calendar.subtitle")}</p>
          </div>

          {/* Desktop controls */}
          <div className="hidden items-center gap-2 lg:flex">
            <Button variant="secondary" onClick={goToday}>
              {t("calendar.today")}
            </Button>
            <div className="flex items-center gap-1 rounded-xl border border-border-subtle bg-surface px-1">
              <button
                type="button"
                onClick={() => shift(-1)}
                aria-label={t("calendar.prev")}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
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

          {/* Mobile filter entry */}
          <button
            type="button"
            onClick={() => setShowFilters(true)}
            aria-label={t("calendar.filters")}
            data-testid="calendar-filters-button"
            className="grid h-11 w-11 place-items-center rounded-xl border border-border-subtle bg-surface text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
          >
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Mobile nav row */}
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <div className="flex items-center gap-1 rounded-xl border border-border-subtle bg-surface px-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label={t("calendar.prev")}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <Button variant="secondary" onClick={goToday}>
            {t("calendar.today")}
          </Button>
        </div>

        {/* Filters + new event */}
        <div className="flex items-center gap-2">
          <CalendarChips
            groups={groups}
            selectedGroupIds={selectedGroupIds}
            otherOnly={otherOnly}
            onClear={clearFilters}
            onToggleGroup={toggleGroup}
            onToggleOther={toggleOther}
          />
          {groups.length > 0 ? (
            <Button
              className="hidden shrink-0 lg:inline-flex"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("calendar.newEvent")}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-error/20 bg-error/10 px-5 py-4"
        >
          <p className="text-sm text-error-ink">{error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              setEvents(null);
              setReloadKey((key) => key + 1);
            }}
          >
            {t("home.retry")}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          {view === "month" ? (
            <>
              <div className="hidden lg:block">
                <MonthView
                  cursor={cursor}
                  events={filteredEvents}
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
                  events={filteredUpcoming}
                  loading={upcoming === null}
                  onSelectDay={selectDay}
                  onViewAll={() => setView("week")}
                />
              </div>
            </>
          ) : view === "week" ? (
            <WeekView
              cursor={cursor}
              events={filteredEvents}
              onOpen={openEvent}
              onSelectDay={selectDay}
            />
          ) : (
            <DayView events={filteredEvents} onOpen={openEvent} />
          )}
        </div>

        {/* Desktop rail */}
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
            events={filteredUpcoming}
            loading={upcoming === null}
            onSelectDay={selectDay}
            onViewAll={() => setView("week")}
          />
        </div>
      </div>

      {groups.length > 0 ? (
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

      <CalendarFilterPanel
        open={showFilters}
        groups={groups}
        selectedGroupIds={selectedGroupIds}
        otherOnly={otherOnly}
        view={view}
        onlyMine={onlyMine}
        allGroups={allGroups}
        onClose={() => setShowFilters(false)}
        onToggleGroup={toggleGroup}
        onToggleOther={toggleOther}
        onSetView={setView}
        onSetOnlyMine={setOnlyMine}
        onSetAllGroups={setAllGroups}
      />

      {showCreate ? (
        <CreateEventDialog
          groups={groups}
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
