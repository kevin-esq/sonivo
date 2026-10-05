import type { ReactNode } from "react";
import { cn } from "../../ui/cn";

/** A titled surface card used across the account page (ADR-0053 addendum). */
export function AccountCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border-subtle bg-surface p-4 shadow-sm",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
