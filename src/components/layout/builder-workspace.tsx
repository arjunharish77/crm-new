"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Panels remain mounted so switching workspace views never discards an editor draft. */
export function BuilderWorkspace({ children, activePanel, onPanelChange, panels, actions, layout = "form" }: {
    children: ReactNode;
    activePanel: string;
    onPanelChange: (panel: string) => void;
    panels: Array<{ id: string; label: string }>;
    actions?: ReactNode;
    layout?: "form" | "flow";
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number>();
    useEffect(() => {
        const update = () => {
            if (!ref.current) return;
            // Keep a usable panel on short landscape windows; the page can then scroll normally.
            setHeight(Math.max(280, window.innerHeight - (ref.current.getBoundingClientRect().top + window.scrollY) - 16));
        };
        const observer = new ResizeObserver(update);
        if (ref.current?.parentElement) observer.observe(ref.current.parentElement);
        window.addEventListener("resize", update);
        const settled = window.setTimeout(update, 300);
        update();
        return () => { observer.disconnect(); window.removeEventListener("resize", update); window.clearTimeout(settled); };
    }, []);
    return <div ref={ref} data-layout={layout} className="builder-workspace" style={{ height: height ?? "65dvh" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background p-2">
            <div className="builder-panel-switch flex flex-wrap gap-1" role="group" aria-label="Editor panels">
                {panels.map(panel => <Button key={panel.id} size="sm" variant={activePanel === panel.id ? "secondary" : "ghost"} aria-pressed={activePanel === panel.id} onClick={() => onPanelChange(panel.id)}>{panel.label}</Button>)}
            </div>
            {actions}
        </div>
        <div className="builder-workspace-body" data-layout={layout}>{children}</div>
    </div>;
}
