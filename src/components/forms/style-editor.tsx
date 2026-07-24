"use client";

import { Palette as PaletteIcon, Type as TypeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface StyleEditorProps {
    values: {
        theme: string;
        customCss: string;
    };
    onChange: (values: { theme: string; customCss: string }) => void;
}

const THEMES = [
    { value: "default", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "modern", label: "Modern" },
    { value: "dark", label: "Dark" },
];

const FONTS = [
    { value: "Inter, sans-serif", label: "Inter" },
    { value: "Roboto, sans-serif", label: "Roboto" },
    { value: "Open Sans, sans-serif", label: "Open Sans" },
    { value: "Merriweather, serif", label: "Merriweather" },
    { value: "Courier New, monospace", label: "Monospace" },
];

const RADII = ["0px", "4px", "8px", "16px", "99px"];

export function StyleEditor({ values, onChange }: StyleEditorProps) {
    const updateCssVariable = (variable: string, value: string) => {
        let css = values.customCss || "";
        const rootRegex = /:root\s*{([^}]*)}/;
        const match = css.match(rootRegex);
        let newRootContent = "";

        if (match) {
            let rootContent = match[1];
            if (rootContent.includes(variable)) {
                const varRegex = new RegExp(`${variable}:[^;]*;`);
                rootContent = rootContent.replace(varRegex, `${variable}: ${value};`);
            } else {
                rootContent += `\n  ${variable}: ${value};`;
            }
            newRootContent = `:root {${rootContent}}`;
            css = css.replace(rootRegex, newRootContent);
        } else {
            newRootContent = `:root {\n  ${variable}: ${value};\n}`;
            css = `${newRootContent}\n${css}`;
        }
        onChange({ ...values, customCss: css });
    };

    const getCssVariable = (variable: string) => {
        const match = values.customCss?.match(new RegExp(`${variable}:\\s*([^;]*)`));
        return match ? match[1].trim() : "";
    };

    const currentRadius = getCssVariable("--radius");

    return (
        <div className="space-y-6">
            <div className="space-y-1.5">
                <Label>Theme Preset</Label>
                <Select value={values.theme} onValueChange={(v) => onChange({ ...values, theme: v })}>
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {THEMES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-3 rounded-3xl border bg-primary/[0.02] p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <PaletteIcon className="size-3.5" /> Color Palette
                </p>
                <ColorInput
                    label="Primary"
                    variable="--primary"
                    value={getCssVariable("--primary") || "#0f172a"}
                    onChange={(v) => updateCssVariable("--primary", v)}
                />
                <ColorInput
                    label="Background"
                    variable="--background"
                    value={getCssVariable("--background") || "#ffffff"}
                    onChange={(v) => updateCssVariable("--background", v)}
                />
                <ColorInput
                    label="Text"
                    variable="--foreground"
                    value={getCssVariable("--foreground") || "#020817"}
                    onChange={(v) => updateCssVariable("--foreground", v)}
                />
            </div>

            <div className="space-y-3 rounded-3xl border bg-primary/[0.02] p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <TypeIcon className="size-3.5" /> Typography
                </p>
                <div className="space-y-1.5">
                    <Label>Font Family</Label>
                    <Select value={getCssVariable("--font-sans")} onValueChange={(v) => updateCssVariable("--font-sans", v)}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Font Family" />
                        </SelectTrigger>
                        <SelectContent>
                            {FONTS.map((f) => (
                                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <p className="mb-1 text-xs font-semibold">Corner Smoothing</p>
                    <div className="grid grid-cols-5 gap-1">
                        {RADII.map((r) => (
                            <Button
                                key={r}
                                type="button"
                                size="sm"
                                variant={currentRadius === r ? "default" : "outline"}
                                onClick={() => updateCssVariable("--radius", r)}
                                className="px-1 text-xs"
                            >
                                {r === "99px" ? "Round" : r}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-1.5">
                <Label>Custom CSS</Label>
                <Textarea
                    rows={6}
                    value={values.customCss}
                    onChange={(e) => onChange({ ...values, customCss: e.target.value })}
                    placeholder=":root { --primary: blue; }"
                    className="font-mono text-xs"
                />
            </div>
        </div>
    );
}

function ColorInput({ label, variable, value, onChange }: { label: string, variable: string, value: string, onChange: (val: string) => void }) {
    const inputId = `color-${variable}`;
    return (
        <div className="flex items-center justify-between">
            <span className="text-xs">{label}</span>
            <div className="flex items-center gap-2">
                <div
                    className={cn("h-6 w-6 rounded border")}
                    style={{ backgroundColor: value }}
                />
                <input
                    type="color"
                    id={inputId}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="absolute h-0 w-0 overflow-hidden opacity-0"
                />
                <Button asChild variant="outline" size="sm" className="min-w-20 px-2 text-[11px] font-normal normal-case">
                    <label htmlFor={inputId} className="cursor-pointer">{value}</label>
                </Button>
            </div>
        </div>
    );
}
