import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/useI18n";
import { useSettings } from "@/lib/settings-context";

import { AppearanceSection } from "./components/AppearanceSection";
import { ProfileSection } from "./components/ProfileSection";
import { RulesSection } from "./components/RulesSection";

export function SettingsPage() {
  const { t } = useI18n();
  const { settings } = useSettings();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
      <title>{t.settings.pageTitle}</title>
      <PageHeader
        title={t.settings.heading}
        description={t.settings.description}
      />
      <Tabs defaultValue="profile" className="mt-8 gap-6">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="profile">{t.settings.tabs.profile}</TabsTrigger>
          <TabsTrigger value="rules">{t.settings.tabs.rules}</TabsTrigger>
          <TabsTrigger value="appearance">
            {t.settings.tabs.appearance}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          {/* The form starts from the loaded profile, so wait for it. */}
          {settings.id ? (
            <ProfileSection key={settings.id} />
          ) : (
            <Skeleton aria-busy="true" className="h-80 w-full rounded-xl" />
          )}
        </TabsContent>
        <TabsContent value="rules">
          <RulesSection />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceSection />
        </TabsContent>
      </Tabs>
    </main>
  );
}
