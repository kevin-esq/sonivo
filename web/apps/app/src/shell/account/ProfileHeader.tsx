import type { CurrentUser } from "../../api/client";
import { useT } from "../../i18n";
import { Button } from "../../ui/button";

function initialsOf(user: CurrentUser): string {
  const source = user.displayName?.trim() || user.email?.trim() || "?";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/** Account header: avatar, name, email, role badge and "Edit profile". */
export function ProfileHeader({
  user,
  roleLabel,
  onEdit,
}: {
  user: CurrentUser;
  roleLabel: string;
  onEdit: () => void;
}) {
  const { t } = useT();
  const name = user.displayName?.trim() || user.email || "";
  return (
    <section className="relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-border-subtle bg-gradient-to-br from-primary/10 via-surface to-surface p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
      <span
        className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-primary-strong text-2xl font-bold text-primary-foreground shadow-md ring-4 ring-surface"
        aria-hidden="true"
      >
        {initialsOf(user)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold text-ink">{name}</p>
        {user.email ? (
          <p className="truncate text-sm text-muted">{user.email}</p>
        ) : null}
        <span className="mt-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-ink">
          {roleLabel}
        </span>
      </div>
      <Button variant="secondary" onClick={onEdit} data-testid="profile-edit">
        {t("profile.edit")}
      </Button>
    </section>
  );
}
