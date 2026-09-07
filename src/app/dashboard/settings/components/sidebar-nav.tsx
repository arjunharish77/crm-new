"use client";

import { usePathname } from "next/navigation";
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

    return (
        <nav className="overflow-y-auto pr-1 pb-8 lg:max-h-[calc(100vh-210px)]">
            <ul className="flex flex-col gap-[3px]">
                {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;

                    return (
                        <li key={item.href}>
                            <Link
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all",
                                    active
                                        ? "bg-primary/10 font-bold text-primary"
                                        : "font-medium text-muted-foreground hover:translate-x-1 hover:bg-accent hover:text-accent-foreground"
                                )}
                            >
                                <Icon className={cn("size-[19px] shrink-0", active ? "opacity-100" : "opacity-70")} />
                                <span className="truncate">{item.title}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
