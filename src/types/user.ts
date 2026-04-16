export type RecordAccess = 'OWN' | 'TEAM' | 'ALL';
export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'export' | 'manage';
export type PermissionModule = 'leads' | 'opportunities' | 'activities' | 'automations' | 'users' | 'roles' | 'settings';

export interface ModulePermissions {
    [key: string]: boolean | 'full' | {
        read?: boolean;
        create?: boolean;
        update?: boolean;
        delete?: boolean;
        export?: boolean;
        manage?: boolean;
    };
}

export interface Role {
    id: string;
    name: string;
    description?: string;
    permissions: {
        modules: ModulePermissions;
        recordAccess: RecordAccess;
    };
    createdAt: string;
    updatedAt: string;
}

export interface User {
    id: string;
    name: string;
    email: string;
    status: 'ACTIVE' | 'INACTIVE' | 'INVITED';
    role?: Role;
    team?: {
        id: string;
        name: string;
    };
    manager?: {
        id: string;
        name: string;
    };
    title?: string;
    lastLoginAt?: string;
    createdAt: string;
    skills?: Record<string, string[] | string>;
    roleId?: string;
    teamId?: string;
    managerId?: string;
}

export interface Team {
    id: string;
    name: string;
    description?: string;
    leadId?: string;
    memberCount: number;
    createdAt: string;
}

export interface PermissionTemplate {
    id: string;
    name: string;
    description?: string;
    permissions: string[];
    userCount?: number;
    createdAt: string;
}
