"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLOR_THEMES, COLOR_THEME_NAMES, type ColorThemeName } from "@/lib/color-themes";
import { getColorTheme, saveColorTheme } from "@/lib/color-theme-storage";

export function ColorThemePicker() {
    const [selected, setSelected] = useState<ColorThemeName | null>(null);

    useEffect(() => {
        setSelected(getColorTheme());
    }, []);

    const handleSelect = (theme: ColorThemeName) => {
        setSelected(theme);
        saveColorTheme(theme);
    };

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COLOR_THEME_NAMES.map((name) => {
                const theme = COLOR_THEMES[name];
                const isActive = selected === name;
                return (
                    <button
                        key={name}
                        type="button"
                        onClick={() => handleSelect(name)}
                        aria-pressed={isActive}
                        className={cn(
                            "flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isActive ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex -space-x-1.5">
                                {theme.swatch.map((color, index) => (
                                    <span
                                        key={index}
                                        className="size-5 rounded-full border border-background"
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                            {isActive ? <Check className="size-4 text-primary" /> : null}
                        </div>
                        <div>
                            <div className="text-sm font-bold">{theme.label}</div>
                            <div className="text-xs text-muted-foreground">{theme.description}</div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
