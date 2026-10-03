// Role module permissions, enforced on the server (decided 2026-10-03; they used to only hide a
// few menu items). One rule, shared by the API (lib/server/auth.ts) and the UI:
//
//   none  -- the module's API answers 403 and its screens are hidden
//   read  -- reads only
//   write -- create and edit
//   full  -- everything, including delete
//
// A module a role doesn't mention is allowed (that's how roles worked before enforcement, and
// several seeded roles set only some modules). Tenant and platform admins are never limited.
// Permission templates override the role module by module, in the same order as field
// permissions: sales-group templates, then the role's template, then the user's own.

export type ModuleLevel = "none" | "read" | "write" | "full";
export type ModuleNeed = "read" | "write" | "full";

export type PermissionModule = { key: string; label: string; description: string; apiPrefixes: string[]; apiExceptions?: string[] };

export const PERMISSION_MODULES: PermissionModule[] = [
    { key: "leads", label: "Leads", description: "Leads and lead lists", apiPrefixes: ["/api/leads", "/api/lead-lists"] },
    { key: "opportunities", label: "Opportunities", description: "Opportunities", apiPrefixes: ["/api/opportunities"] },
    { key: "activities", label: "Activities", description: "Calls, meetings and other logged activities", apiPrefixes: ["/api/activities"] },
    { key: "tasks", label: "Tasks", description: "Tasks and team queues", apiPrefixes: ["/api/tasks", "/api/task-queues"] },
    { key: "views", label: "Smart Views", description: "Saved and smart views", apiPrefixes: ["/api/saved-views"] },
    { key: "reports", label: "Reports", description: "Reports and metrics", apiPrefixes: ["/api/reports", "/api/metrics", "/api/calculated-metrics"] },
    { key: "dashboard", label: "Dashboards", description: "Dashboards and their widgets (My day is always available)", apiPrefixes: ["/api/dashboard-layouts", "/api/dashboard-tabs", "/api/dashboard-widgets"] },
    { key: "forms", label: "Forms", description: "Lead capture forms (filling in forms on a record is always allowed)", apiPrefixes: ["/api/forms"], apiExceptions: ["/api/forms/available"] },
    { key: "automations", label: "Automations", description: "Automation workflows", apiPrefixes: ["/api/automation-v2"] },
    { key: "payouts", label: "Payouts", description: "Payouts, cycles, disputes and partner invoices", apiPrefixes: ["/api/payouts", "/api/payout-cycles", "/api/payout-disputes", "/api/payout-settings", "/api/partner-invoices"] },
    { key: "partners", label: "Partners", description: "Partner management (partners' own portal is unaffected)", apiPrefixes: ["/api/partners"], apiExceptions: ["/api/partners/me"] },
    { key: "admin", label: "Admin & Settings", description: "Full makes the role a workspace admin", apiPrefixes: [] },
    { key: "integrations", label: "Integrations", description: "Full allows managing the phone system", apiPrefixes: [] },
];

const RANK: Record<ModuleLevel, number> = { none: 0, read: 1, write: 2, full: 3 };

function isLevel(value: unknown): value is ModuleLevel {
    return value === "none" || value === "read" || value === "write" || value === "full";
}

type UserLike = {
    isTenantAdmin?: boolean | null;
    isPlatformAdmin?: boolean | null;
    role?: { permissions?: any } | string | null;
    permissionTemplates?: Array<{ permissions?: any }> | null;
};

// The role's module levels with templates applied. Only modules that are set appear.
export function effectiveModuleLevels(user: UserLike | null | undefined): Record<string, ModuleLevel> {
    const levels: Record<string, ModuleLevel> = {};
    const role = user?.role && typeof user.role === "object" ? user.role : null;
    const sources = [role?.permissions?.modules, ...(Array.isArray(user?.permissionTemplates) ? user!.permissionTemplates!.map((template) => template?.permissions?.modules) : [])];
    for (const modules of sources) {
        if (!modules || typeof modules !== "object") continue;
        for (const [key, value] of Object.entries(modules as Record<string, unknown>)) {
            if (isLevel(value)) levels[key] = value;
            else if (value === false) levels[key] = "none";
        }
    }
    return levels;
}

export function canUseModule(user: UserLike | null | undefined, key: string, need: ModuleNeed = "read", levels = effectiveModuleLevels(user)) {
    if (!user) return false;
    if (user.isTenantAdmin || user.isPlatformAdmin) return true;
    const level = levels[key];
    if (!level) return true;
    return RANK[level] >= RANK[need];
}

function matchesPrefix(pathname: string, prefix: string) {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function permissionModuleForPath(pathname: string): PermissionModule | null {
    for (const entry of PERMISSION_MODULES) {
        if (!entry.apiPrefixes.some((prefix) => matchesPrefix(pathname, prefix))) continue;
        if (entry.apiExceptions?.some((prefix) => matchesPrefix(pathname, prefix))) return null;
        return entry;
    }
    return null;
}

// POST endpoints that only read (run a query, preview, record that something was opened,
// make a download link).
const READ_ONLY_POSTS = [/^\/api\/reports\/query$/, /\/open$/, /^\/api\/saved-views\/preview-share$/, /^\/api\/partner-invoices\/[^/]+\/signed-url$/];

export function moduleNeedForRequest(method: string, pathname: string): ModuleNeed {
    const verb = method.toUpperCase();
    if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return "read";
    if (verb === "POST" && READ_ONLY_POSTS.some((pattern) => pattern.test(pathname))) return "read";
    if (verb === "DELETE") return "full";
    return "write";
}

// The module and level a request needs, or null when no module permission applies.
export function moduleRequirementForRequest(method: string, pathname: string): { module: PermissionModule; need: ModuleNeed } | null {
    const entry = permissionModuleForPath(pathname);
    return entry ? { module: entry, need: moduleNeedForRequest(method, pathname) } : null;
}

// Screens per module, so a page the role can't use says so instead of looking empty.
const MODULE_PAGES: Array<[string, string]> = [
    ["/dashboard/leads", "leads"],
    ["/dashboard/lists", "leads"],
    ["/dashboard/opportunities", "opportunities"],
    ["/dashboard/activities", "activities"],
    ["/dashboard/tasks", "tasks"],
    ["/dashboard/views", "views"],
    ["/dashboard/reports", "reports"],
    ["/dashboard/forms", "forms"],
    ["/dashboard/automations-v2", "automations"],
];

export function permissionModuleForPage(pathname: string): PermissionModule | null {
    const match = MODULE_PAGES.find(([prefix]) => matchesPrefix(pathname, prefix));
    return match ? PERMISSION_MODULES.find((entry) => entry.key === match[1]) ?? null : null;
}
