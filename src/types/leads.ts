export interface Lead {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    source?: string | null;
    status: string;
    score?: number | null;
    notes?: string | null;
    tags?: string[];
    customFields?: Record<string, string | number | boolean | null>;
    createdBy?: string | null;
    createdAt: string;
    updatedAt: string;
    assignedUserId?: string | null;
}
