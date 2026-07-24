
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
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const API_URL = '/api';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const { token, isAuthenticated } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!isAuthenticated || !token) return;

        const eventSource = new EventSource(`${API_URL}/notifications/sse?token=${token}`);

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
                setUnreadCount((prev) => Math.max(prev, normalized.length));
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
            setUnreadCount(prev => prev + 1);

            toast(newNotification.title, {
                description: newNotification.message,
            });
        };

        eventSource.onerror = () => {
            // EventSource reconnects automatically; no polling fallback is used.
        };

        return () => {
            eventSource.close();
        };
    }, [isAuthenticated, token]);

    const clearNotifications = () => {
        const ids = notifications.map((item) => item.id).filter((id): id is string => typeof id === "string" && id.length > 0);
        setNotifications([]);
        setUnreadCount(0);
        if (ids.length && token) {
            fetch(`${API_URL}/notifications`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ ids }),
            }).catch(() => undefined);
        }
    };

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            clearNotifications
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
