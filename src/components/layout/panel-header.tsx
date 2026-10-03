import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";

// A page section that can stand alone or sit in a tab of a combined page (UI/UX plan §11.5,
// e.g. Settings › Duplicates). Standalone it is the page header; embedded it is one quiet row
// with the help text and the section's own actions, under the combined page's header and tabs.
export function PanelHeader({ embedded, title, description, actions }: {
    embedded?: boolean;
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
}) {
    if (!embedded) return <PageHeader title={title} description={typeof description === "string" ? description : undefined} actions={actions} />;
    if (!description && !actions) return null;
    return (
        <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
            {description ? <p className="min-w-0 max-w-2xl text-sm text-muted-foreground">{description}</p> : <span />}
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}
