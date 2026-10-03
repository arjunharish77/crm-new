'use client';

import * as React from 'react';
import Link from 'next/link';
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
// Tasks open in the tasks page's editor (?taskId=).
export function resolveNotificationLink(data: any): string | null {
    if (!data || typeof data !== 'object') return null;
    if (data.viewId) return `/dashboard/views?viewId=${data.viewId}`;
    if (data.entityType === 'APPLICATION' && data.entityId) return `/dashboard/applications/${encodeURIComponent(data.entityId)}`;
    if (data.entityType === 'OPPORTUNITY' && data.entityId) return `/dashboard/opportunities/${data.entityId}`;
    if (data.entityType === 'LEAD' && data.entityId) return `/dashboard/leads/${data.entityId}`;
    if (data.opportunityId) return `/dashboard/opportunities/${data.opportunityId}`;
    if (data.leadId) return `/dashboard/leads/${data.leadId}`;
    if (data.taskId) return `/dashboard/tasks?taskId=${encodeURIComponent(data.taskId)}`;
    return null;
}

export function NotificationBell() {
    const { notifications, unreadCount, markAllAsRead, markAsRead } = useNotifications();
    const router = useRouter();
    const [open, setOpen] = React.useState(false);

    const handleSelect = (notif: (typeof notifications)[number]) => {
        const link = resolveNotificationLink(notif.data);
        markAsRead(notif.id);
        setOpen(false);
        if (link) router.push(link);
    };

    // The unread count is part of the button's name (UI/UX plan §11.6 M), not only a red dot.
    const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={label} className="relative">
                            <Bell className="size-5" />
                            {unreadCount > 0 ? (
                                <span aria-hidden className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-medium leading-5 tabular-nums text-destructive-foreground">
                                    {unreadCount > 99 ? "99+" : unreadCount}
                                </span>
                            ) : null}
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
            </Tooltip>

            <DropdownMenuContent align="end" className="flex max-h-[520px] w-[360px] flex-col p-0">
                <DropdownMenuLabel className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm font-semibold">Notifications</span>
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={markAllAsRead}
                            className="rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Mark all as read
                        </button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="m-0" />
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>
                    ) : (
                        <ul>
                            {notifications.map((notif, i) => (
                                <li key={notif.id ?? i} className="border-b last:border-b-0">
                                    <NotificationRow notification={notif} onSelect={() => handleSelect(notif)} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <DropdownMenuSeparator className="m-0" />
                <Link
                    href="/dashboard/notifications"
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                    View all notifications
                </Link>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// One notification: unread ones carry a dot and full-strength text, read ones are dimmed.
export function NotificationRow({ notification, onSelect }: {
    notification: { title: string; message: string; timestamp: string; read?: boolean; data?: any };
    onSelect: () => void;
}) {
    const unread = !notification.read;
    return (
        <button
            type="button"
            onClick={onSelect}
            className="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
            <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? "bg-primary" : "bg-transparent"}`} />
            <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-3">
                    <span className={`text-sm ${unread ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {unread ? <span className="sr-only">Unread: </span> : null}
                        {notification.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatWorkspaceRelativeTime(notification.timestamp)}</span>
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{notification.message}</span>
            </span>
        </button>
    );
}
