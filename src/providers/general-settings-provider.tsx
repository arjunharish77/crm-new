"use client";

import { useEffect } from "react";
import { useAuth } from "@/providers/auth-provider";
import { apiFetch } from "@/lib/api";
import { saveDisplaySettings } from "@/lib/date-format";
import { savePersonalizationCache } from "@/lib/personalization-cache";

export function GeneralSettingsProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    useEffect(() => {
        let mounted = true;
        if (isLoading || !isAuthenticated) return;

        // "Timezone/locale display inherited from tenant unless overridden" (gap checklist
        // Module 10's user workspace personalization item) -- the tenant's own general settings
        // stay the base, and this user's own personalization override (if set) wins per-field.
        Promise.all([
            apiFetch("/settings/general").catch(() => null),
            apiFetch("/settings/personalization").catch(() => null),
        ]).then(([tenantSettings, personalization]) => {
            if (!mounted || !tenantSettings) return;
            savePersonalizationCache(personalization);
            saveDisplaySettings({
                timezone: personalization?.timezoneOverride || tenantSettings.timezone,
                dateFormat: tenantSettings.dateFormat,
                language: tenantSettings.language,
                currency: personalization?.currencyOverride || tenantSettings.currency,
            });
        });

        return () => {
            mounted = false;
        };
    }, [isAuthenticated, isLoading]);

    // Keyed only on sign-in state, so signing out or in starts from a clean tree. A display
    // settings change no longer remounts the app (UI/UX plan B4); see hooks/use-display-settings.
    return <div key={String(isAuthenticated)}>{children}</div>;
}
