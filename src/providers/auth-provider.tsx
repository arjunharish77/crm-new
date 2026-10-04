
"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, AuthContextType } from '../types/auth';
import { EditorDraftProvider } from './editor-draft-provider';
import { AiMessageDraftProvider } from './ai-message-draft-provider';
import { clearUserScopedStorageOnSignOut, removeLegacySharedStorage, setStorageUserScope } from '@/lib/storage';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = '/api';

// F06 fix (WP05): this provider used to read/write the session token itself via js-cookie
// (`Cookies.get('token')`, jwt-decode'd client-side as a fallback) and hand raw token values
// around for impersonation. The session is now an HttpOnly cookie the server sets directly on
// login/impersonate/exit-impersonate responses -- the browser attaches it automatically to
// every same-origin request, and no client-side code ever sees or stores the raw value.
// `login()`/`refreshUser()` (same function) just asks the server who's currently authenticated.
export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    // isLoading starts true and only becomes false AFTER the profile fetch settles
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const initRef = useRef(false);
    // Per-person browser storage (round-2 plan N3). Set while rendering so children read the
    // right slot on their first render.
    setStorageUserScope(user?.tenantId, user?.id);

    const fetchMe = async (): Promise<User | null> => {
        try {
            const res = await fetch(`${API_URL}/auth/me`);
            if (res.ok) {
                return await res.json();
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

        removeLegacySharedStorage();
        const init = async () => {
            const profile = await fetchMe();
            setUser(profile);
            setIsLoading(false);
        };

        init();
    }, []);

    // Called once a server route (login, MFA verify, expired-password change, impersonate,
    // exit-impersonate) has already set the session cookie on its own response -- this just
    // re-reads "who am I now" from the server so the UI reflects the new session.
    const login = async () => {
        const profile = await fetchMe();
        setUser(profile);
    };

    // Round-2 plan P1: the tree below used to be keyed on the user's identity, so the first
    // "who am I" answer (nobody -> you) remounted the whole app and every page loaded twice.
    // It now starts a fresh tree only when the identity changes after that first answer
    // (signing in or out, starting or ending impersonation).
    const identity = JSON.stringify([user?.tenantId, user?.id, user?.isImpersonating]);
    const settledIdentity = useRef<string | null>(null);
    const [generation, setGeneration] = useState(0);
    useEffect(() => {
        if (isLoading) return;
        if (settledIdentity.current === null) {
            settledIdentity.current = identity;
            return;
        }
        if (settledIdentity.current !== identity) {
            settledIdentity.current = identity;
            setGeneration((current) => current + 1);
        }
    }, [identity, isLoading]);

    const logout = () => {
        clearUserScopedStorageOnSignOut();
        fetch(`${API_URL}/auth/logout`, { method: 'POST' }).catch(() => undefined);
        setUser(null);
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{
            user,
            login,
            logout,
            isAuthenticated: !!user,
            isLoading,
            isImpersonating: !!user?.isImpersonating,
        }}>
            <AiMessageDraftProvider key={generation}>
                <EditorDraftProvider>{children}</EditorDraftProvider>
            </AiMessageDraftProvider>
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
