'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    Activity,
    BarChart3,
    BadgeDollarSign,
    BriefcaseBusiness,
    CheckSquare,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Download,
    FileText,
    LayoutDashboard,
    LayoutList,
    List,
    Megaphone,
    Puzzle,
    Shield,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Star,
    Trophy,
    Users,
    UsersRound,
    WandSparkles,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const drawerWidth = 248;
const railWidth = 68;

interface NavItem {
    name: string;
    href: string;
    icon: React.ReactNode;
    enabled?: boolean;
    adminOnly?: boolean;
}

export function NavigationDrawer({ open, toggleDrawer }: { open: boolean; toggleDrawer: () => void }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useAuth();
    const [isMobile, setIsMobile] = React.useState(false);

    const [adminOpen, setAdminOpen] = React.useState(true);
    const [platformOpen, setPlatformOpen] = React.useState(true);
    const [customOpen, setCustomOpen] = React.useState(true);
    const [customObjects, setCustomObjects] = React.useState<any[]>([]);
    const [canAccessPayouts, setCanAccessPayouts] = React.useState(true);

    React.useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const updateIsMobile = () => setIsMobile(mediaQuery.matches);

        updateIsMobile();
        mediaQuery.addEventListener('change', updateIsMobile);

        return () => mediaQuery.removeEventListener('change', updateIsMobile);
    }, []);

    React.useEffect(() => {
        apiFetch('/metadata/objects')
            .then((data: any[]) => {
                if (Array.isArray(data)) {
                    setCustomObjects(data.filter((obj: any) => obj.isCustom));
                }
            })
            .catch(console.error);
    }, []);

    const isPartner = !!(user?.role as any)?.permissions?.isPartnerRole;

    React.useEffect(() => {
        if (!isPartner) return;
        apiFetch<{ canAccess: boolean }>('/partners/me/payout-access')
            .then((data) => setCanAccessPayouts(data.canAccess !== false))
            .catch(() => setCanAccessPayouts(false));
    }, [isPartner]);

    const navigation: NavItem[] = isPartner
        ? [
            { name: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="size-5" /> },
            { name: 'My Leads', href: '/dashboard/leads', icon: <Users className="size-5" /> },
            { name: 'My Opportunities', href: '/dashboard/opportunities', icon: <BriefcaseBusiness className="size-5" />, enabled: user?.features?.opportunityEnabled !== false },
            { name: 'My Activities', href: '/dashboard/activities', icon: <Activity className="size-5" /> },
            { name: 'My Tasks', href: '/dashboard/tasks', icon: <CheckSquare className="size-5" /> },
            { name: 'Views', href: '/dashboard/views', icon: <LayoutList className="size-5" /> },
            { name: 'Exports', href: '/dashboard/exports', icon: <Download className="size-5" /> },
            { name: 'My Payouts', href: '/dashboard/payouts', icon: <BadgeDollarSign className="size-5" />, enabled: canAccessPayouts },
            { name: 'My Points', href: '/dashboard/my-points', icon: <Star className="size-5" /> },
        ]
        : [
            { name: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="size-5" /> },
            { name: 'Leads', href: '/dashboard/leads', icon: <Users className="size-5" />, enabled: true },
            { name: 'Lists', href: '/dashboard/lists', icon: <List className="size-5" />, enabled: true },
            { name: 'Opportunities', href: '/dashboard/opportunities', icon: <BriefcaseBusiness className="size-5" />, enabled: user?.features?.opportunityEnabled !== false },
            { name: 'Activities', href: '/dashboard/activities', icon: <Activity className="size-5" /> },
            { name: 'Tasks', href: '/dashboard/tasks', icon: <CheckSquare className="size-5" /> },
            { name: 'Views', href: '/dashboard/views', icon: <LayoutList className="size-5" /> },
            { name: 'Exports', href: '/dashboard/exports', icon: <Download className="size-5" /> },
            { name: 'Forms', href: '/dashboard/forms', icon: <FileText className="size-5" />, enabled: user?.features?.formBuilderEnabled !== false },
            { name: 'Automations', href: '/dashboard/automations-v2', icon: <WandSparkles className="size-5" />, enabled: user?.features?.automationEnabled !== false },
            { name: 'Marketing', href: '/dashboard/marketing', icon: <Megaphone className="size-5" /> },
            { name: 'Reports', href: '/dashboard/reports', icon: <BarChart3 className="size-5" />, enabled: user?.features?.advancedReporting !== false },
            { name: 'Leaderboard', href: '/dashboard/leaderboard', icon: <Trophy className="size-5" /> },
            { name: 'My Points', href: '/dashboard/my-points', icon: <Star className="size-5" /> },
        ];

    const adminNavigation: NavItem[] = [
        { name: 'Settings', href: '/dashboard/settings', icon: <SlidersHorizontal className="size-5" /> },
    ];

    const platformNavigation: NavItem[] = [
        { name: 'Tenants', href: '/platform-admin', icon: <ShieldCheck className="size-5" />, adminOnly: true },
        { name: 'Audit Logs', href: '/platform-admin/audit-logs', icon: <Shield className="size-5" />, adminOnly: true },
    ];

    const goTo = (href: string) => {
        if (pathname !== href) {
            router.push(href);
        }
        if (isMobile) toggleDrawer();
    };

    const renderNavItem = (item: NavItem) => {
        const isRoot = item.href === '/dashboard';
        const active = isRoot ? pathname === '/dashboard' : (pathname === item.href || pathname.startsWith(item.href + '/'));
        const labelVisible = open || isMobile;

        const button = (
            <button
                type="button"
                onClick={() => goTo(item.href)}
                className={cn(
                    "group flex min-h-10 w-full items-center rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                    labelVisible ? "justify-start gap-3" : "mx-auto size-10 justify-center px-0",
                    active
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
            >
                <span
                    className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg",
                        !labelVisible && active ? "bg-secondary text-secondary-foreground" : "text-current"
                    )}
                >
                    {item.icon}
                </span>
                {labelVisible ? (
                    <span className={cn("truncate", active ? "font-bold" : "font-medium")}>{item.name}</span>
                ) : null}
            </button>
        );

        return (
            <li key={item.name} className="mb-1">
                {!labelVisible ? (
                    <Tooltip>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent side="right">{item.name}</TooltipContent>
                    </Tooltip>
                ) : button}
            </li>
        );
    };

    const renderSection = (
        title: string,
        items: NavItem[],
        isOpen: boolean,
        onToggle: () => void,
    ) => {
        const filtered = items.filter(item => item.enabled !== false && (!item.adminOnly || user?.isPlatformAdmin));
        if (filtered.length === 0) return null;

        const hasActiveChild = filtered.some(item => pathname === item.href || pathname.startsWith(item.href + '/'));
        const labelVisible = open || isMobile;

        if (!labelVisible) {
            return (
                <div className="relative mb-2">
                    <ul className="space-y-1 px-2">{filtered.map(renderNavItem)}</ul>
                    {hasActiveChild ? <div className="absolute left-0 top-2 h-6 w-1 rounded-r bg-primary" /> : null}
                </div>
            );
        }

        return (
            <div className="mb-2">
                <button
                    type="button"
                    onClick={onToggle}
                    className={cn(
                        "mb-1 flex min-h-8 w-full items-center justify-between rounded-md px-3 text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        hasActiveChild && "text-primary"
                    )}
                >
                    <span>{title}</span>
                    {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
                {isOpen ? <ul className="space-y-1 px-2">{filtered.map(renderNavItem)}</ul> : null}
            </div>
        );
    };

    const drawerContent = (
        <>
            <div className="flex min-h-14 items-center justify-between px-3">
                {(open || isMobile) ? (
                    <>
                        <div className="flex items-center gap-3">
                            <div className="flex size-8 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
                                U
                            </div>
                            <div className="text-sm font-extrabold">Unnatify</div>
                        </div>
                        <Button variant="ghost" size="icon-sm" onClick={toggleDrawer} aria-label="Collapse navigation">
                            <ChevronLeft className="size-5" />
                        </Button>
                    </>
                ) : (
                    <div className="flex w-full justify-center">
                        <Button variant="ghost" size="icon-sm" onClick={toggleDrawer} aria-label="Expand navigation">
                            <ChevronRight className="size-5" />
                        </Button>
                    </div>
                )}
            </div>

            <div className="grow overflow-y-auto py-1">
                <ul className="space-y-1 px-2">
                    {navigation.filter(item => item.enabled !== false).map(renderNavItem)}
                </ul>

                {!isPartner && (open || isMobile) ? <div className="mx-3 my-2 h-px bg-border" /> : null}
                {!isPartner && renderSection('Administration', adminNavigation, adminOpen, () => setAdminOpen(!adminOpen))}

                {!isPartner && customObjects.length > 0 ? (
                    <>
                        {(open || isMobile) ? <div className="mx-3 my-2 h-px bg-border" /> : null}
                        {renderSection('Custom Objects', customObjects.map(obj => ({
                            name: obj.label || obj.name,
                            href: `/dashboard/objects/${obj.name}`,
                            icon: <Puzzle className="size-5" />,
                        })), customOpen, () => setCustomOpen(!customOpen))}
                    </>
                ) : null}

                {user?.isPlatformAdmin ? (
                    <>
                        {(open || isMobile) ? <div className="mx-3 my-2 h-px bg-border" /> : null}
                        {renderSection('Platform', platformNavigation, platformOpen, () => setPlatformOpen(!platformOpen))}
                    </>
                ) : null}
            </div>
        </>
    );

    if (isMobile) {
        return (
            <>
                {open ? (
                    <button
                        type="button"
                        aria-label="Close navigation overlay"
                        className="fixed inset-0 z-40 bg-black/35 md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        onClick={toggleDrawer}
                    />
                ) : null}
                <aside
                    className={cn(
                        "fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r bg-background shadow-xl transition-transform md:hidden",
                        open ? "translate-x-0" : "-translate-x-full"
                    )}
                >
                    {drawerContent}
                </aside>
            </>
        );
    }

    return (
        <aside
            className="hidden shrink-0 flex-col border-r bg-background transition-[width] duration-200 ease-in-out md:flex"
            style={{ width: open ? drawerWidth : railWidth }}
        >
            {drawerContent}
        </aside>
    );
}
