
import { Node, Edge } from 'reactflow';

export interface AutomationWorkflow {
    nodes: Node[];
    edges: Edge[];
}

export interface AutomationTrigger {
    type: string;
    config?: Record<string, any>;
}

export interface AutomationV2 {
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
    trigger: AutomationTrigger;
    workflow: AutomationWorkflow;
    createdAt: string;
    updatedAt: string;
    tenantId: string;
}

export interface CreateAutomationDTO {
    name: string;
    description?: string;
    isActive: boolean;
    trigger: AutomationTrigger;
    workflow: AutomationWorkflow;
}

export interface UpdateAutomationDTO extends Partial<CreateAutomationDTO> { }
