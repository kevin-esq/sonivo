import { useNavigate } from "react-router-dom";
import { ChevronRight, Plus, UserPlus, type LucideIcon } from "lucide-react";
import { useT, type I18nKey } from "../i18n";
import { cn } from "../ui/cn";

type QuickAction = {
  id: string;
  icon: LucideIcon;
  titleKey: I18nKey;
  hintKey: I18nKey;
  tint: string;
  onClick: () => void;
};

/** The action cards under the greeting (ADR-0053 addendum: create + join only). */
export function QuickActions() {
  const { t } = useT();
  const navigate = useNavigate();

  const actions: QuickAction[] = [
    {
      id: "create",
      icon: Plus,
      titleKey: "home.quickCreate",
      hintKey: "home.quickCreateHint",
      tint: "bg-emerald-500/15 text-emerald-600",
      onClick: () => navigate("/grupos", { state: { create: true } }),
    },
    {
      id: "join",
      icon: UserPlus,
      titleKey: "home.quickJoin",
      hintKey: "home.quickJoinHint",
      tint: "bg-primary/15 text-primary-ink",
      onClick: () => navigate("/unirse"),
    },
  ];

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <li key={action.id} className="h-full">
            <button
              type="button"
              onClick={action.onClick}
              data-testid={`home-action-${action.id}`}
              className="group flex h-full w-full flex-col items-start gap-2 rounded-2xl border border-border-subtle bg-surface p-4 text-left text-ink shadow-sm transition duration-150 hover:border-primary/40 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <span
                className={cn(
                  "grid h-11 w-11 place-items-center rounded-xl",
                  action.tint,
                )}
                aria-hidden="true"
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-semibold">{t(action.titleKey)}</span>
              <span className="text-sm text-muted">{t(action.hintKey)}</span>
              <ChevronRight
                className="mt-auto h-4 w-4 text-muted transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
