"use client";

import { useEffect } from "react";
import { COLOR_THEME_EVENT, type ColorThemeName } from "@/lib/color-themes";
import { applyColorThemeAttribute, getColorTheme } from "@/lib/color-theme-storage";

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        applyColorThemeAttribute(getColorTheme());

        const handleChange = (event: Event) => {
            applyColorThemeAttribute((event as CustomEvent<ColorThemeName>).detail);
        };
        window.addEventListener(COLOR_THEME_EVENT, handleChange);
        return () => window.removeEventListener(COLOR_THEME_EVENT, handleChange);
    }, []);

    return <>{children}</>;
}
