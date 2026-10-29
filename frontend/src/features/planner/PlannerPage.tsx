import { CalendarDays } from "lucide-react";

import { PlaceholderPage } from "@/components/PlaceholderPage";
import { useI18n } from "@/i18n/useI18n";

export function PlannerPage() {
  const { t } = useI18n();
  return (
    <PlaceholderPage
      heading={t.nav.planner}
      pageTitle={`${t.nav.planner} – Aide`}
      icon={CalendarDays}
      title={t.empty.plannerTitle}
      description={t.empty.plannerBody}
    />
  );
}
