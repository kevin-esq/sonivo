import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CircleHelp,
  CreditCard,
  Home,
  Settings,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import type { I18nKey } from "../i18n";

export type SidebarItem = {
  id: string;
  labelKey: I18nKey;
  icon: LucideIcon;
  /** Present only when the item navigates; disabled items have no `to`. */
  to?: string;
  end?: boolean;
  disabled?: boolean;
};

export type SidebarSection = {
  id: string;
  /** Visible section label; the first (principal) group has none. */
  labelKey?: I18nKey;
  items: SidebarItem[];
};

/**
 * Sidebar navigation for the signed-in, non-group routes (ADR-0053).
 * `disabled` items are deliberate placeholders (billing / help / notifications)
 * per the ADR firewall: no billing, no notification center.
 */
export const sidebarSections: SidebarSection[] = [
  {
    id: "principal",
    items: [
      { id: "home", labelKey: "sidebar.home", icon: Home, to: "/", end: true },
      {
        id: "groups",
        labelKey: "sidebar.myGroups",
        icon: Users,
        to: "/grupos",
      },
      {
        id: "join",
        labelKey: "sidebar.joinGroup",
        icon: UserPlus,
        to: "/unirse",
      },
    ],
  },
  {
    id: "account",
    labelKey: "sidebar.account",
    items: [
      {
        id: "profile",
        labelKey: "sidebar.profile",
        icon: UserRound,
        to: "/cuenta",
        end: true,
      },
      {
        id: "notifications",
        labelKey: "sidebar.notifications",
        icon: Bell,
        disabled: true,
      },
      {
        id: "preferences",
        labelKey: "sidebar.preferences",
        icon: Settings,
        to: "/cuenta/preferencias",
      },
    ],
  },
  {
    id: "secondary",
    items: [
      {
        id: "plan",
        labelKey: "sidebar.plan",
        icon: CreditCard,
        disabled: true,
      },
      { id: "help", labelKey: "sidebar.help", icon: CircleHelp, disabled: true },
    ],
  },
];
