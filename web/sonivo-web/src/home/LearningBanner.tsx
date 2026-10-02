import { Link } from "react-router-dom";
import { Music2 } from "lucide-react";
import { useT } from "../i18n";

/** Bottom learning banner (ADR-0053). */
export function LearningBanner({ exploreHref }: { exploreHref: string }) {
  const { t } = useT();
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-gradient-to-r from-primary/10 to-secondary/20 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
          aria-hidden="true"
        >
          <Music2 className="h-5 w-5" />
        </span>
        <div className="space-y-0.5">
          <p className="font-semibold text-ink">{t("home.learnTitle")}</p>
          <p className="max-w-xl text-sm text-muted">{t("home.learnBody")}</p>
        </div>
      </div>
      <Link
        to={exploreHref}
        data-testid="home-learn-cta"
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary-strong px-4 text-sm font-semibold text-primary-foreground no-underline hover:bg-primary-strong/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {t("home.learnCta")}
      </Link>
    </section>
  );
}
