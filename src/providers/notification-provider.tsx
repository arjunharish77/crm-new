
"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { toast } from "sonner";

interface Notification {
    type: string;
    title: string;
    message: string;
    data: any;
    timestamp: string;
}

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

            // Skip heartbeat events — they are only for keeping the connection alive
            if (payload?.type === 'heartbeat') return;

            const newNotification: Notification = {
                ...payload,
                timestamp: new Date().toISOString()
            };

            setNotifications(prev => [newNotification, ...prev]);
            setUnreadCount(prev => prev + 1);

            toast(newNotification.title, {
                description: newNotification.message,
            });
        };

        eventSource.onerror = () => {
            // Connection errors are expected (server restart, etc.) — just close and let
            // the component re-mount via dependency change if needed
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [isAuthenticated, token]);

    useEffect(() => {
        if (!isAuthenticated || !token) return;

        const fetchUnread = async () => {
            try {
                const response = await fetch(`${API_URL}/notifications`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!response.ok) return;
                const items = await response.json();
                if (!Array.isArray(items) || items.length === 0) return;

                const normalized = items.map((item) => ({
                    type: "automation",
                    title: item.title,
                    message: item.message,
                    data: item.data,
                    timestamp: item.createdAt || new Date().toISOString(),
                }));

                setNotifications(prev => [...normalized, ...prev]);
                setUnreadCount(prev => prev + normalized.length);
                normalized.forEach((item) => {
                    toast(item.title, { description: item.message });
                });

                await fetch(`${API_URL}/notifications`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ ids: items.map((item) => item.id) }),
                });
            } catch {
                // notification polling should never interrupt the app shell
            }
        };

        fetchUnread();
        const interval = window.setInterval(fetchUnread, 30_000);
        return () => window.clearInterval(interval);
    }, [isAuthenticated, token]);

    useEffect(() => {
        if (!isAuthenticated || !token) return;

        const processDueJobs = () => {
            fetch(`${API_URL}/automation-v2/process-due`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }).catch(() => undefined);
        };

        processDueJobs();
        const interval = window.setInterval(processDueJobs, 60_000);
        return () => window.clearInterval(interval);
    }, [isAuthenticated, token]);

    const clearNotifications = () => {
        setNotifications([]);
        setUnreadCount(0);
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
