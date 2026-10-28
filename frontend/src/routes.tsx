import { Navigate, type RouteObject } from "react-router";

import { CarePage } from "./routes/care/CarePage";
import { SettingsPage } from "./routes/shop/SettingsPage";
import { ShopLayout } from "./routes/shop/ShopLayout";
import { ShopPage } from "./routes/shop/ShopPage";

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/shop" replace /> },
  {
    path: "/shop",
    element: <ShopLayout />,
    children: [
      { index: true, element: <ShopPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  { path: "/care", element: <CarePage /> },
];
