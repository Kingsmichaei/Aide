import { createContext, useContext } from "react";
import { redirect } from "react-router";

import { ApiError, getMe, type Role, type SessionUser } from "./api";

/** Where each kind of user lands after signing in. */
export function homeFor(role: Role): string {
  return role === "shopper" ? "/shop" : "/care";
}

/**
 * Route loader for a signed-in area: the current user, or a redirect to the
 * sign-in picker (signed out) or to the user's own area (wrong role).
 */
export async function requireRole(role: Role): Promise<SessionUser> {
  let user: SessionUser;
  try {
    user = await getMe();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw redirect("/signin");
    }
    throw error;
  }
  if (user.role !== role) throw redirect(homeFor(user.role));
  return user;
}

export const SessionContext = createContext<SessionUser | null>(null);

/** The signed-in user. Only use inside an area whose loader is requireRole. */
export function useCurrentUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useCurrentUser used outside a signed-in area");
  return user;
}
