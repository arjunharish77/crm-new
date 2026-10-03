"use client";

import { useAuth } from "@/providers/auth-provider";
import { useFeature } from "@/components/auth/feature-gate";
import { SETTINGS_PAGES, type SettingsPage } from "@/lib/settings-pages";

// A page shows when its module is on (useModuleEnabled's rule), or its feature flag for the
// few non-module items (useFeature).
export function useVisibleSettingsPages() {
    const { user } = useAuth();
    const features: Record<string, boolean> = {
        payoutsEnabled: useFeature("payoutsEnabled"),
        gamificationEnabled: useFeature("gamificationEnabled"),
        apiAccessEnabled: useFeature("apiAccessEnabled"),
    };
    const entitlements = (user as any)?.moduleEntitlements ?? {};
    const isPlatformAdmin = !!user?.isPlatformAdmin;
    const visible = (page: SettingsPage) => {
        if (page.gate?.module && !isPlatformAdmin) {
            const status = entitlements[page.gate.module];
            if (status === "DISABLED" || status === "SUSPENDED") return false;
        }
        if (page.gate?.feature && !features[page.gate.feature]) return false;
        return true;
    };
    return SETTINGS_PAGES.filter(visible);
}
