import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/** Aide's small mark beside its messages. */
export function AideAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs",
        className,
      )}
    >
      <Sparkles className="size-4" />
    </span>
  );
}
