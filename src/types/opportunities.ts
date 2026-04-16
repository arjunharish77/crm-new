import { Lead } from './leads';

/**
 * Opportunity type definitions.
 *
 * Architecture: Opportunities use OpportunityType + StageDefinition for stages.
 * There is NO pipeline model — stages are configured per-tenant via the
 * OpportunityTypes admin page (opportunity-types API).
 */
export interface Opportunity {
    id: string;
    tenantId: string;
    objectId: string;
    leadId: string;
    opportunityTypeId: string;
    stageId: string;

    title: string;
    amount: number | null;
    expectedCloseDate: string | null;
    probability?: number | null; // 0-100, inherited from stage if not set
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    tags: string[];
    ownerId: string | null;

    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;

    // Relations (populated when included)
    lead?: Lead | null;
    opportunityType?: OpportunityType;
    stage?: StageDefinition;
    owner?: { id: string; name: string; email: string } | null;
    activities?: any[];
    stageHistory?: OpportunityStageHistory[];
}

/**
 * A stage within an OpportunityType.
 * Replaces the old `Stage` type which referenced a pipeline.
 */
export interface StageDefinition {
    id: string;
    tenantId: string;
    opportunityTypeId: string;
    name: string;        // Internal key (e.g. 'negotiation')
    label: string;       // Display label (e.g. 'Negotiation')
    order: number;
    probability: number; // 0-100
    isClosed: boolean;
    isWon: boolean;
    color?: string;
}

/**
 * Opportunity type that groups stages.
 * Configurable per-tenant — e.g. "B2B Deal", "Renewal", "Partnership".
 */
export interface OpportunityType {
    id: string;
    tenantId: string;
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    order: number;
    isActive: boolean;
    stages?: StageDefinition[];
}

export interface OpportunityStageHistory {
    id: string;
    tenantId: string;
    opportunityId: string;
    fromStageId: string | null;
    toStageId: string;
    changedById: string;
    changedAt: string;
    notes?: string;
    fromStage?: { name: string; label: string };
    toStage: { name: string; label: string };
    changedBy: { name: string; email: string };
}

/** Stats grouped by stage — returned by GET /v1/opportunities/stats */
export interface OpportunityStageStats {
    stageId: string;
    stage: string;
    isWon: boolean;
    isClosed: boolean;
    probability: number;
    totalValue: number;
    count: number;
    weightedValue: number; // totalValue × (probability / 100)
}

/** Request body for creating an opportunity */
export interface CreateOpportunityRequest {
    title: string;
    leadId: string;
    opportunityTypeId: string;
    stageId?: string;      // Optional — defaults to first stage
    amount?: number;
    expectedCloseDate?: string;
    probability?: number;  // Optional — inherited from stage if omitted
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    tags?: string[];
    ownerId?: string;
}

/** Request body for updating an opportunity */
export interface UpdateOpportunityRequest {
    title?: string;
    stageId?: string;
    amount?: number;
    expectedCloseDate?: string;
    probability?: number;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    tags?: string[];
    opportunityTypeId?: string;
    ownerId?: string;
}
