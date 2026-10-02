import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listMyGroups,
  listUpcomingActivity,
  problemDetail,
  type CurrentUser,
  type GroupSummary,
  type UpcomingActivity,
} from "../api/client";
import { useT } from "../i18n";
import { Button } from "../ui/button";
import { ActivityRail } from "./ActivityRail";
import { GroupsGrid } from "./GroupsGrid";
import { QuickActions } from "./QuickActions";

/** Inicio dashboard (ADR-0053): greeting, quick actions, groups and activity. */
export function HomePage({ user }: { user: CurrentUser }) {
  const { t } = useT();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [activity, setActivity] = useState<UpcomingActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listMyGroups(), listUpcomingActivity()])
      .then(([groupList, activityList]) => {
        if (cancelled) return;
        setGroups(groupList);
        setActivity(activityList);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(problemDetail(err));
        setGroups([]);
        setActivity([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, reloadKey]);

  const greetingName = useMemo(() => {
    const source = user.displayName?.trim() || user.email?.trim() || "";
    return source.split(/\s+/)[0] ?? "";
  }, [user.displayName, user.email]);

  return (
    <section className="space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">
          {t("home.greeting", { name: greetingName })}
        </h1>
        <p className="text-muted">{t("home.subtitle")}</p>
      </header>

      <QuickActions />

      {error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-error/20 bg-error/10 px-5 py-4"
        >
          <p className="text-sm text-error-ink">{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setError(null);
              setGroups(null);
              setActivity(null);
              setReloadKey((key) => key + 1);
            }}
          >
            {t("home.retry")}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="home-groups-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="home-groups-heading"
              className="text-lg font-semibold text-ink"
            >
              {t("home.yourGroups")}
            </h2>
            <Link
              to="/grupos"
              data-testid="home-view-all"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t("home.viewAll")} →
            </Link>
          </div>
          <GroupsGrid groups={groups} />
        </section>

        <ActivityRail items={activity} />
      </div>
    </section>
  );
}
