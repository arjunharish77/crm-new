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
import { Keyboard, LogOut, Menu, Plus, Search, Settings, UserRound } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { NotificationBell } from './notification-bell';
import { AgentAvailabilityToggle } from './agent-availability-toggle';
import { GlobalSearch } from '@/components/search/global-search';
import { CreateLeadDialog } from '@/app/dashboard/leads/create-lead-dialog';
import { CreateOpportunityDialog } from '@/app/dashboard/opportunities/create-opportunity-dialog';
import { CreateActivityDialog } from '@/app/dashboard/activities/create-activity-dialog';
import { contextualRecordDefaults } from '@/lib/contextual-defaults';
import { useRegisterShortcut, useKeyboardShortcutsHelp } from '@/lib/keyboard-shortcuts';
import { emitRecordsChanged } from '@/lib/records-events';
import { useModuleAccess } from '@/hooks/use-module-access';
import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-logo";

export function Header({ onToggleNavigation, navigationOpen }: { onToggleNavigation: () => void; navigationOpen: boolean }) {
    const { user, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const { openHelp } = useKeyboardShortcutsHelp();

    // Dialog Control States
    const [createLeadOpen, setCreateLeadOpen] = React.useState(false);
    const [createOpportunityOpen, setCreateOpportunityOpen] = React.useState(false);
    const [createActivityOpen, setCreateActivityOpen] = React.useState(false);
    const [searchOpen, setSearchOpen] = React.useState(false);
    const [createMenuOpen, setCreateMenuOpen] = React.useState(false);

    const contextDefaults = contextualRecordDefaults(pathname);

    // Create needs "write" on the module -- the rule the server enforces (lib/module-access.ts).
    const can = useModuleAccess();
    const canAccessModule = (key: string) => can(key, 'write');

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

    // The person's name, not an email prefix (UI/UX plan §11.6 M).
    const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'Account';
    const initials = (user?.name?.trim()
        ? user.name.trim().split(/\s+/).slice(0, 2).map((part: string) => part.charAt(0)).join('')
        : user?.email?.substring(0, 2) || 'U').toUpperCase();

    return (
        <header className="border-b bg-card text-foreground">
            <div className="flex min-h-14 min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-2 md:px-6">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Button id="mobile-navigation-trigger" variant="ghost" size="icon" className="shrink-0 md:hidden" aria-label="Open navigation" aria-expanded={navigationOpen} onClick={onToggleNavigation}>
                        <Menu className="size-5" />
                    </Button>
                    {/* The menu holds the full logo; on phones, where it's closed, the mark stands in. */}
                    <Link href="/dashboard" aria-label="Unnatify home" className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">
                        <BrandMark className="size-7" />
                    </Link>

                    {/* Global Search */}
                    <div className="flex min-w-0 flex-1 md:mr-4">
                        <button
                            type="button"
                            aria-label="Search or run a command"
                            onClick={() => setSearchOpen(true)}
                            className="flex h-10 min-w-0 w-full max-w-[600px] items-center rounded-lg border border-transparent bg-muted px-4 py-2 text-left transition-colors hover:bg-surface-container-highest focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
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
                            {/* Record creates only (UI/UX plan §11.6 M); lists, reports, campaigns and
                                automations are created from their own pages. */}
                            {canAccessModule('leads') && (
                                <DropdownMenuItem onSelect={() => setCreateLeadOpen(true)}>Lead</DropdownMenuItem>
                            )}
                            {canAccessModule('opportunities') && user?.features?.opportunityEnabled !== false && (
                                <DropdownMenuItem onSelect={() => setCreateOpportunityOpen(true)}>Opportunity</DropdownMenuItem>
                            )}
                            {canAccessModule('tasks') && (
                                <DropdownMenuItem onSelect={() => router.push(`/dashboard/tasks${contextQuery(contextDefaults)}`)}>Task</DropdownMenuItem>
                            )}
                            {canAccessModule('activities') && (
                                <DropdownMenuItem onSelect={() => setCreateActivityOpen(true)}>Activity</DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <AgentAvailabilityToggle />

                    <NotificationBell />

                    <div className="mx-1 hidden h-8 w-px bg-border md:block" />

                    <div className="ml-1 flex items-center gap-3">
                        <div className="hidden max-w-44 text-right xl:block">
                            <div className="truncate text-sm font-medium">{displayName}</div>
                            {user?.tenantName ? <div className="truncate text-xs text-muted-foreground">{user.tenantName}</div> : null}
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
                                    <div className="truncate text-sm font-medium">{displayName}</div>
                                    <div className="truncate text-xs font-normal text-muted-foreground">{user?.email}</div>
                                    {user?.tenantName ? <div className="truncate text-xs font-normal text-muted-foreground">{user.tenantName}</div> : null}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={openHelp}>
                                    <Keyboard className="size-4" />
                                    Keyboard shortcuts
                                    <span className="ml-auto text-xs text-muted-foreground">Shift ?</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => router.push('/dashboard/account')}>
                                    <UserRound className="size-4" />
                                    My account
                                </DropdownMenuItem>
                                {user?.isTenantAdmin || user?.isPlatformAdmin ? (
                                    <DropdownMenuItem onSelect={() => router.push('/dashboard/settings')}>
                                        <Settings className="size-4" />
                                        Settings
                                    </DropdownMenuItem>
                                ) : null}
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
                    onSuccess={() => emitRecordsChanged('lead')}
                    trigger={<span hidden />}
                />
                <CreateOpportunityDialog
                    open={createOpportunityOpen}
                    onOpenChange={setCreateOpportunityOpen}
                    onSuccess={() => emitRecordsChanged('opportunity')}
                    trigger={<span hidden />}
                />
                <CreateActivityDialog
                    open={createActivityOpen}
                    onOpenChange={setCreateActivityOpen}
                    onSuccess={() => emitRecordsChanged('activity')}
                    trigger={<span hidden />}
                    defaultLeadId={contextDefaults.leadId}
                    defaultOpportunityId={contextDefaults.opportunityId}
                />
            </div>
        </header>
    );
}
