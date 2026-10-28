import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { direction, MESSAGES } from "../i18n";
import { getUsers, signIn, type Language, type SessionUser } from "../lib/api";
import { homeFor } from "../lib/session";

/** Nobody is signed in yet, so follow the browser's language if Aide speaks it. */
function browserLanguage(): Language {
  const code = navigator.language.slice(0, 2);
  return code in MESSAGES ? (code as Language) : "en";
}

/** Demo sign-in: pick one of the seeded people. There are no passwords. */
export function SignInPage() {
  const language = browserLanguage();
  const t = MESSAGES[language].signIn;
  const navigate = useNavigate();
  const [users, setUsers] = useState<SessionUser[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch(() => setFailed(true));
  }, []);

  async function choose(user: SessionUser) {
    setFailed(false);
    try {
      const signedIn = await signIn(user.id);
      await navigate(homeFor(signedIn.role));
    } catch {
      setFailed(true);
    }
  }

  return (
    <main
      lang={language}
      dir={direction(language)}
      className="mx-auto flex max-w-xl flex-col gap-6 p-4 sm:p-6"
    >
      <title>{t.pageTitle}</title>
      <h1 className="text-3xl font-bold">{t.heading}</h1>
      <p>{t.demoNote}</p>
      {users?.length === 0 && <p>{t.noUsers}</p>}
      {users && users.length > 0 && (
        <ul className="flex flex-col gap-3">
          {users.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => void choose(user)}
                className="flex min-h-16 w-full flex-col items-start justify-center rounded-2xl border-2 border-blue-800 px-6 py-3 text-start hover:bg-blue-50 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-800 dark:border-blue-300 dark:hover:bg-blue-950"
              >
                <span className="text-2xl font-semibold">
                  {t.signInAs(user.name)}
                </span>
                <span>{user.role === "shopper" ? t.shopper : t.caregiver}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {failed && (
        <p
          role="alert"
          className="font-semibold text-red-800 dark:text-red-300"
        >
          {t.failed}
        </p>
      )}
    </main>
  );
}
