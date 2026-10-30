import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";

/** What the control needs to be labelled and described for screen readers. */
export interface ControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/**
 * A labelled control with help text and an error. `children` receives the props
 * to spread on the focusable element (the input, or a select's trigger).
 */
export function Field({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string | null;
  children: (control: ControlProps) => ReactNode;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy =
    [help && !error && helpId, error && errorId].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {help && !error && (
        <p id={helpId} className="text-[13px] text-muted-foreground">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
