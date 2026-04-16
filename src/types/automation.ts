export type TriggerType = 'ENTITY_CREATED' | 'ENTITY_UPDATED' | 'FORM_SUBMITTED' | 'STATUS_CHANGED';
export type ResourceType = 'LEAD' | 'OPPORTUNITY' | 'ACTIVITY';
export type ActionType = 'SEND_EMAIL' | 'CREATE_TASK' | 'UPDATE_FIELD' | 'CREATE_NOTIFICATION' | 'ASSIGN_OWNER' | 'SEND_WEBHOOK';

export interface AutomationAction {
    id: string;
    ruleId: string;
    type: ActionType;
    config: any;
    order: number;
}

export interface AutomationRule {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    isActive: boolean;
    triggerType: TriggerType;
    resourceType: ResourceType;
    conditions: any | null;
    actions: AutomationAction[];
    createdAt: string;
    updatedAt: string;
}
