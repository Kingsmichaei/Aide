import { Navigate, type RouteObject } from "react-router";

import { SignInPage } from "@/features/auth/SignInPage";
import { OrdersPage } from "@/features/orders/OrdersPage";
import { PlannerPage } from "@/features/planner/PlannerPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { ShopPage } from "@/features/shop/ShopPage";
import { WatchesPage } from "@/features/watches/WatchesPage";
import { requireUser } from "@/lib/session";

import { AppShell } from "./AppShell";

// Shown while the loader checks who is signed in: blank, so nothing flashes.
const checking = <div aria-busy="true" className="min-h-svh bg-background" />;

export const routes: RouteObject[] = [
  { path: "/signin", element: <SignInPage /> },
  {
    path: "/",
    loader: requireUser,
    hydrateFallbackElement: checking,
    element: <AppShell />,
    children: [
      // Chat is the home screen.
      { index: true, element: <Navigate to="/shop" replace /> },
      { path: "shop", element: <ShopPage /> },
      { path: "watches", element: <WatchesPage /> },
      { path: "orders", element: <OrdersPage /> },
      { path: "planner", element: <PlannerPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
];
