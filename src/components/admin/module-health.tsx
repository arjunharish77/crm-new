import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ModuleHealthState =
    | "HEALTHY" | "SETUP_INCOMPLETE" | "CONNECTOR_FAILING" | "WORKER_BACKLOG" | "STALE_DATA"
    | "DISABLED_BY_DEPENDENCY" | "SUSPENDED" | "TRIAL_EXPIRED" | "DISABLED" | "NOT_AVAILABLE";

export type ModuleHealthIssue = { kind: string; message: string; count?: number; action?: { label: string; href: string }; detail?: string };
export type ModuleHealth = { moduleKey: string; state: ModuleHealthState; issues: ModuleHealthIssue[]; checked: boolean; checksFailed: number; checkedAt: string };

export const MODULE_HEALTH_LABEL: Record<ModuleHealthState, string> = {
    HEALTHY: "Healthy",
    SETUP_INCOMPLETE: "Setup incomplete",
    CONNECTOR_FAILING: "Connector failing",
    WORKER_BACKLOG: "Work backed up",
    STALE_DATA: "Stale data",
    DISABLED_BY_DEPENDENCY: "Disabled by dependency",
    SUSPENDED: "Suspended",
    TRIAL_EXPIRED: "Trial expired",
    DISABLED: "Disabled",
    NOT_AVAILABLE: "Not built yet",
};

const TONE: Record<ModuleHealthState, string> = {
    HEALTHY: "border-primary/20 bg-primary/10 text-primary",
    SETUP_INCOMPLETE: "border-status-warning bg-status-warning text-status-warning-foreground",
    STALE_DATA: "border-status-warning bg-status-warning text-status-warning-foreground",
    CONNECTOR_FAILING: "border-destructive/20 bg-destructive/10 text-destructive",
    WORKER_BACKLOG: "border-destructive/20 bg-destructive/10 text-destructive",
    DISABLED_BY_DEPENDENCY: "border-destructive/20 bg-destructive/10 text-destructive",
    TRIAL_EXPIRED: "border-destructive/20 bg-destructive/10 text-destructive",
    SUSPENDED: "border-destructive/20 bg-destructive/10 text-destructive",
    DISABLED: "border-border bg-muted text-muted-foreground",
    NOT_AVAILABLE: "border-border bg-muted text-muted-foreground",
};

/** Whether the health adds anything beyond the module's status badge. */
export function healthWorthShowing(health: ModuleHealth | undefined) {
    if (!health) return false;
    if (health.state === "DISABLED" || health.state === "SUSPENDED") return health.issues.length > 0;
    return health.checked || health.state !== "HEALTHY" || health.checksFailed > 0;
}

export function ModuleHealthBadge({ health }: { health: ModuleHealth }) {
    return (
        <Badge variant="outline" className={cn("max-w-full whitespace-normal break-words rounded-md text-xs font-semibold", TONE[health.state])}>
            {MODULE_HEALTH_LABEL[health.state]}
        </Badge>
    );
}

/** The problems behind a badge; `links` shows each problem's fix-it link (tenant pages only). */
export function ModuleHealthIssues({ health, links, showDetail }: { health: ModuleHealth; links: boolean; showDetail?: boolean }) {
    if (!health.issues.length && !health.checksFailed) return null;
    return (
        <ul className="mt-1 min-w-0 space-y-1 text-xs [overflow-wrap:anywhere]">
            {health.issues.map((issue, index) => (
                <li key={`${issue.kind}-${index}`} className="min-w-0">
                    <span>{issue.message}</span>
                    {showDetail && issue.detail && <span className="text-muted-foreground"> ({issue.detail})</span>}
                    {links && issue.action && <> <Link href={issue.action.href} className="font-medium text-primary underline-offset-2 hover:underline">{issue.action.label}</Link></>}
                </li>
            ))}
            {health.checksFailed > 0 && <li className="text-muted-foreground">{health.checksFailed} health check{health.checksFailed === 1 ? "" : "s"} could not run.</li>}
        </ul>
    );
}
