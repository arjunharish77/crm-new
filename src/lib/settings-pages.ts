import type { LucideIcon } from "lucide-react";
import {
    Bot, Boxes, Briefcase, Building2, ClipboardCheck, Compass, Copy, FileText, Fingerprint, GitBranch, GraduationCap, Handshake,
    KeyRound, Layers, LifeBuoy, ListChecks, Megaphone, Palette, Percent, PhoneCall, PlugZap, ScrollText, ShieldAlert,
    ShieldCheck, Sparkles, Store, Headset, Gauge, TextQuote, MessagesSquare, StickyNote, BookOpen, FileLock, Table2, Tags, TimerReset, Trophy, UserCheck, UserCog, Users, UsersRound, Wallet,
} from "lucide-react";

// Every Settings page, in its group (UI/UX plan decisions 22 and 28, §11.5). The Settings menu,
// the Settings home, global search and the breadcrumb all read this list, so a page is added in
// one place. Old URLs redirect from src/lib/legacy-routes.ts.
export type SettingsGate = { module?: string; feature?: string };
export type SettingsPage = {
    title: string;
    href: string;
    group: SettingsGroupKey;
    icon: LucideIcon;
    description: string;
    keywords?: string[];
    gate?: SettingsGate;
};

export type SettingsGroupKey = "workspace" | "access" | "security" | "data" | "automation" | "calling" | "service" | "messaging" | "integrations" | "analytics" | "rewards";

export const SETTINGS_GROUPS: Array<{ key: SettingsGroupKey; title: string }> = [
    { key: "workspace", title: "Workspace" },
    { key: "access", title: "Users & access" },
    { key: "security", title: "Security & compliance" },
    { key: "data", title: "Data model" },
    { key: "automation", title: "Sales automation" },
    { key: "calling", title: "Calling" },
    { key: "service", title: "Service desk" },
    { key: "messaging", title: "Messaging & AI" },
    { key: "integrations", title: "Integrations" },
    { key: "analytics", title: "Analytics" },
    { key: "rewards", title: "Rewards & payouts" },
];

const base = "/dashboard/settings";

