import { Navigate, type RouteObject } from "react-router";

import { CarePage } from "./routes/care/CarePage";
import { ShopPage } from "./routes/shop/ShopPage";

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/shop" replace /> },
  { path: "/shop", element: <ShopPage /> },
  { path: "/care", element: <CarePage /> },
];
