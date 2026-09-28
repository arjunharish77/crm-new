'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Keyboard, LogOut, Menu, Plus, Search, Settings } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useFeature } from '@/components/auth/feature-gate';
import { NotificationBell } from './notification-bell';
import { AgentAvailabilityToggle } from './agent-availability-toggle';
import { GlobalSearch } from '@/components/search/global-search';
import { CreateLeadDialog } from '@/app/dashboard/leads/create-lead-dialog';
import { CreateOpportunityDialog } from '@/app/dashboard/opportunities/create-opportunity-dialog';
import { CreateActivityDialog } from '@/app/dashboard/activities/create-activity-dialog';
import { contextualRecordDefaults } from '@/lib/contextual-defaults';
import { useRegisterShortcut, useKeyboardShortcutsHelp } from '@/lib/keyboard-shortcuts';

export function Header({ onToggleNavigation, navigationOpen }: { onToggleNavigation: () => void; navigationOpen: boolean }) {
    const { user, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const automationEnabled = useFeature('automationEnabled');
    const { openHelp } = useKeyboardShortcutsHelp();

    // Dialog Control States
    const [createLeadOpen, setCreateLeadOpen] = React.useState(false);
    const [createOpportunityOpen, setCreateOpportunityOpen] = React.useState(false);
    const [createActivityOpen, setCreateActivityOpen] = React.useState(false);
    const [searchOpen, setSearchOpen] = React.useState(false);
    const [createMenuOpen, setCreateMenuOpen] = React.useState(false);

    const contextDefaults = contextualRecordDefaults(pathname);

    // Same client-side permission gate the command palette already established (real
    // enforcement stays server-side on the actual create endpoints) -- an unrecognized/absent
    // module key defaults to visible, matching this app's "missing -> enabled" convention.
    const rolePermissions = (user as any)?.role?.permissions;
    const modules = rolePermissions?.modules ?? {};
    const canAccessModule = (key: string) => modules[key] !== 'none' && modules[key] !== false;

    const contextQuery = (extra: Record<string, string | undefined> = {}) => {
        const params = new URLSearchParams({ create: '1' });
        for (const [key, value] of Object.entries(extra)) {
            if (value) params.set(key, value);
        }
        return `?${params.toString()}`;
    };

    // Cmd/Ctrl+K opens global search / command palette from anywhere in the dashboard shell --
    // now registered through the shared keyboard-shortcut system (gap checklist Module 10) so it
    // participates in the enablement toggle, conflict handling, and the discoverable help
    // overlay, instead of a standalone listener only this one shortcut had.
    useRegisterShortcut({
        id: 'open-search',
        combo: { key: 'k', meta: true },
        description: 'Open search / command palette',
        group: 'Global',
        handler: () => setSearchOpen((current) => !current),
    });
    useRegisterShortcut({
        id: 'open-create-menu',
        combo: { key: 'c' },
        description: 'Open the Create menu',
        group: 'Global',
        handler: () => setCreateMenuOpen(true),
    });

    const initials = user?.email?.substring(0, 2).toUpperCase() || 'U';

    return (
        <header className="border-b bg-background text-foreground">
            <div className="flex min-h-14 min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-2 md:px-6">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Button id="mobile-navigation-trigger" variant="ghost" size="icon" className="shrink-0 md:hidden" aria-label="Open navigation" aria-expanded={navigationOpen} onClick={onToggleNavigation}>
                        <Menu className="size-5" />
                    </Button>

                    {/* Global Search */}
                    <div className="flex min-w-0 flex-1 md:mr-4">
                        <button
                            type="button"
                            aria-label="Search or run a command"
                            onClick={() => setSearchOpen(true)}
                            className="flex h-10 min-w-0 w-full max-w-[600px] items-center rounded-lg border border-transparent bg-muted px-4 py-2 text-left transition-colors hover:bg-accent/70 focus-visible:border-primary focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                        >
                            <Search className="size-5 shrink-0 text-muted-foreground sm:mr-2" />
                            <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
                                Search or run a command...
                            </span>
                            <span className="hidden shrink-0 rounded-md border bg-background px-1.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline-block">
                                ⌘K
                            </span>
                        </button>
                    </div>
                </div>

                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                    {/* Quick Create */}
                    <DropdownMenu open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" className="px-2 sm:px-3" aria-label="Create record">
                                <Plus className="size-4" />
                                <span className="hidden sm:inline">Create</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {canAccessModule('leads') && (
                                <DropdownMenuItem onSelect={() => setCreateLeadOpen(true)}>New Lead</DropdownMenuItem>
                            )}
                            {canAccessModule('opportunities') && (
                                <DropdownMenuItem onSelect={() => setCreateOpportunityOpen(true)}>New Opportunity</DropdownMenuItem>
                            )}
                            {canAccessModule('tasks') && (
                                <DropdownMenuItem onSelect={() => router.push(`/dashboard/tasks${contextQuery(contextDefaults)}`)}>New Task</DropdownMenuItem>
                            )}
                            {canAccessModule('activities') && (
                                <DropdownMenuItem onSelect={() => setCreateActivityOpen(true)}>Log Activity</DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => router.push(`/dashboard/lists${contextQuery()}`)}>New List</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => router.push(`/dashboard/reports${contextQuery()}`)}>New Report</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => router.push(`/dashboard${contextQuery()}`)}>New Dashboard Widget</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => router.push('/dashboard/marketing')}>New Campaign</DropdownMenuItem>
                            {automationEnabled && (
                                <DropdownMenuItem onSelect={() => router.push('/dashboard/automations-v2/new')}>New Automation</DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <AgentAvailabilityToggle />

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={openHelp} aria-label="Keyboard shortcuts">
                                <Keyboard className="size-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Keyboard shortcuts (Shift+?)</TooltipContent>
                    </Tooltip>

                    <NotificationBell />

                    <div className="mx-1 hidden h-8 w-px bg-border md:block" />

                    <div className="ml-1 flex items-center gap-3">
                        <div className="hidden max-w-36 truncate text-right xl:block">
                            <div className="text-sm font-semibold">
                                {user?.email?.split('@')[0]}
                            </div>

                        </div>

                        <DropdownMenu>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                        <button aria-label="Account menu" className="rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
                                            <Avatar className="size-9">
                                                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                                                    {initials}
                                                </AvatarFallback>
                                            </Avatar>
                                        </button>
                                    </DropdownMenuTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Profile</TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="end" className="min-w-[220px]">
                                <DropdownMenuLabel>
                                    <div className="truncate text-sm font-semibold">{user?.email}</div>
                                    <div className="truncate text-xs font-normal text-muted-foreground">Tenant: {user?.tenantId}</div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => router.push('/dashboard/settings')}>
                                    <Settings className="size-4" />
                                    Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={logout}>
                                    <LogOut className="size-4" />
                                    Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Global Dialogs */}
                <GlobalSearch
                    open={searchOpen}
                    onOpenChange={setSearchOpen}
                    onCreateLead={() => setCreateLeadOpen(true)}
                    onCreateOpportunity={() => setCreateOpportunityOpen(true)}
                    onCreateActivity={() => setCreateActivityOpen(true)}
                />
                <CreateLeadDialog
                    open={createLeadOpen}
                    onOpenChange={setCreateLeadOpen}
                    onSuccess={() => window.location.reload()}
                    trigger={<span hidden />}
                />
                <CreateOpportunityDialog
                    open={createOpportunityOpen}
                    onOpenChange={setCreateOpportunityOpen}
                    onSuccess={() => window.location.reload()}
                    trigger={<span hidden />}
                />
                <CreateActivityDialog
                    open={createActivityOpen}
                    onOpenChange={setCreateActivityOpen}
                    onSuccess={() => window.location.reload()}
                    trigger={<span hidden />}
                    defaultLeadId={contextDefaults.leadId}
                    defaultOpportunityId={contextDefaults.opportunityId}
                />
            </div>
        </header>
    );
}
