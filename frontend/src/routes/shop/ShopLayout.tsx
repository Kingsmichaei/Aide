import { NavLink, Outlet } from "react-router";

import { demoShopperId } from "../../lib/config";
import { SettingsProvider } from "../../lib/SettingsProvider";

const LINK =
  "flex min-h-16 items-center rounded-2xl px-5 text-xl font-semibold underline-offset-4 focus-visible:outline-4 focus-visible:outline-blue-800 aria-[current=page]:underline";

export function ShopLayout() {
  return (
    <SettingsProvider shopperId={demoShopperId()}>
      <nav
        aria-label="Shopper"
        className="mx-auto flex max-w-3xl gap-2 px-4 pt-4 sm:px-6"
      >
        <NavLink to="/shop" end className={LINK}>
          Shop
        </NavLink>
        <NavLink to="/shop/settings" className={LINK}>
          Settings
        </NavLink>
      </nav>
      <Outlet />
    </SettingsProvider>
  );
}
