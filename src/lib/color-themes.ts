export type ColorThemeName = "forest" | "ocean" | "sunset" | "grape";

export const COLOR_THEME_STORAGE_KEY = "unnatify.colorTheme";

export const COLOR_THEME_EVENT = "unnatify:color-theme";

export const DEFAULT_COLOR_THEME: ColorThemeName = "forest";

export const COLOR_THEMES: Record<
    ColorThemeName,
    {
        label: string;
        description: string;
        /** Swatch preview colors (light-mode primary/secondary/tertiary), used by the theme picker UI only. */
        swatch: [string, string, string];
    }
> = {
    forest: {
        label: "Forest",
        description: "The original green palette.",
        swatch: ["#1b6c31", "#516350", "#39656b"],
    },
    ocean: {
        label: "Ocean",
        description: "Cool blues with a violet accent.",
        swatch: ["#0967a3", "#4c6478", "#6c5c8f"],
    },
    sunset: {
        label: "Sunset",
        description: "Warm amber with an olive accent.",
        swatch: ["#7a4a00", "#77574a", "#5c6238"],
    },
    grape: {
        label: "Grape",
        description: "Rich violet with a mauve accent.",
        swatch: ["#6b4ba3", "#625a72", "#7d5262"],
    },
};

export const COLOR_THEME_NAMES = Object.keys(COLOR_THEMES) as ColorThemeName[];

export function isColorThemeName(value: string | null | undefined): value is ColorThemeName {
    return !!value && value in COLOR_THEMES;
}