export const SETTINGS_PAGES: SettingsPage[] = [
    { group: "workspace", title: "Workspace profile", href: `${base}/workspace`, icon: Building2, description: "Company name, time zone, currency and language.", keywords: ["company", "organization", "localization", "timezone", "currency", "language", "general"] },
    { group: "workspace", title: "Modules", href: `${base}/workspace/modules`, icon: Boxes, description: "The modules in your plan, what each needs, and usage.", keywords: ["plan", "features", "usage", "limits"] },
    // Theme is personal (decision 8: My account), but people look for it here, so Settings has the
    // same controls on its own page, inside Settings (it used to jump to My account and lose the menu).
    { group: "workspace", title: "Appearance", href: `${base}/workspace/appearance`, icon: Palette, description: "Light or dark mode and the accent colour. Your own choice, on this browser.", keywords: ["theme", "dark", "light", "dark mode", "colour", "color", "accent", "palette"] },

    { group: "access", title: "Users", href: `${base}/access/users`, icon: Users, description: "Invite people, change their role and team, and turn off accounts.", keywords: ["invite", "people", "members", "deactivate", "manager"] },
    { group: "access", title: "Teams", href: `${base}/access/teams`, icon: UsersRound, description: "Teams for record access, queues and reporting.", keywords: ["queue", "members"] },
    { group: "access", title: "Roles & permissions", href: `${base}/access/roles`, icon: ShieldCheck, description: "Module access, record access and field permissions.", keywords: ["role", "permission templates", "field permissions", "access"] },
    { group: "access", title: "Sales groups", href: `${base}/access/sales-groups`, icon: Layers, description: "Groups of sellers for targets, rules and reports." },
    { group: "access", title: "Partners", href: `${base}/access/partners`, icon: Handshake, description: "Partner organisations and their sign-ins.", gate: { module: "PARTNERS" } },
    { group: "access", title: "User provisioning (SCIM)", href: `${base}/access/provisioning`, icon: UserCog, description: "Create and remove users from your identity provider.", keywords: ["scim", "sso", "okta", "azure"], gate: { feature: "apiAccessEnabled" } },

    { group: "security", title: "Approvals", href: `${base}/security/approvals`, icon: ShieldAlert, description: "Sensitive actions waiting for a second person to approve.", keywords: ["privileged actions", "four eyes"] },
    { group: "security", title: "Audit log", href: `${base}/security/audit-log`, icon: ScrollText, description: "Who changed what, and when.", keywords: ["audit", "history", "legal hold"] },
    { group: "security", title: "Data privacy requests", href: `${base}/security/privacy-requests`, icon: Fingerprint, description: "Export or erase a person's data on request.", keywords: ["gdpr", "dpdp", "erasure", "export"] },
    { group: "security", title: "Export rules", href: `${base}/security/export-rules`, icon: FileLock, description: "Fields that make an export wait for an admin's approval.", keywords: ["sensitive fields", "exports", "approval"] },
    { group: "security", title: "API keys", href: `${base}/security/api-keys`, icon: KeyRound, description: "Keys for the developer API.", keywords: ["token", "developer"], gate: { feature: "apiAccessEnabled" } },

    { group: "data", title: "Objects & fields", href: `${base}/data/fields`, icon: Table2, description: "Custom fields on leads, opportunities and activities, and fields per type.", keywords: ["custom fields", "fields"] },
    { group: "data", title: "Lead statuses", href: `${base}/data/lead-statuses`, icon: Tags, description: "The statuses a lead moves through, and which count as converted or lost." },
    { group: "data", title: "Opportunity types & stages", href: `${base}/data/opportunity-types`, icon: Briefcase, description: "Opportunity types, their stages and win probability.", keywords: ["pipeline", "stages"] },
    { group: "data", title: "Activity types", href: `${base}/data/activity-types`, icon: ClipboardCheck, description: "Calls, meetings and the other activities people log." },
    { group: "data", title: "Product catalog", href: `${base}/data/catalog`, icon: GraduationCap, description: "Products and programmes you sell.", gate: { module: "PRODUCT_CATALOG" } },
    { group: "data", title: "Duplicates", href: `${base}/data/duplicates`, icon: Copy, description: "Duplicate rules, and duplicates to review and merge.", keywords: ["dedupe", "merge", "duplicate rules"] },

    { group: "automation", title: "Assignment rules", href: `${base}/automation/assignment-rules`, icon: GitBranch, description: "Who new leads and opportunities go to.", keywords: ["routing", "round robin", "distribution"] },
    { group: "automation", title: "Lead scoring", href: `${base}/automation/lead-scoring`, icon: Sparkles, description: "Scoring rules and the learned model.", gate: { module: "PREDICTIVE_SCORING" } },
    { group: "automation", title: "Recommended actions", href: `${base}/automation/recommended-actions`, icon: Compass, description: "What the app suggests doing next on a record.", keywords: ["next best action", "nba"], gate: { module: "NEXT_BEST_ACTION" } },
    { group: "automation", title: "Task playbooks", href: `${base}/automation/task-playbooks`, icon: ListChecks, description: "Sets of tasks to add to a record in one go." },
    { group: "automation", title: "Service levels", href: `${base}/automation/service-levels`, icon: TimerReset, description: "How quickly tasks must be done, by priority.", keywords: ["sla", "task sla"] },

    { group: "calling", title: "Phone system", href: `${base}/integrations?section=phone-system`, icon: Headset, description: "Connect your telephony provider, numbers, recording and do-not-call list.", keywords: ["telephony", "exotel", "twilio", "recording", "do not call", "suppression"], gate: { module: "TELEPHONY" } },
    { group: "calling", title: "Call outcomes", href: `${base}/calling/outcomes`, icon: PhoneCall, description: "Outcomes and dispositions agents choose after a call.", keywords: ["dispositions"], gate: { module: "TELEPHONY" } },
    { group: "calling", title: "Call scripts", href: `${base}/calling/scripts`, icon: FileText, description: "Scripts shown to agents during a call.", gate: { module: "TELEPHONY" } },
    { group: "calling", title: "Call campaigns", href: `${base}/calling/campaigns`, icon: Megaphone, description: "Outbound calling campaigns and their lists.", gate: { module: "TELEPHONY" } },
    { group: "calling", title: "Agent capacity", href: `${base}/calling/agent-capacity`, icon: UserCheck, description: "Availability and how many calls each agent takes.", keywords: ["availability"], gate: { module: "TELEPHONY" } },

    { group: "service", title: "Service desk", href: `${base}/service/desk`, icon: LifeBuoy, description: "Case types, statuses, queues, service levels, macros and the knowledge base.", keywords: ["cases", "queues", "macros", "knowledge base", "case sla"], gate: { module: "SERVICE_DESK" } },

    { group: "messaging", title: "Email, SMS & WhatsApp", href: `${base}/integrations?section=messaging`, icon: MessagesSquare, description: "Sending providers, sender details and templates for each channel.", keywords: ["email", "sms", "whatsapp", "smtp", "templates", "channels"] },
    { group: "messaging", title: "Message snippets", href: `${base}/messaging/snippets`, icon: TextQuote, description: "Reusable text, such as a signature or footer, for message templates.", keywords: ["snippets", "signature", "footer", "templates", "email", "sms", "whatsapp"] },
    { group: "messaging", title: "Frequency limits", href: `${base}/messaging/frequency-limits`, icon: Gauge, description: "How many marketing messages one person can get, and no-marketing dates.", keywords: ["fatigue", "caps", "frequency", "quiet dates", "blackout", "exclusion"], gate: { module: "MARKETING" } },
    { group: "messaging", title: "AI assistant", href: `${base}/messaging/ai-assistant`, icon: Bot, description: "What the AI assistant can do and which model it uses.", gate: { module: "AI_COPILOT" } },

    { group: "integrations", title: "Integrations", href: `${base}/integrations`, icon: PlugZap, description: "Webhooks, lead capture, imports, external push and connection health.", keywords: ["webhooks", "import", "csv", "lead capture", "external push", "health"] },
    { group: "integrations", title: "Marketplace", href: `${base}/integrations/marketplace`, icon: Store, description: "Apps you can install, and apps you build.", keywords: ["apps"], gate: { module: "MARKETPLACE" } },

    { group: "analytics", title: "Annotations", href: `${base}/analytics/annotations`, icon: StickyNote, description: "Notes on report charts at a date, such as a campaign launch.", keywords: ["reports", "events"] },
    { group: "analytics", title: "Data catalog", href: `${base}/analytics/data-catalog`, icon: BookOpen, description: "The objects and fields reports can use.", keywords: ["reports", "fields", "schema"] },

    { group: "rewards", title: "Payout rules", href: `${base}/rewards/payout-cycles`, icon: Wallet, description: "Cycle length, tax and invoices, approvals and who sees payouts.", keywords: ["payout cycles", "gst", "invoice"], gate: { feature: "payoutsEnabled" } },
    { group: "rewards", title: "Commission rules", href: `${base}/rewards/commission-rules`, icon: Percent, description: "How commission is worked out.", gate: { feature: "payoutsEnabled" } },
    { group: "rewards", title: "Gamification", href: `${base}/rewards/gamification`, icon: Trophy, description: "Points, badges and rewards.", keywords: ["points", "badges", "leaderboard"], gate: { feature: "gamificationEnabled" } },
];

