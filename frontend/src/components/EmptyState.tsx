import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A calm placeholder for screens with nothing to show yet. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-foreground shadow-xs">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {action}
    </section>
  );
}
