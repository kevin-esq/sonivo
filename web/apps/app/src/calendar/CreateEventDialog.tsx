import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createEvent, problemDetail, type GroupSummary } from "../api/client";
import { useT } from "../i18n";
import { fromDatetimeLocalValue } from "../scheduling/datetime";
import { Button } from "../ui/button";
import { fieldClass } from "../ui/field";

type EventType = "rehearsal" | "performance" | "other";

function defaultStartsAt(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T19:00`;
}

/** Create-event dialog opened from the calendar (ADR-0053 addendum). */
export function CreateEventDialog({
  groups,
  initialDate,
  onClose,
  onCreated,
}: {
  groups: GroupSummary[];
  initialDate: Date;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("rehearsal");
  const [startsAt, setStartsAt] = useState(() => defaultStartsAt(initialDate));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!groupId) {
      setError(t("calendar.groupRequired"));
      return;
    }
    if (!title.trim()) {
      setError(t("calendar.titleRequired"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createEvent(groupId, {
        title: title.trim(),
        type,
        startsAt: fromDatetimeLocalValue(startsAt),
      });
      onCreated();
    } catch (err) {
      setError(problemDetail(err));
      setPending(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border-subtle bg-surface p-0 text-ink shadow-xl backdrop:bg-slate-900/40"
    >
      <form className="space-y-4 p-5" onSubmit={submit} noValidate>
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {t("calendar.createTitle")}
        </h2>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">
            {t("calendar.group")}
          </span>
          <select
            className={fieldClass}
            value={groupId}
            disabled={pending}
            onChange={(event) => setGroupId(event.target.value)}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">
            {t("calendar.titleField")}
          </span>
          <input
            className={fieldClass}
            value={title}
            maxLength={200}
            disabled={pending}
            onChange={(event) => {
              setTitle(event.target.value);
              if (error) setError(null);
            }}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">
            {t("calendar.type")}
          </span>
          <select
            className={fieldClass}
            value={type}
            disabled={pending}
            onChange={(event) => setType(event.target.value as EventType)}
          >
            <option value="rehearsal">{t("calendar.typeRehearsal")}</option>
            <option value="performance">
              {t("calendar.typePerformance")}
            </option>
            <option value="other">{t("calendar.typeOther")}</option>
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">
            {t("calendar.dateTime")}
          </span>
          <input
            type="datetime-local"
            className={fieldClass}
            value={startsAt}
            disabled={pending}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </label>

        <div role="alert">
          {error ? <p className="text-sm text-error-ink">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            {t("calendar.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={pending || !title.trim() || !groupId}
          >
            {pending ? t("calendar.creating") : t("calendar.create")}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
