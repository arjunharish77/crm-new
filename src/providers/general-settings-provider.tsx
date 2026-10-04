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

    // No key here: AuthProvider already starts a clean tree when the signed-in person changes.
    // Keying on sign-in state remounted the whole app on every full page load (round-2 plan P1),
    // and a display settings change doesn't remount either (UI/UX plan B4).
    return <>{children}</>;
}
