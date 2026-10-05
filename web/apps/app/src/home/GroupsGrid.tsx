import { Link } from "react-router-dom";
import { Crown, Music2, Users } from "lucide-react";
import type { GroupSummary } from "../api/client";
import { useT } from "../i18n";
import { formatMembershipRole, isOwnerRole } from "../repertoire/ui";
import {
  GROUP_COVER_EMOJIS,
  groupCoverStyle,
  readGroupAppearance,
} from "../shell/groupAccent";
import { cn } from "../ui/cn";

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (
    words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)
  ).toUpperCase();
}

function HomeGroupCard({ group }: { group: GroupSummary }) {
  const { t } = useT();
  const appearance = readGroupAppearance(String(group.id));
  const cover = appearance.cover;
  const isEmoji = (GROUP_COVER_EMOJIS as readonly string[]).includes(cover);
  const owner = isOwnerRole(group.role);

  return (
    <li className="h-full">
      <Link
        to={`/groups/${group.id}`}
        data-testid="home-group-card"
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface text-ink no-underline shadow-sm transition duration-150 hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
      >
        <span
          className="grid h-28 place-items-center text-4xl"
          style={groupCoverStyle(cover, appearance.accent)}
          aria-hidden="true"
        >
          {isEmoji ? cover : initialsOf(group.name)}
        </span>
        <span className="flex flex-1 flex-col gap-2 p-3">
          <span className="truncate font-semibold">{group.name}</span>
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                owner
                  ? "bg-primary/10 text-primary-ink"
                  : "bg-muted/15 text-muted",
              )}
            >
              {owner ? (
                <Crown className="h-3 w-3" aria-hidden="true" />
              ) : null}
              {formatMembershipRole(group.role)}
            </span>
          </span>
          <span className="mt-auto flex items-center justify-between border-t border-border-subtle pt-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {group.memberCount === 1
                ? t("grupos.membersOne")
                : t("grupos.members", { count: group.memberCount ?? 0 })}
            </span>
            <Music2 className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </span>
      </Link>
    </li>
  );
}

export function GroupsGrid({ groups }: { groups: GroupSummary[] | null }) {
  const { t } = useT();

  if (groups === null) {
    return (
      <ul
        className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3"
        role="status"
        aria-live="polite"
        aria-label={t("home.loading")}
      >
        {[0, 1, 2, 3].map((slot) => (
          <li
            key={slot}
            className="overflow-hidden rounded-2xl border border-border-subtle bg-surface"
          >
            <div className="h-28 animate-pulse bg-surface-hover motion-reduce:animate-none" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border-subtle bg-surface/60 px-5 py-8">
        <span
          className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary-ink"
          aria-hidden="true"
        >
          <Users className="h-6 w-6" />
        </span>
        <div className="space-y-1">
          <p className="font-semibold text-ink">{t("grupos.emptyTitle")}</p>
          <p className="max-w-md text-sm text-muted">{t("grupos.empty")}</p>
        </div>
        <Link
          to="/grupos"
          state={{ create: true }}
          className="inline-flex min-h-11 items-center rounded-xl bg-primary-strong px-4 text-sm font-semibold text-primary-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t("grupos.emptyCta")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
      {groups.slice(0, 8).map((group) => (
        <HomeGroupCard key={group.id} group={group} />
      ))}
    </ul>
  );
}
