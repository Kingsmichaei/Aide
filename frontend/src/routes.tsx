import { Navigate, type RouteObject } from "react-router";

import { requireRole } from "./lib/session";
import { SettingsPage } from "./routes/shop/SettingsPage";
import { ShopLayout } from "./routes/shop/ShopLayout";
import { ShopPage } from "./routes/shop/ShopPage";
import { SignInPage } from "./routes/SignInPage";

// Shown while a loader checks who is signed in: blank, so nothing flashes.
const checking = <div aria-busy="true" className="min-h-screen" />;

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/shop" replace /> },
  { path: "/signin", element: <SignInPage /> },
  {
    path: "/shop",
    loader: () => requireRole("shopper"),
    hydrateFallbackElement: checking,
    element: <ShopLayout />,
    children: [
      { index: true, element: <ShopPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  {
    path: "/care",
    loader: () => requireRole("caregiver"),
    hydrateFallbackElement: checking,
    // Loaded on demand: AG Grid and AG Charts stay out of the shopper's download.
    lazy: async () => ({
      Component: (await import("./routes/care/CarePage")).CarePage,
    }),
  },
];
