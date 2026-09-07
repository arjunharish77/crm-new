export interface OpportunityType {
    id: string;
    name: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
    defaultStageId?: string | null;
    order: number;
    isActive: boolean;
    // Priority Module 12's "product catalog" item 3 -- links this opportunity type (e.g.
    // "University 1") to a specific catalog Program, so course/fee-plan/document-checklist UI
    // (separate, later items) can resolve the right catalog data through this one field.
    programId?: string | null;
    createdAt: string;
    updatedAt: string;

    // Relations
    defaultStage?: {
        id: string;
        name: string;
    };
    _count?: {
        opportunities: number;
        customFields: number;
    };
}

export interface CreateOpportunityTypeDto {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    defaultStageId?: string;
    stageConfig?: any;
    order?: number;
    programId?: string | null;
}

export interface UpdateOpportunityTypeDto extends Partial<CreateOpportunityTypeDto> {
    isActive?: boolean;
}
