export interface User {
    id?: string;          // from /api/auth/me response
    sub?: string;         // from decoded JWT (id = sub)
    email: string;
    name?: string;
    tenantId: string | null; // null for Super Admin
    roleId?: string;
    role?: string | { name: string; permissions?: any };
    iat?: number;
    exp?: number;
    isPlatformAdmin?: boolean;
    platformAdminId?: string;
    isImpersonating?: boolean;
    impersonatedBy?: string;
    features?: Record<string, boolean>;
    // Convenience accessor — prefer id, fall back to sub
    [key: string]: any;
}

export interface AuthContextType {
    user: User | null;
    // F06 fix (WP05): no token parameter -- the session is an HttpOnly cookie a server route
    // has already set by the time this is called; it just re-fetches "who am I now".
    login: () => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
    isImpersonating: boolean;
}
