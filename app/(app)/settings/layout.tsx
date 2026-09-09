import { ModuleContent } from "@/components/layout/ModuleContent";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

/**
 * Every Settings page -- system settings, the template list, a single
 * template's detail screen -- shares this one tab bar, so which tab reads as
 * active is a property of the URL (see SettingsTabs) rather than something
 * each page has to reconstruct.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleContent width="standard">
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </ModuleContent>
  );
}
