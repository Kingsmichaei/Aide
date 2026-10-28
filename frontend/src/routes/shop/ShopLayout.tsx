import { NavLink, Outlet } from "react-router";

import { useI18n } from "../../i18n/useI18n";
import { demoShopperId } from "../../lib/config";
import { SettingsProvider } from "../../lib/SettingsProvider";

const LINK =
  "flex min-h-16 items-center rounded-2xl px-5 text-xl font-semibold underline-offset-4 focus-visible:outline-4 focus-visible:outline-blue-800 aria-[current=page]:underline";

export function ShopLayout() {
  return (
    <SettingsProvider shopperId={demoShopperId()}>
      <ShopNav />
      <Outlet />
    </SettingsProvider>
  );
}

function ShopNav() {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t.nav.label}
      className="mx-auto flex max-w-3xl gap-2 px-4 pt-4 sm:px-6"
    >
      <NavLink to="/shop" end className={LINK}>
        {t.nav.shop}
      </NavLink>
      <NavLink to="/shop/settings" className={LINK}>
        {t.nav.settings}
      </NavLink>
    </nav>
  );
}
