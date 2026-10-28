import { NavLink, Outlet, useLoaderData, useNavigate } from "react-router";

import { useI18n } from "../../i18n/useI18n";
import { signOut, type SessionUser } from "../../lib/api";
import { SessionContext } from "../../lib/session";
import { SettingsProvider } from "../../lib/SettingsProvider";

const LINK =
  "flex min-h-16 items-center rounded-2xl px-5 text-xl font-semibold underline-offset-4 focus-visible:outline-4 focus-visible:outline-blue-800 aria-[current=page]:underline";

export function ShopLayout() {
  // From the route loader (requireRole("shopper")), so always a shopper.
  const user = useLoaderData<SessionUser>();
  return (
    <SessionContext value={user}>
      <SettingsProvider shopperId={user.id}>
        <ShopNav />
        <Outlet />
      </SettingsProvider>
    </SessionContext>
  );
}

function ShopNav() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <nav
      aria-label={t.nav.label}
      className="mx-auto flex max-w-3xl flex-wrap gap-2 px-4 pt-4 sm:px-6"
    >
      <NavLink to="/shop" end className={LINK}>
        {t.nav.shop}
      </NavLink>
      <NavLink to="/shop/settings" className={LINK}>
        {t.nav.settings}
      </NavLink>
      <button
        type="button"
        onClick={() => {
          void signOut()
            .catch(() => {})
            .then(() => navigate("/signin"));
        }}
        className={`${LINK} ms-auto font-normal underline`}
      >
        {t.nav.signOut}
      </button>
    </nav>
  );
}
