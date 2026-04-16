export interface User {
    id?: string;          // from /v1/auth/me response
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
    token: string | null;
    login: (token: string) => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
    isImpersonating: boolean;
    impersonate: (userId: string) => Promise<void>;
    exitImpersonate: () => Promise<void>;
}
