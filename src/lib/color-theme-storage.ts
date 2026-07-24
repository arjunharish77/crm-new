"use client";

import {
    COLOR_THEME_EVENT,
    COLOR_THEME_STORAGE_KEY,
    DEFAULT_COLOR_THEME,
    isColorThemeName,
    type ColorThemeName,
} from "@/lib/color-themes";

export function getColorTheme(): ColorThemeName {
    if (typeof window === "undefined") return DEFAULT_COLOR_THEME;
    const stored = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    return isColorThemeName(stored) ? stored : DEFAULT_COLOR_THEME;
}

export function saveColorTheme(theme: ColorThemeName) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
    applyColorThemeAttribute(theme);
    window.dispatchEvent(new CustomEvent(COLOR_THEME_EVENT, { detail: theme }));
}

export function applyColorThemeAttribute(theme: ColorThemeName) {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-color-theme", theme);
}
