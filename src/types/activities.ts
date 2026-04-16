export interface ActivityType {
    id: string;
    name: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
    defaultSLA?: number | null;
    defaultOutcome?: string | null;
    isDefault?: boolean;
    isActive?: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface Activity {
    id: string;
    typeId: string;
    leadId: string | null;
    opportunityId: string | null;
    outcome: string | null;
    notes: string | null;
    dueAt: string | null;
    completedAt: string | null;
    duration: number | null;
    slaStatus: 'PENDING' | 'MET' | 'BREACHED' | null;
    slaTarget: string | null;
    isRecurring: boolean;
    recurrenceRule: string | null;
    seriesId: string | null;
    customFields: Record<string, any> | null;
    createdAt: string;
    updatedAt: string;
    tenantId: string;

    // Relations
    type?: ActivityType;
    lead?: any;
    opportunity?: any;
    user?: {
        id: string;
        name: string;
        email: string;
    };
}