export const SETTINGS_HOME = base;

// The page for a URL, for the breadcrumb and the active item: an entry that points at a section
// (…?section=phone-system) wins when that section is open, otherwise the longest matching path.
export function settingsPageFor(pathname: string, search: string = "") {
    const params = new URLSearchParams(search);
    const withQuery = SETTINGS_PAGES.find((page) => {
        const [path, query] = page.href.split("?");
        if (!query || path !== pathname) return false;
        return [...new URLSearchParams(query)].every(([key, value]) => params.get(key) === value);
    });
    if (withQuery) return withQuery;
    return [...SETTINGS_PAGES].filter((page) => !page.href.includes("?")).sort((a, b) => b.href.length - a.href.length).find((page) => pathname === page.href || pathname.startsWith(page.href + "/")) ?? null;
}

export function settingsGroupTitle(key: SettingsGroupKey) {
    return SETTINGS_GROUPS.find((group) => group.key === key)?.title ?? "";
}

// Matches a search term against a page's title, keywords, group and description.
export function settingsPageMatches(page: SettingsPage, term: string) {
    const needle = term.trim().toLowerCase();
    if (!needle) return true;
    return [page.title, settingsGroupTitle(page.group), page.description, ...(page.keywords ?? [])].some((text) => text.toLowerCase().includes(needle));
}

