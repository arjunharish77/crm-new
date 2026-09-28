"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
    Settings,
    UsersRound,
    Users,
    Shield,
    Handshake,
    Wallet,
    Percent,
    Trophy,
    Briefcase,
    ClipboardCheck,
    Table2,
    Layers,
    Workflow,
    Sparkles,
    SlidersHorizontal,
    ClipboardList,
    TimerReset,
    Compass,
    LifeBuoy,
    PhoneCall,
    UserCheck,
    FileText,
    Megaphone,
    KeyRound,
    GitMerge,
    Package,
    UserCog,
    Laptop,
    ShieldCheck,
    ShieldAlert,
    GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeature, useModuleEnabled } from "@/components/auth/feature-gate";

const sidebarNavItems = [
    { title: "Duplicate rules", href: "/dashboard/settings/duplicate-rules", icon: ShieldCheck },
    { title: "Audit logs", href: "/dashboard/settings/governance/audit-logs", icon: FileText },
    { title: "Data Privacy", href: "/dashboard/settings/governance/gdpr", icon: ShieldCheck },
    {
        title: "General",
        href: "/dashboard/settings",
        icon: Settings,
    },
    {
        title: "Teams",
        href: "/dashboard/settings/teams",
        icon: UsersRound,
    },
    {
        title: "Users",
        href: "/dashboard/settings/users",
        icon: Users,
    },
    {
        title: "Roles & Permissions",
        href: "/dashboard/settings/roles",
        icon: Shield,
    },
    {
        title: "Partners",
        href: "/dashboard/settings/partners",
        icon: Handshake,
        module: "PARTNERS",
    },
    {
        title: "Payout Cycles",
        href: "/dashboard/settings/payout-cycles",
        icon: Wallet,
        feature: "payoutsEnabled",
    },
    {
        title: "Commission Rules",
        href: "/dashboard/settings/commission-rules",
        icon: Percent,
        feature: "payoutsEnabled",
    },
    {
        title: "Gamification",
        href: "/dashboard/settings/gamification",
        icon: Trophy,
        feature: "gamificationEnabled",
    },
    {
        title: "Opportunity Types",
        href: "/dashboard/settings/opportunity-types",
        icon: Briefcase,
    },
    {
        title: "Product Catalog",
        href: "/dashboard/settings/catalog",
        icon: GraduationCap,
    },
    {
        title: "Activity Types",
        href: "/dashboard/settings/activity-types",
        icon: ClipboardCheck,
    },
    {
        title: "Task Playbooks",
        href: "/dashboard/settings/task-playbooks",
        icon: ClipboardList,
    },
    {
        title: "Task SLA Policies",
        href: "/dashboard/settings/task-sla-policies",
        icon: TimerReset,
    },
    {
        title: "Call Dispositions",
        href: "/dashboard/settings/call-dispositions",
        icon: PhoneCall,
    },
    {
        title: "Agent Availability",
        href: "/dashboard/settings/agent-availability",
        icon: UserCheck,
    },
    {
        title: "Call Scripts",
        href: "/dashboard/settings/call-scripts",
        icon: FileText,
    },
    {
        title: "Call Campaigns",
        href: "/dashboard/settings/call-campaigns",
        icon: Megaphone,
    },
    {
        title: "Custom Fields",
        href: "/dashboard/settings/custom-fields",
        icon: Table2,
    },
    {
        title: "Sales Groups",
        href: "/dashboard/settings/sales-groups",
        icon: Layers,
    },
    {
        title: "Assignment Rules",
        href: "/dashboard/settings/assignment-rules",
        icon: Workflow,
    },
    {
        title: "Lead Scoring",
        href: "/dashboard/settings/lead-scoring",
        icon: Sparkles,
        module: "PREDICTIVE_SCORING",
    },
    {
        title: "Next-Best-Action",
        href: "/dashboard/settings/next-best-action",
        icon: Compass,
        module: "NEXT_BEST_ACTION",
    },
    {
        title: "AI Assistant",
        href: "/dashboard/settings/ai-assistant",
        icon: Sparkles,
        module: "AI_COPILOT",
    },
    {
        title: "Service Desk",
        href: "/dashboard/settings/service-desk",
        icon: LifeBuoy,
        module: "SERVICE_DESK",
    },
    {
        title: "Security",
        href: "/dashboard/settings/security",
        icon: Shield,
    },
    {
        title: "Active Sessions",
        href: "/dashboard/settings/sessions",
        icon: Laptop,
    },
    {
        title: "Two-Factor Authentication",
        href: "/dashboard/settings/mfa",
        icon: ShieldCheck,
    },
    {
        title: "Password",
        href: "/dashboard/settings/password",
        icon: KeyRound,
    },
    {
        title: "Permission Templates",
        href: "/dashboard/settings/permission-templates",
        icon: Shield,
    },
    {
        title: "Privileged Actions",
        href: "/dashboard/settings/privileged-actions",
        icon: ShieldAlert,
    },
    {
        title: "Integrations",
        href: "/dashboard/settings/integrations",
        icon: SlidersHorizontal,
    },
    {
        title: "API Keys",
        href: "/dashboard/settings/api-keys",
        icon: KeyRound,
        feature: "apiAccessEnabled",
    },
    {
        title: "SCIM Provisioning",
        href: "/dashboard/settings/scim",
        icon: UserCog,
        feature: "apiAccessEnabled",
    },
    {
        title: "Dedupe & Merge",
        href: "/dashboard/settings/dedupe",
        icon: GitMerge,
    },
    {
        title: "Marketplace",
        href: "/dashboard/settings/marketplace",
        icon: Package,
        module: "MARKETPLACE",
    },
];

