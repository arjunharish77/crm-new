export interface OpportunityType {
    id: string;
    name: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
    defaultPipelineId?: string | null;
    defaultStageId?: string | null;
    order: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;

    // Relations
    defaultPipeline?: {
        id: string;
        name: string;
    };
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
    defaultPipelineId?: string;
    defaultStageId?: string;
    stageConfig?: any;
    order?: number;
}

export interface UpdateOpportunityTypeDto extends Partial<CreateOpportunityTypeDto> {
    isActive?: boolean;
}
