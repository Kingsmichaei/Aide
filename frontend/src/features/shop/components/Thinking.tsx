import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/useI18n";

import { AideAvatar } from "./AideAvatar";

/** While Aide searches: its avatar, a line of text and three card shapes. */
export function Thinking() {
  const { t } = useI18n();
  return (
    <div className="flex gap-3" aria-busy="true">
      <AideAvatar />
      <div className="min-w-0 flex-1 space-y-4 pt-1">
        <p className="text-sm text-muted-foreground motion-safe:animate-pulse">
          {t.shop.thinking}
        </p>
        <div className="space-y-2">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-xl border bg-card">
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="mt-3 h-5 w-1/4" />
                <Skeleton className="mt-2 h-9 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
