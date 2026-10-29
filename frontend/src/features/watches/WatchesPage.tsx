import { BellRing } from "lucide-react";

import { PlaceholderPage } from "@/components/PlaceholderPage";
import { useI18n } from "@/i18n/useI18n";

export function WatchesPage() {
  const { t } = useI18n();
  return (
    <PlaceholderPage
      heading={t.nav.watches}
      pageTitle={`${t.nav.watches} – Aide`}
      icon={BellRing}
      title={t.empty.watchesTitle}
      description={t.empty.watchesBody}
    />
  );
}
