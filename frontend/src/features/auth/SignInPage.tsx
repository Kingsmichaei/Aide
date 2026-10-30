import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { direction, MESSAGES } from "@/i18n";
import { getUsers, signIn, type Language } from "@/lib/api";

/** Nobody is signed in yet, so follow the browser's language if Aide speaks it. */
function browserLanguage(): Language {
  const code = navigator.language.slice(0, 2);
  return code in MESSAGES ? (code as Language) : "en";
}

/** Demo sign-in: pick one of the seeded accounts. There are no passwords. */
export function SignInPage() {
  const language = browserLanguage();
  const t = MESSAGES[language].signIn;
  const navigate = useNavigate();
  const users = useQuery({ queryKey: ["auth", "users"], queryFn: getUsers });
  const enter = useMutation({
    mutationFn: signIn,
    onSuccess: () => navigate("/shop"),
  });

  return (
    <main
      lang={language}
      dir={direction(language)}
      className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-12"
    >
      <title>{t.pageTitle}</title>
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <BrandMark className="scale-110" />
        </div>
        <Card className="shadow-md">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl tracking-tight">
              <h1>{t.heading}</h1>
            </CardTitle>
            <CardDescription className="text-[15px]">
              {t.tagline}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t.choose}
            </h2>
            {users.isPending && (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            )}
            {users.data?.length === 0 && <p>{t.noUsers}</p>}
            {users.data && users.data.length > 0 && (
              <ul className="space-y-2">
                {users.data.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => enter.mutate(user.id)}
                      disabled={enter.isPending}
                      aria-label={t.signInAs(user.name)}
                      className="group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-start shadow-xs transition hover:border-primary/40 hover:bg-primary-soft/60 disabled:opacity-60"
                    >
                      <UserAvatar name={user.name} className="size-10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {user.name}
                        </span>
                        {user.email && (
                          <span className="block truncate text-sm text-muted-foreground">
                            {user.email}
                          </span>
                        )}
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 rtl:rotate-180"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {users.isError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm"
              >
                <span>{t.loadFailed}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void users.refetch()}
                  disabled={users.isFetching}
                >
                  {t.retry}
                </Button>
              </div>
            )}
            {enter.isError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {t.failed}
              </p>
            )}
            <p className="text-center text-xs text-muted-foreground">
              {t.demoNote}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
