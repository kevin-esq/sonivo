import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CircleHelp,
  CreditCard,
  Home,
  Settings,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import type { I18nKey } from "../i18n";
import { routes } from "../routing/routes";

export type SidebarItem = {
  id: string;
  labelKey: I18nKey;
  icon: LucideIcon;
  to: string;
  end?: boolean;
};

export type SidebarSection = {
  id: string;
  /** Localized section title; optional for unlabeled navigation groups. */
  labelKey?: I18nKey;
  items: SidebarItem[];
};

/** Sidebar navigation for the signed-in, non-group routes (ADR-0053). */
export const sidebarSections: SidebarSection[] = [
  {
    id: "spaces",
    labelKey: "sidebar.spaces",
    items: [
      { id: "home", labelKey: "sidebar.home", icon: Home, to: routes.home, end: true },
      {
        id: "groups",
        labelKey: "sidebar.myGroups",
        icon: Users,
        to: routes.groups,
      },
      {
        id: "join",
        labelKey: "sidebar.joinGroup",
        icon: UserPlus,
        to: routes.join,
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
        to: routes.account,
        end: true,
      },
      {
        id: "security",
        labelKey: "account.security",
        icon: ShieldCheck,
        to: routes.accountSecurity,
      },
      {
        id: "preferences",
        labelKey: "sidebar.preferences",
        icon: Settings,
        to: routes.accountPreferences,
      },
      {
        id: "notifications",
        labelKey: "sidebar.notifications",
        icon: Bell,
        to: routes.accountNotifications,
      },
      {
        id: "membership",
        labelKey: "sidebar.membership",
        icon: CreditCard,
        to: routes.accountMembership,
      },
    ],
  },
  {
    id: "support",
    labelKey: "sidebar.support",
    items: [
      { id: "help", labelKey: "sidebar.help", icon: CircleHelp, to: routes.help },
    ],
  },
];
