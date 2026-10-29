import {
  BellRing,
  CalendarDays,
  Package,
  Settings,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

import type { Messages } from "@/i18n";

export interface NavItem {
  to: string;
  label: (t: Messages) => string;
  icon: LucideIcon;
}

/** The five sections, in the same order on the sidebar and the tab bar. */
export const NAV_ITEMS: NavItem[] = [
  { to: "/shop", label: (t) => t.nav.shop, icon: ShoppingBag },
  { to: "/watches", label: (t) => t.nav.watches, icon: BellRing },
  { to: "/orders", label: (t) => t.nav.orders, icon: Package },
  { to: "/planner", label: (t) => t.nav.planner, icon: CalendarDays },
  { to: "/settings", label: (t) => t.nav.settings, icon: Settings },
];
