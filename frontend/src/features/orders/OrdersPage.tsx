import { Package } from "lucide-react";

import { PlaceholderPage } from "@/components/PlaceholderPage";
import { useI18n } from "@/i18n/useI18n";

export function OrdersPage() {
  const { t } = useI18n();
  return (
    <PlaceholderPage
      heading={t.nav.orders}
      pageTitle={`${t.nav.orders} – Aide`}
      icon={Package}
      title={t.empty.ordersTitle}
      description={t.empty.ordersBody}
    />
  );
}
