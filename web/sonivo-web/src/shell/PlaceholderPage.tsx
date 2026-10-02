import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useT } from "../i18n";

/**
 * Disabled-placeholder page for sections that exist in the reference IA but are
 * intentionally not implemented (billing, help, notifications — ADR-0053 H4).
 */
export function PlaceholderPage() {
  const { t } = useT();
  return (
    <section
      className="mx-auto max-w-lg space-y-3 rounded-2xl border border-border-subtle bg-surface p-8 text-center"
      data-testid="placeholder-page"
    >
      <span
        className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary-ink"
        aria-hidden="true"
      >
        <Sparkles className="h-6 w-6" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        {t("placeholder.title")}
      </h1>
      <p className="text-sm text-muted">{t("placeholder.body")}</p>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center rounded-xl bg-primary-strong px-4 text-sm font-semibold text-primary-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {t("placeholder.back")}
      </Link>
    </section>
  );
}
