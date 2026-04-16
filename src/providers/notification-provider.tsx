
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const { token, isAuthenticated } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!isAuthenticated || !token) return;

        // Use versioned API path (/v1/) to match NestJS versioning
        const eventSource = new EventSource(`${API_URL}/v1/notifications/sse?token=${token}`);

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
