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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    },
    {
        title: "Payout Cycles",
        href: "/dashboard/settings/payout-cycles",
        icon: Wallet,
    },
    {
        title: "Commission Rules",
        href: "/dashboard/settings/commission-rules",
        icon: Percent,
    },
    {
        title: "Gamification",
        href: "/dashboard/settings/gamification",
        icon: Trophy,
    },
    {
        title: "Opportunity Types",
        href: "/dashboard/settings/opportunity-types",
        icon: Briefcase,
    },
    {
        title: "Activity Types",
        href: "/dashboard/settings/activity-types",
        icon: ClipboardCheck,
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
    },
    {
        title: "Security",
        href: "/dashboard/settings/security",
        icon: Shield,
    },
    {
        title: "Permission Templates",
        href: "/dashboard/settings/permission-templates",
        icon: Shield,
    },
    {
        title: "Integrations",
        href: "/dashboard/settings/integrations",
        icon: SlidersHorizontal,
    },
];

export function SettingsSidebar() {
    const pathname = usePathname();

    return (
        <nav className="overflow-y-auto pr-1 pb-8 lg:max-h-[calc(100vh-210px)]">
            <ul className="flex flex-col gap-[3px]">
                {sidebarNavItems.map((item) => {
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
