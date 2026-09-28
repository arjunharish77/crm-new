"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Visit sections lazily; retain visited forms so navigation preserves unsaved input. */
export function SettingsSections({ label, sections, onValueChange }: {
    label: string;
    onValueChange?: (value: string) => void;
    sections: Array<{ id: string; label: string; content: ReactNode }>;
}) {
    const id = useId();
    const [active, setActive] = useState(sections[0]?.id ?? "");
    const [visited, setVisited] = useState(() => new Set([sections[0]?.id]));
    const select = (next: string) => {
        setActive(next);
        onValueChange?.(next);
        setVisited(current => new Set([...current, next]));
    };
    return <div className="@container/settings-sections min-w-0 space-y-4">
        <div className="space-y-1 @min-[900px]/settings-sections:hidden">
            <label htmlFor={id} className="text-sm font-medium">{label}</label>
            <select id={id} value={active} onChange={event => select(event.target.value)} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}
            </select>
        </div>
        <div className="hidden flex-wrap gap-1 @min-[900px]/settings-sections:flex" role="group" aria-label={label}>
            {sections.map(section => <Button key={section.id} variant={active === section.id ? "secondary" : "ghost"} size="sm" aria-pressed={active === section.id} aria-controls={`${id}-${section.id}`} onClick={() => select(section.id)}>{section.label}</Button>)}
        </div>
        {sections.filter(section => visited.has(section.id)).map(section => <section key={section.id} id={`${id}-${section.id}`} aria-label={section.label} hidden={active !== section.id} className="min-w-0">
            {section.content}
        </section>)}
    </div>;
}
