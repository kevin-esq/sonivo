import { ArrowLeft, Check } from "lucide-react";
import type { ReactNode } from "react";
import type { GroupSummary } from "../api/client";
import { useT } from "../i18n";
import { cn } from "../ui/cn";
import { colorFor, type CalendarView } from "./calendarUtils";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        active
          ? "border-primary-strong bg-primary-strong text-primary-foreground"
          : "border-border-subtle bg-surface text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** Desktop filter chips: Todos · groups · Otras actividades. */
export function CalendarChips({
  groups,
  selectedGroupIds,
  otherOnly,
  onClear,
  onToggleGroup,
  onToggleOther,
}: {
  groups: GroupSummary[];
  selectedGroupIds: string[];
  otherOnly: boolean;
  onClear: () => void;
  onToggleGroup: (id: string) => void;
  onToggleOther: () => void;
}) {
  const { t } = useT();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
      <Chip active={!otherOnly && selectedGroupIds.length === 0} onClick={onClear}>
        {t("calendario.all")}
      </Chip>
      {groups.map((group) => (
        <Chip
          key={group.id}
          active={!otherOnly && selectedGroupIds.includes(group.id)}
          onClick={() => onToggleGroup(group.id)}
        >
          {group.name}
        </Chip>
      ))}
      <Chip active={otherOnly} onClick={onToggleOther}>
        {t("calendario.otherActivities")}
      </Chip>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="text-sm text-ink">{label}</span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary-strong" : "bg-border-subtle",
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "left-[1.375rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** Full-screen mobile "Filtros y vista" panel. */
export function CalendarFilterPanel({
  open,
  groups,
  selectedGroupIds,
  otherOnly,
  view,
  onlyMine,
  allGroups,
  onClose,
  onToggleGroup,
  onToggleOther,
  onSetView,
  onSetOnlyMine,
  onSetAllGroups,
}: {
  open: boolean;
  groups: GroupSummary[];
  selectedGroupIds: string[];
  otherOnly: boolean;
  view: CalendarView;
  onlyMine: boolean;
  allGroups: boolean;
  onClose: () => void;
  onToggleGroup: (id: string) => void;
  onToggleOther: () => void;
  onSetView: (view: CalendarView) => void;
  onSetOnlyMine: (value: boolean) => void;
  onSetAllGroups: (value: boolean) => void;
}) {
  const { t } = useT();
  if (!open) return null;

  const views: Array<{ id: CalendarView; label: string }> = [
    { id: "month", label: t("calendario.month") },
    { id: "week", label: t("calendario.week") },
    { id: "day", label: t("calendario.day") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={t("calendario.filters")}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("calendario.cancel")}
          className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2 className="text-base font-semibold">{t("calendario.filters")}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-primary-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t("calendario.apply")}
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted">
            {t("calendario.groups")}
          </h3>
          <ul className="space-y-1">
            {groups.map((group) => {
              const active = !otherOnly && selectedGroupIds.includes(group.id);
              return (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group.id)}
                    className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: colorFor(group.id) }}
                      aria-hidden="true"
                    >
                      {group.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {group.name}
                    </span>
                    <span
                      className={cn(
                        "grid h-5 w-5 place-items-center rounded-md border",
                        active
                          ? "border-primary-strong bg-primary-strong text-primary-foreground"
                          : "border-border-subtle",
                      )}
                      aria-hidden="true"
                    >
                      {active ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={onToggleOther}
                className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-500/20 text-xs font-bold text-muted"
                  aria-hidden="true"
                >
                  +
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {t("calendario.otherActivities")}
                </span>
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-md border",
                    otherOnly
                      ? "border-primary-strong bg-primary-strong text-primary-foreground"
                      : "border-border-subtle",
                  )}
                  aria-hidden="true"
                >
                  {otherOnly ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
              </button>
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted">
            {t("calendario.calendarView")}
          </h3>
          <div className="flex rounded-xl bg-surface p-1">
            {views.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={view === option.id}
                onClick={() => onSetView(option.id)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  view === option.id
                    ? "bg-primary-strong text-primary-foreground"
                    : "text-muted hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted">
            {t("calendario.show")}
          </h3>
          <div className="space-y-2">
            <Toggle
              checked={onlyMine}
              onChange={onSetOnlyMine}
              label={t("calendario.onlyMine")}
            />
            <Toggle
              checked={allGroups}
              onChange={onSetAllGroups}
              label={t("calendario.allGroupsEvents")}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