export function SettingsSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [search, setSearch] = useState("");
    const payoutsEnabled = useFeature("payoutsEnabled");
    const gamificationEnabled = useFeature("gamificationEnabled");
    const nextBestActionEnabled = useModuleEnabled("NEXT_BEST_ACTION");
    const journeyOrchestrationEnabled = useModuleEnabled("JOURNEY_ORCHESTRATION");
    const serviceDeskEnabled = useModuleEnabled("SERVICE_DESK");
    const predictiveScoringEnabled = useModuleEnabled("PREDICTIVE_SCORING");
    const partnersEnabled = useModuleEnabled("PARTNERS");
    const marketplaceEnabled = useModuleEnabled("MARKETPLACE");
    const apiAccessEnabled = useFeature("apiAccessEnabled");

    const visibleItems = sidebarNavItems.filter((item) => {
        if (item.feature === "payoutsEnabled") return payoutsEnabled;
        if (item.feature === "gamificationEnabled") return gamificationEnabled;
        if (item.feature === "apiAccessEnabled") return apiAccessEnabled;
        if (item.module === "PREDICTIVE_SCORING") return predictiveScoringEnabled;
        if (item.module === "NEXT_BEST_ACTION") return nextBestActionEnabled;
        if (item.module === "JOURNEY_ORCHESTRATION") return journeyOrchestrationEnabled;
        if (item.module === "SERVICE_DESK") return serviceDeskEnabled;
        if (item.module === "PARTNERS") return partnersEnabled;
        if (item.module === "MARKETPLACE") return marketplaceEnabled;
        return true;
    });

    const groups = [
        { title: "Workspace", keys: ["settings"] },
        { title: "People & access", keys: ["teams", "users", "roles", "partners", "sales-groups", "permission-templates"] },
        { title: "Sales configuration", keys: ["opportunity-types", "catalog", "activity-types", "custom-fields", "assignment-rules", "lead-scoring", "next-best-action", "ai-assistant"] },
        { title: "Tasks & service", keys: ["task-playbooks", "task-sla-policies", "call-dispositions", "agent-availability", "call-scripts", "call-campaigns", "service-desk"] },
        { title: "Finance & rewards", keys: ["payout-cycles", "commission-rules", "gamification"] },
        { title: "Integrations & data", keys: ["integrations", "api-keys", "scim", "duplicate-rules", "dedupe", "marketplace"] },
        { title: "Security", keys: ["security", "sessions", "mfa", "password", "privileged-actions", "audit-logs", "gdpr"] },
    ];
    const itemsFor = (keys: string[]) => visibleItems.filter(item => keys.includes(item.href.split("/").at(-1)!));
    const activeItem = [...sidebarNavItems].sort((a, b) => b.href.length - a.href.length).find(item => pathname === item.href || pathname.startsWith(item.href + "/"));
    return (
        <nav aria-label="Settings sections" className="min-w-0 self-start xl:sticky xl:top-[calc(var(--app-header-offset)+16px)]">
            <label className="grid gap-2 text-sm font-medium xl:hidden">
                Settings section
                <select value={activeItem?.href || "/dashboard/settings"} onChange={event => router.push(event.target.value)} className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {activeItem && !visibleItems.some(item => item.href === activeItem.href) && <option value={activeItem.href} disabled>{activeItem.title}</option>}
                    {groups.map(group => <optgroup key={group.title} label={group.title}>
                        {itemsFor(group.keys).map(item => <option key={item.href} value={item.href}>{item.title}</option>)}
                    </optgroup>)}
                </select>
            </label>
            <div className="hidden xl:block">
                <Input aria-label="Search settings" placeholder="Find a setting…" value={search} onChange={event => setSearch(event.target.value)} className="mb-3" />
                <div className="max-h-[calc(100dvh-var(--app-header-offset)-120px)] overflow-y-auto overscroll-contain pr-2">
                    {groups.map(group => {
                        const items = itemsFor(group.keys).filter(item => item.title.toLowerCase().includes(search.toLowerCase()));
                        if (!items.length) return null;
                        return <div key={group.title} className="mb-4">
                            <p className="mb-1 px-2 text-xs font-semibold text-muted-foreground">{group.title}</p>
                            <ul className="space-y-1">{items.map(item => {
                                const Icon = item.icon;
                                const active = activeItem?.href === item.href;
                                return <li key={item.href}><Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-10 items-center gap-2 rounded-lg px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                                    <Icon className="size-4 shrink-0" /><span>{item.title}</span>
                                </Link></li>;
                            })}</ul>
                        </div>;
                    })}
                    {!visibleItems.some(item => item.title.toLowerCase().includes(search.toLowerCase())) && <p className="px-2 py-4 text-sm text-muted-foreground">No matching settings. Try a different name.</p>}
                </div>
            </div>
        </nav>
    );
}
