"use client";

import {
    COLOR_THEME_EVENT,
    COLOR_THEME_STORAGE_KEY,
    DEFAULT_COLOR_THEME,
    isColorThemeName,
    type ColorThemeName,
} from "@/lib/color-themes";
import { storageGet, storageSet } from "@/lib/storage";

export function getColorTheme(): ColorThemeName {
    if (typeof window === "undefined") return DEFAULT_COLOR_THEME;
    const stored = storageGet(COLOR_THEME_STORAGE_KEY);
    return isColorThemeName(stored) ? stored : DEFAULT_COLOR_THEME;
}

export function saveColorTheme(theme: ColorThemeName) {
    if (typeof window === "undefined") return;
    storageSet(COLOR_THEME_STORAGE_KEY, theme);
    applyColorThemeAttribute(theme);
    window.dispatchEvent(new CustomEvent(COLOR_THEME_EVENT, { detail: theme }));
}

export function applyColorThemeAttribute(theme: ColorThemeName) {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-color-theme", theme);
}
