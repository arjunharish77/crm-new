"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { apiFetch } from "@/lib/api";
import { saveDisplaySettings } from "@/lib/date-format";

export function GeneralSettingsProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const handleChange = () => setVersion((version) => version + 1);
        window.addEventListener("unnatify:display-settings", handleChange as EventListener);
        return () => window.removeEventListener("unnatify:display-settings", handleChange as EventListener);
    }, []);

    useEffect(() => {
        let mounted = true;
        if (isLoading || !isAuthenticated) return;

        apiFetch("/settings/general")
            .then((settings) => {
                if (!mounted || !settings) return;
                saveDisplaySettings({
                    timezone: settings.timezone,
                    dateFormat: settings.dateFormat,
                    language: settings.language,
                });
            })
            .catch(() => undefined);

        return () => {
            mounted = false;
        };
    }, [isAuthenticated, isLoading]);

    return <div key={`${isAuthenticated}-${version}`}>{children}</div>;
}
