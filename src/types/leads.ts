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
    predictiveScore?: PredictiveRecordScore | null;
}

export interface PredictiveRecordScore {
    id: string;
    recordType: 'LEAD' | 'OPPORTUNITY';
    recordId: string;
    fitScore: number | null;
    engagementScore: number | null;
    conversionProbability: number | null;
    winProbability: number | null;
    stallRisk: number | null;
    scoreBand: 'HOT' | 'WARM' | 'COLD' | 'RISK';
    confidence: number;
    reasons?: Array<{ type: 'POSITIVE' | 'NEGATIVE' | 'INFO'; label: string; value?: unknown }>;
    source: 'PREDICTIVE_SCORING' | 'SELF_LEARNING' | 'RULE_FALLBACK' | 'MANUAL_OVERRIDE';
    expectedResponseLikelihood?: number | null;
    duplicateRisk?: number | null;
    staleRisk?: number | null;
    expectedCloseRisk?: number | null;
    suggestedCloseDate?: string | null;
    suggestedCloseDateDeltaDays?: number | null;
    nextBestAction?: string | null;
    nextBestActivityType?: string | null;
    topDrivers?: Array<{ type: 'POSITIVE' | 'NEGATIVE' | 'INFO'; label: string; value?: unknown }>;
    missingDataWarnings?: string[];
    similarRecordIds?: string[];
    suggestedDataImprovements?: string[];
    overrideReason?: string | null;
    overrideUntil?: string | null;
    overrideOwnerId?: string | null;
    overriddenAt?: string | null;
    calculatedAt?: string | null;
    updatedAt?: string | null;
}
