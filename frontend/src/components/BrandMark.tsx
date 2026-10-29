import { cn } from "@/lib/utils";

/** The Aide mark: a speech bubble holding a tag, in the accent colour. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 font-semibold", className)}
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="size-7 shrink-0 text-primary"
      >
        <rect width="32" height="32" rx="9" fill="currentColor" />
        <path
          d="M10.5 12.5a2 2 0 0 1 2-2h4.6c.5 0 1 .2 1.4.6l3.4 3.4a2 2 0 0 1 0 2.8l-4.6 4.6a2 2 0 0 1-2.8 0l-3.4-3.4a2 2 0 0 1-.6-1.4z"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="14.2" cy="14.2" r="1.3" fill="var(--primary-foreground)" />
      </svg>
      <span className="text-[17px] tracking-tight">Aide</span>
    </span>
  );
}
