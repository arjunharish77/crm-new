"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { PageTabs } from "@/components/common/page-tabs";
import { useUrlState } from "@/hooks/use-url-state";

/**
 * A long settings page split into sections (UI/UX plan §11.6, "Settings" template): one section
 * at a time, each with its own URL (?section=<id>, or the key you pass), so it can be linked,
 * bookmarked and reached with Back. Real tabs with arrow keys on wide screens, a select on
 * narrow ones. Sections load the first time they're opened and keep their unsaved input when
 * you switch away. `onValueChange` runs for the section shown, including one opened by URL.
 * Pass `urlKey={null}` for sections inside another tab, which don't get a URL of their own.
 */
export function SettingsSections({ label, sections, onValueChange, urlKey = "section" }: {
    label: string;
    onValueChange?: (value: string) => void;
    sections: Array<{ id: string; label: string; content: ReactNode }>;
    urlKey?: string | null;
}) {
    const id = useId();
    const ids = sections.map((section) => section.id);
    const first = ids[0] ?? "";
    const [urlValue, setUrlValue] = useUrlState<string>(urlKey ?? "__no-url-section", first, { allowed: ids });
    const [localValue, setLocalValue] = useState(first);
    const active = urlKey ? urlValue : localValue;
    const select = urlKey ? setUrlValue : setLocalValue;
    const [visited, setVisited] = useState(() => new Set([first]));

    useEffect(() => {
        setVisited((current) => (current.has(active) ? current : new Set([...current, active])));
        onValueChange?.(active);
        // Only when the section shown changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    return (
        <div className="@container/settings-sections min-w-0 space-y-4">
            <div className="space-y-1 @min-[900px]/settings-sections:hidden">
                <label htmlFor={id} className="text-sm font-medium">{label}</label>
                <select id={id} value={active} onChange={(event) => select(event.target.value)} className="h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
                </select>
            </div>
            <PageTabs
                tabs={sections.map((section) => ({ value: section.id, label: section.label }))}
                value={active}
                onChange={select}
                label={label}
                className="hidden @min-[900px]/settings-sections:flex"
            />
            {sections.filter((section) => visited.has(section.id)).map((section) => (
                <section key={section.id} role="tabpanel" id={`${id}-${section.id}`} aria-labelledby={`tab-${section.id}`} hidden={active !== section.id} className="min-w-0">
                    {section.content}
                </section>
            ))}
        </div>
    );
}
