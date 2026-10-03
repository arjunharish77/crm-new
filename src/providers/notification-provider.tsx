
"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { toast } from "sonner";

interface Notification {
    id?: string;
    type: string;
    title: string;
    message: string;
    data: any;
    timestamp: string;
    read?: boolean;
}

type NotificationSnapshotItem = {
    id?: string;
    title: string;
    message: string;
    data: any;
    createdAt?: string;
};

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    clearNotifications: () => void;
    markAsRead: (id: string | undefined) => void;
    markAllAsRead: () => void;
}

function patchRead(ids: string[], read: boolean) {
    return fetch(`/api/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, read }),
    }).then((response) => { if (!response.ok) throw new Error("Couldn't update notifications"); });
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const API_URL = '/api';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    // Read items stay in the list, dimmed, until the next load (UI/UX plan §11.6 M), so the
    // count comes from the list rather than a separate counter that could drift.
    const unreadCount = notifications.filter((item) => !item.read).length;

    useEffect(() => {
        if (!isAuthenticated) return;

        // F06 fix (WP05): no more raw session token in the SSE URL (query strings end up in
        // server/proxy logs and browser history) -- EventSource sends the HttpOnly session
        // cookie automatically for this same-origin request, the same way a normal fetch does.
        const eventSource = new EventSource(`${API_URL}/notifications/sse`);

        eventSource.onmessage = (event) => {
            let payload: any;
            try {
                payload = JSON.parse(event.data);
            } catch {
                return;
            }

            if (payload?.type === 'heartbeat') return;

            if (payload?.type === "snapshot") {
                const items = Array.isArray(payload.notifications) ? payload.notifications : [];
                const normalized: Notification[] = items.map((item: NotificationSnapshotItem) => ({
                    id: item.id,
                    type: item.data?.type || "notification",
                    title: item.title,
                    message: item.message,
                    data: item.data,
                    timestamp: item.createdAt || new Date().toISOString(),
                }));

                setNotifications((prev) => {
                    const seen = new Set(prev.map((item) => item.id).filter(Boolean));
                    return [...normalized.filter((item) => !item.id || !seen.has(item.id)), ...prev];
                });
                return;
            }

            const newNotification: Notification = {
                id: payload.id,
                ...payload,
                timestamp: new Date().toISOString()
            };

            setNotifications(prev => {
                if (newNotification.id && prev.some((item) => item.id === newNotification.id)) return prev;
                return [newNotification, ...prev];
            });

            // Inbound calls get their own rich popup (InboundCallPopupProvider), driven off
            // this same `notifications` array -- the default toast is redundant for that type.
            if (newNotification.data?.type !== "INBOUND_CALL") {
                toast(newNotification.title, {
                    description: newNotification.message,
                });
            }
        };

        eventSource.onerror = () => {
            // EventSource reconnects automatically; no polling fallback is used.
        };

        return () => {
            eventSource.close();
        };
    }, [isAuthenticated]);

    const unreadIds = () => notifications.filter((item) => !item.read && item.id).map((item) => item.id as string);
    const setRead = (ids: string[], read: boolean) => {
        const target = new Set(ids);
        setNotifications((prev) => prev.map((item) => (item.id && target.has(item.id) ? { ...item, read } : item)));
    };

    // "Mark all as read", with Undo (§11.6 D: a reversible change is done, then undoable).
    const markAllAsRead = () => {
        const ids = unreadIds();
        if (!ids.length) return;
        setRead(ids, true);
        patchRead(ids, true).catch(() => {
            setRead(ids, false);
            toast.error("Couldn't mark notifications as read");
        });
        toast.success(`${ids.length} notification${ids.length === 1 ? "" : "s"} marked as read`, {
            duration: 6000,
            action: {
                label: "Undo",
                onClick: () => {
                    setRead(ids, false);
                    patchRead(ids, false).catch(() => toast.error("Couldn't undo"));
                },
            },
        });
    };

    // Kept for existing callers: marks everything read and empties the list.
    const clearNotifications = () => {
        const ids = unreadIds();
        setNotifications([]);
        if (ids.length) patchRead(ids, true).catch(() => undefined);
    };

    // Opening one notification marks only that one read.
    const markAsRead = (id: string | undefined) => {
        if (!id) return;
        setRead([id], true);
        patchRead([id], true).catch(() => undefined);
    };

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            clearNotifications,
            markAsRead,
            markAllAsRead,
        }}>
            {children}
        </NotificationContext.Provider>
    );
}

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};
