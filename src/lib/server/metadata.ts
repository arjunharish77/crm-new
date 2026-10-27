import { formFieldType } from "@/lib/custom-field-types";
import { listCustomFieldDefinitions } from "@/lib/repositories/custom-field-values-postgres";

const BASE_GROUP = [{ id: "default", name: "General Information" }];

export function getObjectMetadata(objectName: string) {
  const normalized = objectName.toLowerCase();

  if (normalized === "lead") {
    return {
      name: "lead",
      groups: BASE_GROUP,
      fields: [
        { id: "lead_name", key: "name", label: "Lead Name", type: "TEXT", isRequired: true, isCustom: false },
        { id: "lead_email", key: "email", label: "Email", type: "TEXT", isRequired: false, isCustom: false },
        { id: "lead_phone", key: "phone", label: "Phone", type: "TEXT", isRequired: false, isCustom: false },
        { id: "lead_company", key: "company", label: "Company", type: "TEXT", isRequired: false, isCustom: false },
        { id: "lead_source", key: "source", label: "Source", type: "TEXT", isRequired: false, isCustom: false },
        { id: "lead_status", key: "status", label: "Status", type: "TEXT", isRequired: true, isCustom: false, defaultValue: "NEW" },
      ],
    };
  }

  if (normalized === "opportunity") {
    return {
      name: "opportunity",
      groups: BASE_GROUP,
      fields: [
        { id: "opp_title", key: "title", label: "Title", type: "TEXT", isRequired: true, isCustom: false },
        { id: "opp_lead_id", key: "leadId", label: "Lead", type: "TEXT", isRequired: true, isCustom: false },
        { id: "opp_type_id", key: "opportunityTypeId", label: "Opportunity Type", type: "TEXT", isRequired: true, isCustom: false },
        { id: "opp_stage_id", key: "stageId", label: "Stage", type: "TEXT", isRequired: true, isCustom: false },
        { id: "opp_amount", key: "amount", label: "Amount", type: "NUMBER", isRequired: false, isCustom: false },
        { id: "opp_priority", key: "priority", label: "Priority", type: "TEXT", isRequired: false, isCustom: false, defaultValue: "MEDIUM" },
        { id: "opp_close", key: "expectedCloseDate", label: "Expected Close Date", type: "DATE", isRequired: false, isCustom: false },
      ],
    };
  }

  if (normalized === "activity") {
    return {
      name: "activity",
      groups: BASE_GROUP,
      fields: [
        { id: "activity_type_id", key: "typeId", label: "Activity Type", type: "TEXT", isRequired: true, isCustom: false },
        { id: "activity_lead_id", key: "leadId", label: "Lead", type: "TEXT", isRequired: false, isCustom: false },
        { id: "activity_opportunity_id", key: "opportunityId", label: "Opportunity", type: "TEXT", isRequired: false, isCustom: false },
        { id: "activity_outcome", key: "outcome", label: "Outcome", type: "TEXT", isRequired: false, isCustom: false },
        { id: "activity_notes", key: "notes", label: "Notes", type: "TEXTAREA", isRequired: false, isCustom: false },
        { id: "activity_due_at", key: "dueAt", label: "Due At", type: "DATE", isRequired: false, isCustom: false },
      ],
    };
  }

  return null;
}

// The record form's fields for a workspace: the built-in ones plus its custom fields for leads
// and opportunities (the opportunity form adds its type's own fields when a type is picked;
// activity forms load theirs by activity type).
export async function getObjectMetadataForTenant(objectName: string, tenantId: string | null | undefined) {
  const metadata = getObjectMetadata(objectName);
  if (!metadata || !tenantId || (metadata.name !== "lead" && metadata.name !== "opportunity")) return metadata;
  const definitions = await listCustomFieldDefinitions(tenantId, metadata.name === "lead" ? "LEAD" : "OPPORTUNITY", null);
  const customFields = definitions.map((field) => ({
    id: field.id,
    key: field.key,
    label: field.label,
    type: formFieldType(field.type),
    isRequired: !!field.isRequired,
    isCustom: true,
    options: Array.isArray(field.options) ? field.options : [],
  }));
  return { ...metadata, fields: [...metadata.fields, ...customFields] };
}
