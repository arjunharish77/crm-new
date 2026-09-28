'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/providers/notification-provider';
import { formatWorkspaceRelativeTime } from '@/lib/date-format';

// Every notification's `data` payload already carries the ids needed to jump straight to the
// record it's about -- this just picks the most specific real destination that exists.
// Activities/Tasks have no per-record detail page in this app, so those fall back to their
// list page rather than a dead link.
export function resolveNotificationLink(data: any): string | null {
    if (!data || typeof data !== 'object') return null;
    if (data.viewId) return `/dashboard/views?viewId=${data.viewId}`;
    if (data.entityType === 'APPLICATION' && data.entityId) return `/dashboard/applications/${encodeURIComponent(data.entityId)}`;
    if (data.entityType === 'OPPORTUNITY' && data.entityId) return `/dashboard/opportunities/${data.entityId}`;
    if (data.entityType === 'LEAD' && data.entityId) return `/dashboard/leads/${data.entityId}`;
    if (data.opportunityId) return `/dashboard/opportunities/${data.opportunityId}`;
    if (data.leadId) return `/dashboard/leads/${data.leadId}`;
    if (data.taskId) return `/dashboard/tasks`;
    return null;
}

export function NotificationBell() {
    const { notifications, unreadCount, clearNotifications, markAsRead } = useNotifications();
    const router = useRouter();
    const [open, setOpen] = React.useState(false);

    const handleSelect = (notif: (typeof notifications)[number]) => {
        const link = resolveNotificationLink(notif.data);
        markAsRead(notif.id);
        setOpen(false);
        if (link) router.push(link);
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Notifications" className="relative">
                            <Bell className="size-5" />
                            {unreadCount > 0 ? (
                                <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[0.6875rem] font-bold leading-5 text-destructive-foreground">
                                    {unreadCount}
                                </span>
                            ) : null}
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Notifications</TooltipContent>
            </Tooltip>

            <DropdownMenuContent align="end" className="max-h-[480px] w-[320px] overflow-y-auto p-0">
                <DropdownMenuLabel className="flex items-center justify-between p-4">
                    <span className="text-base font-bold">
                        Notifications
                    </span>
                    {notifications.length > 0 && (
                        <button
                            type="button"
                            onClick={clearNotifications}
                            className="rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Clear all
                        </button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="m-0" />
                <div>
                    {notifications.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">No notifications</div>
                    ) : (
                        notifications.map((notif, i) => {
                            const link = resolveNotificationLink(notif.data);
                            return (
                                <React.Fragment key={notif.id ?? i}>
                                    <button
                                        type="button"
                                        onClick={() => handleSelect(notif)}
                                        className={`block w-full px-4 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${link ? "cursor-pointer" : "cursor-default"}`}
                                    >
                                        <div className="flex justify-between gap-3">
                                            <div className="text-sm font-semibold">{notif.title}</div>
                                            <div className="shrink-0 text-xs text-muted-foreground">
                                                {formatWorkspaceRelativeTime(notif.timestamp)}
                                            </div>
                                        </div>
                                        <div className="mt-1 text-sm leading-snug text-muted-foreground">{notif.message}</div>
                                    </button>
                                    {i < notifications.length - 1 && <DropdownMenuSeparator className="m-0" />}
                                </React.Fragment>
                            );
                        })
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
