import { Link } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "../../ui/cn";

export type AccountRowProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
};

const base =
  "flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left no-underline transition duration-150 motion-reduce:transition-none";

function RowContent({
  icon: Icon,
  title,
  subtitle,
  showChevron,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  showChevron: boolean;
}) {
  return (
    <>
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary-ink"
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {subtitle ? (
          <span className="block text-xs text-muted">{subtitle}</span>
        ) : null}
      </span>
      {showChevron ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      ) : null}
    </>
  );
}

/** One navigable or read-only row inside an `AccountCard`. */
export function AccountRow(props: AccountRowProps) {
  const { icon, title, subtitle, to, onClick, disabled } = props;

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        data-testid="account-row-disabled"
        className={cn(base, "cursor-default")}
      >
        <RowContent icon={icon} title={title} subtitle={subtitle} showChevron={false} />
      </span>
    );
  }

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          base,
          "hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        )}
      >
        <RowContent icon={icon} title={title} subtitle={subtitle} showChevron />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        "hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      )}
    >
      <RowContent icon={icon} title={title} subtitle={subtitle} showChevron />
    </button>
  );
}
