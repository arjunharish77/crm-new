
export interface CustomFieldDefinition {
    id: string;
    objectType: string; // LEAD, OPPORTUNITY, ACTIVITY
    key: string;
    label: string;
    type: string; // TEXT, NUMBER, SELECT, BOOLEAN, DATE
    options?: any; // JSON or array of strings
    required: boolean;
    order: number;
    tenantId: string;
    isSystem?: boolean;
    createdAt: string;
    updatedAt: string;
}

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'DROPDOWN' | 'MULTI_SELECT' | 'BOOLEAN' | 'DATE' | 'DATETIME' | 'USER_REF';
