
"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { jwtDecode } from 'jwt-decode';
import { User, AuthContextType } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    // isLoading starts true and only becomes false AFTER the profile fetch settles
    const [isLoading, setIsLoading] = useState(true);
    const [isImpersonating, setIsImpersonating] = useState(false);
    const [originalToken, setOriginalToken] = useState<string | null>(null);
    const router = useRouter();
    const initRef = useRef(false);

    const fetchMe = async (authToken: string): Promise<User | null> => {
        try {
            const res = await fetch(`${API_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (res.ok) {
                const data = await res.json();
                return data;
            }
            return null;
        } catch (e) {
            console.error('[Auth] Failed to fetch user profile:', e);
            return null;
        }
    };

    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;

        const init = async () => {
            const storedToken = Cookies.get('token');
            if (storedToken) {
                try {
                    const decoded = jwtDecode<any>(storedToken);
                    // Check expiry
                    if (decoded.exp && decoded.exp * 1000 > Date.now()) {
                        setToken(storedToken);
                        // Fetch full profile — WAIT for this before clearing isLoading
                        // This prevents premature redirect in SuperAdminGuard
                        const profile = await fetchMe(storedToken);
                        if (profile) {
                            setUser(profile);
                        } else {
                            // Fall back to decoded JWT as minimal user object
                            setUser({
                                id: decoded.sub,
                                email: decoded.email,
                                tenantId: decoded.tenantId,
                                roleId: decoded.roleId,
                                role: decoded.role,
                                isPlatformAdmin: decoded.isPlatformAdmin ?? false,
                                platformAdminId: decoded.platformAdminId,
                                name: decoded.name || decoded.email,
                            });
                        }
                    } else {
                        // Token expired
                        Cookies.remove('token');
                    }
                } catch (e) {
                    console.error('[Auth] Invalid token on init:', e);
                    Cookies.remove('token');
                }
            }
            // Only set loading to false AFTER everything is resolved
            setIsLoading(false);
        };

        init();
    }, []);

    const login = async (newToken: string) => {
        Cookies.set('token', newToken, { expires: 1 });
        setToken(newToken);
        // Fetch full profile after login
        const profile = await fetchMe(newToken);
        if (profile) {
            setUser(profile);
        } else {
            const decoded = jwtDecode<any>(newToken);
            setUser({
                id: decoded.sub,
                email: decoded.email,
                tenantId: decoded.tenantId,
                roleId: decoded.roleId,
                role: decoded.role,
                isPlatformAdmin: decoded.isPlatformAdmin ?? false,
                platformAdminId: decoded.platformAdminId,
                name: decoded.name || decoded.email,
            });
        }
    };

    const logout = () => {
        fetch(`${API_URL}/auth/logout`, { method: 'POST' }).catch(() => undefined);
        Cookies.remove('token');
        setUser(null);
        setToken(null);
        setIsImpersonating(false);
        setOriginalToken(null);
        router.push('/login');
    };

    const impersonate = async (userId: string) => {
        try {
            const response = await fetch(`${API_URL}/auth/impersonate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ userId }),
            });

            if (!response.ok) {
                throw new Error('Failed to impersonate user');
            }

            const data = await response.json();
            setOriginalToken(token); // Store CURRENT token as original before switching
            Cookies.set('token', data.access_token, { expires: 1 });
            setToken(data.access_token);
            const profile = await fetchMe(data.access_token);
            setUser(profile || jwtDecode<any>(data.access_token));
            setIsImpersonating(true);
        } catch (error) {
            console.error('[Auth] Impersonation error:', error);
            throw error;
        }
    };

    const exitImpersonate = async () => {
        try {
            if (!originalToken) throw new Error('No original token found');

            const response = await fetch(`${API_URL}/auth/exit-impersonate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ originalToken }),
            });

            if (!response.ok) throw new Error('Failed to exit impersonation');

            const data = await response.json();
            Cookies.set('token', data.access_token, { expires: 1 });
            setToken(data.access_token);
            const profile = await fetchMe(data.access_token);
            setUser(profile || jwtDecode<any>(data.access_token));
            setIsImpersonating(false);
            setOriginalToken(null);
        } catch (error) {
            console.error('[Auth] Exit impersonation error:', error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            login,
            logout,
            isAuthenticated: !!user,
            isLoading,
            isImpersonating,
            impersonate,
            exitImpersonate,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
