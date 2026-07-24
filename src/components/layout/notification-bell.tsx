'use client';

import * as React from 'react';
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

export function NotificationBell() {
    const { notifications, unreadCount, clearNotifications } = useNotifications();

    return (
        <DropdownMenu>
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
                        notifications.map((notif, i) => (
                            <React.Fragment key={i}>
                                <div className="px-4 py-3 hover:bg-accent">
                                    <div className="flex justify-between gap-3">
                                        <div className="text-sm font-semibold">{notif.title}</div>
                                        <div className="shrink-0 text-xs text-muted-foreground">
                                            {formatWorkspaceRelativeTime(notif.timestamp)}
                                        </div>
                                    </div>
                                    <div className="mt-1 text-sm leading-snug text-muted-foreground">{notif.message}</div>
                                </div>
                                {i < notifications.length - 1 && <DropdownMenuSeparator className="m-0" />}
                            </React.Fragment>
                        ))
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
