import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** One group of settings: a title, a line of context, the fields, and actions. */
export function SettingsCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">{children}</CardContent>
      {footer && (
        <CardFooter className="justify-end gap-3 border-t pt-6">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}
