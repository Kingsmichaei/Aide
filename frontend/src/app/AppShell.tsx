import { LogOut, Settings } from "lucide-react";
import { NavLink, Outlet, useLoaderData, useNavigate } from "react-router";

import { BrandMark } from "@/components/BrandMark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { useI18n } from "@/i18n/useI18n";
import { signOut, type SessionUser } from "@/lib/api";
import { SessionContext } from "@/lib/session";
import { useSettings } from "@/lib/settings-context";
import { SettingsProvider } from "@/lib/SettingsProvider";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

import { NAV_ITEMS } from "./nav";

/** Sidebar on desktop, bottom tab bar on phones; the screen in between. */
export function AppShell() {
  // From the route loader (requireUser), so always signed in.
  const user = useLoaderData<SessionUser>();
  return (
    <SessionContext value={user}>
      <SettingsProvider>
        <Shell />
      </SettingsProvider>
    </SessionContext>
  );
}

function Shell() {
  const { settings } = useSettings();
  useTheme(settings.theme);
  return (
    <div className="min-h-svh bg-background md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <Sidebar />
      {/* Room at the bottom on phones so the tab bar never covers content. */}
      <div className="flex min-h-svh min-w-0 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </div>
      <TabBar />
      <Toaster position="top-center" />
    </div>
  );
}

function Sidebar() {
  const { t } = useI18n();
  return (
    <aside className="sticky top-0 hidden h-svh flex-col border-e bg-sidebar px-3 py-4 md:flex">
      <div className="px-2 pb-6">
        <BrandMark />
      </div>
      <nav aria-label={t.nav.label} className="flex-1">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive &&
                      "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft hover:text-primary-soft-foreground",
                  )
                }
              >
                <Icon aria-hidden="true" className="size-4" />
                {label(t)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <AccountMenu />
    </aside>
  );
}

function AccountMenu() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const name = settings.name || "…";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t.nav.account}: ${name}`}
        className="flex w-full items-center gap-3 rounded-md p-2 text-start transition-colors hover:bg-accent"
      >
        <UserAvatar name={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          {settings.email && (
            <span className="block truncate text-xs text-muted-foreground">
              {settings.email}
            </span>
          )}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate("/settings")}>
          <Settings aria-hidden="true" />
          {t.nav.settings}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void signOut()
              .catch(() => {})
              .then(() => navigate("/signin"));
          }}
        >
          <LogOut aria-hidden="true" />
          {t.nav.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TabBar() {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t.nav.label}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors",
                  isActive && "text-primary",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                      isActive && "bg-primary-soft",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-[18px]" />
                  </span>
                  {label(t)}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
