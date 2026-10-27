'use client'

import { routes } from '../routing/routes'
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { useT } from "../i18n";
import { Button } from "../ui/button";
import { fieldClass } from "../ui/field";
import { parseInviteToken } from "./inviteToken";
import { AppLink } from '../routing/AppLink'

/** routes.join — join a group from an invitation link or code (ADR-0053). */
export function JoinGroupPage({ navigate }: { navigate: (to: string) => void }) {
  const { t } = useT();
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const token = parseInviteToken(value);
    if (!token) {
      setError(t("groups.joinInvalid"));
      return;
    }
    navigate(`${routes.joinInvitation(token)}`);
  }

  return (
    <section className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <span
          className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary-ink"
          aria-hidden="true"
        >
          <UserPlus className="h-5 w-5" />
        </span>
        <div className="space-y-0.5">
          <h1 className="sonivo-page-title text-ink">
            {t("join.title")}
          </h1>
          <p className="text-sm text-ink/80">{t("join.subtitle")}</p>
        </div>
      </div>

      <form
        className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-5"
        onSubmit={submit}
        noValidate
      >
        <div className="space-y-1.5">
          <label
            htmlFor={id}
            className="block text-sm font-medium text-ink"
          >
            {t("groups.joinLabel")}
          </label>
          <input
            id={id}
            className={fieldClass}
            value={value}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t("groups.joinDialogHint")}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <div role="alert">
            {error ? (
              <p id={`${id}-error`} className="text-sm text-error-ink">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <AppLink
            to={routes.home}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t("placeholder.back")}
          </AppLink>
          <Button type="submit" disabled={!value.trim()}>
            {t("groups.joinSubmit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
