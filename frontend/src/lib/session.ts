import { createContext, useContext } from "react";
import { redirect } from "react-router";

import { ApiError, getSessionUser, type SessionUser } from "./api";

/**
 * Route loader for the signed-in app: the current user, or a redirect to the
 * sign-in picker when nobody is signed in.
 */
export async function requireUser(): Promise<SessionUser> {
  try {
    return await getSessionUser();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw redirect("/signin");
    }
    throw error;
  }
}

export const SessionContext = createContext<SessionUser | null>(null);

/** The signed-in user. Only use inside the area whose loader is requireUser. */
export function useCurrentUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useCurrentUser used outside the signed-in app");
  return user;
}
