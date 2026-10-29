import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";

/** A section that is coming soon: its title and a friendly empty state. */
export function PlaceholderPage({
  heading,
  pageTitle,
  icon,
  title,
  description,
}: {
  heading: string;
  pageTitle: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  const { t } = useI18n();
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
      <title>{pageTitle}</title>
      <PageHeader title={heading} />
      <div className="mt-8 rounded-2xl border border-dashed bg-card">
        <EmptyState
          icon={icon}
          title={title}
          description={description}
          action={
            <Button asChild variant="outline">
              <Link to="/shop">{t.empty.startShopping}</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
