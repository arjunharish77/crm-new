'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import { LogOut, Plus, Search, Settings } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { NotificationBell } from './notification-bell';
import { CreateLeadDialog } from '@/app/dashboard/leads/create-lead-dialog';
import { CreateOpportunityDialog } from '@/app/dashboard/opportunities/create-opportunity-dialog';
import { CreateActivityDialog } from '@/app/dashboard/activities/create-activity-dialog';

export function Header() {
    const { user, logout } = useAuth();
    const router = useRouter();

    // Dialog Control States
    const [createLeadOpen, setCreateLeadOpen] = React.useState(false);
    const [createOpportunityOpen, setCreateOpportunityOpen] = React.useState(false);
    const [createActivityOpen, setCreateActivityOpen] = React.useState(false);

    const initials = user?.email?.substring(0, 2).toUpperCase() || 'U';

    return (
        <header className="sticky top-0 z-50 border-b bg-background text-foreground">
            <div className="flex min-h-16 items-center justify-between px-4 md:px-8">
                <div className="flex grow items-center gap-4">
                    <div className="font-bold text-primary md:hidden">
                        Unnatify
                    </div>

                    {/* Global Search */}
                    <div className="mx-0 flex grow justify-center md:mx-4">
                        <label className="flex w-full max-w-[600px] items-center rounded-full border border-transparent bg-muted px-4 py-2 transition-colors hover:bg-accent/70 focus-within:border-primary focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/20">
                            <Search className="mr-2 size-5 text-muted-foreground" />
                            <input
                                placeholder="Search leads, opportunities, activities..."
                                className="w-full border-0 bg-transparent text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground"
                            />
                        </label>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {/* Quick Create */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button className="hidden sm:inline-flex">
                                <Plus className="size-4" />
                                Create
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setCreateLeadOpen(true)}>New Lead</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setCreateOpportunityOpen(true)}>New Opportunity</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setCreateActivityOpen(true)}>Log Activity</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <NotificationBell />

                    <div className="mx-2 h-8 w-px bg-border" />

                    <div className="ml-1 flex items-center gap-3">
                        <div className="hidden text-right md:block">
                            <div className="text-sm font-semibold">
                                {user?.email?.split('@')[0]}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {user?.tenantId?.substring(0, 8)}...
                            </div>
                        </div>

                        <DropdownMenu>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                        <button className="rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
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
                />
            </div>
        </header>
    );
}
