// What starts an automation, shared by the builder and the Automations list. `scope` decides
// which record fields the builder offers for conditions and actions.
export const TRIGGER_TYPES = [
    { value: "LEAD_CREATED", label: "New lead", scope: "lead" },
    { value: "LEAD_UPDATED", label: "Lead update", scope: "lead" },
    { value: "LEAD_ADDED_TO_LIST", label: "Lead added to list", scope: "lead" },
    { value: "LEAD_DATE", label: "Lead specific date", scope: "lead" },
    { value: "LEAD_DISTRIBUTION_SUCCESS", label: "Lead auto-assigned", scope: "lead" },
    { value: "LEAD_DISTRIBUTION_FAILED", label: "Lead auto-assignment failed", scope: "lead" },
    { value: "OPPORTUNITY_CREATED", label: "New opportunity", scope: "opportunity" },
    { value: "OPPORTUNITY_UPDATED", label: "Opportunity update", scope: "opportunity" },
    { value: "STAGE_CHANGED", label: "Opportunity stage changed", scope: "opportunity" },
    { value: "OPPORTUNITY_DATE", label: "Opportunity specific date", scope: "opportunity" },
    { value: "OPPORTUNITY_DISTRIBUTION_SUCCESS", label: "Opportunity auto-assigned", scope: "opportunity" },
    { value: "OPPORTUNITY_DISTRIBUTION_FAILED", label: "Opportunity auto-assignment failed", scope: "opportunity" },
    { value: "ACTIVITY_CREATED", label: "New activity on lead", scope: "activity_lead" },
    { value: "ACTIVITY_UPDATED", label: "Activity update on lead", scope: "activity_lead" },
    { value: "ACTIVITY_CREATED_ON_OPPORTUNITY", label: "New activity on opportunity", scope: "activity_opportunity" },
    { value: "ACTIVITY_UPDATED_ON_OPPORTUNITY", label: "Activity update on opportunity", scope: "activity_opportunity" },
    { value: "ACTIVITY_CREATED_ON_ACTIVITY", label: "New activity on activity", scope: "activity_activity" },
    { value: "TASK_CREATED_ON_LEAD", label: "Task created on lead", scope: "task_lead" },
    { value: "TASK_UPDATED_ON_LEAD", label: "Task updated on lead", scope: "task_lead" },
    { value: "TASK_COMPLETED_ON_LEAD", label: "Task completed on lead", scope: "task_lead" },
    { value: "TASK_REMINDER_ON_LEAD", label: "Task reminder on lead", scope: "task_lead" },
    { value: "TASK_OVERDUE_ON_LEAD", label: "Task overdue on lead", scope: "task_lead" },
    { value: "TASK_CREATED_ON_OPPORTUNITY", label: "Task created on opportunity", scope: "task_opportunity" },
    { value: "TASK_UPDATED_ON_OPPORTUNITY", label: "Task updated on opportunity", scope: "task_opportunity" },
    { value: "TASK_COMPLETED_ON_OPPORTUNITY", label: "Task completed on opportunity", scope: "task_opportunity" },
    { value: "TASK_REMINDER_ON_OPPORTUNITY", label: "Task reminder on opportunity", scope: "task_opportunity" },
    { value: "TASK_OVERDUE_ON_OPPORTUNITY", label: "Task overdue on opportunity", scope: "task_opportunity" },
    // Fired by recordTelephonyCallEvent (src/lib/server/telephony-webhook.ts) against whichever
    // Lead or Opportunity the call is linked to -- like REGULAR_INTERVAL/MANUAL above, these
    // aren't strictly Lead-scoped, so "lead" is used here as the same established catch-all
    // scope for a trigger that can't commit to one entity type ahead of time.
    { value: "CALL_MISSED", label: "Call missed", scope: "lead" },
    { value: "CALL_ANSWERED", label: "Call answered", scope: "lead" },
    { value: "CALL_COMPLETED", label: "Call completed", scope: "lead" },
    { value: "CALL_FAILED", label: "Call failed", scope: "lead" },
    { value: "RECORDING_AVAILABLE", label: "Call recording available", scope: "lead" },
    { value: "DISPOSITION_SELECTED", label: "Call disposition selected", scope: "lead" },
    { value: "COMMUNICATION_SENT", label: "Communication sent", scope: "communication" },
    { value: "COMMUNICATION_DELIVERED", label: "Communication delivered", scope: "communication" },
    { value: "COMMUNICATION_OPENED", label: "Email opened", scope: "communication" },
    { value: "COMMUNICATION_CLICKED", label: "Link clicked", scope: "communication" },
    { value: "COMMUNICATION_REPLIED", label: "Reply received", scope: "communication" },
    { value: "COMMUNICATION_BOUNCED", label: "Message bounced", scope: "communication" },
    { value: "COMMUNICATION_FAILED", label: "Message failed", scope: "communication" },
    { value: "COMMUNICATION_UNSUBSCRIBED", label: "Unsubscribed", scope: "communication" },
    { value: "REGULAR_INTERVAL", label: "At regular intervals", scope: "lead" },
    { value: "MANUAL", label: "Manual trigger", scope: "lead" },
    { value: "CASE_CREATED", label: "New case", scope: "case" },
    { value: "CASE_UPDATED", label: "Case updated", scope: "case" },
    { value: "CASE_ASSIGNED", label: "Case assigned", scope: "case" },
    { value: "CASE_STATUS_CHANGED", label: "Case status changed", scope: "case" },
    { value: "CASE_RESOLVED", label: "Case resolved", scope: "case" },
    { value: "CASE_REOPENED", label: "Case reopened", scope: "case" },
    { value: "CASE_COMMENTED", label: "Case commented", scope: "case" },
    { value: "CASE_SLA_WARNING", label: "Case SLA warning", scope: "case" },
    { value: "CASE_SLA_BREACHED", label: "Case SLA breached", scope: "case" },
    { value: "CASE_SATISFACTION_SUBMITTED", label: "Case satisfaction submitted", scope: "case" },
    { value: "CASE_MERGED", label: "Case merged", scope: "case" },
    // Gap checklist Module 16's app event bus, "triggers" half -- an installed app calling
    // POST /api/v1/apps/automation-events fires this, optionally narrowed to one specific app
    // and/or event name via the App/Event Name fields below (triggerMatches' APP_EVENT branch
    // in automations-postgres.ts); left blank, it fires for every app-originated event tenant-wide.
    { value: "APP_EVENT", label: "App event", scope: "app_event" },
];

export function triggerLabel(type: string | null | undefined) {
    if (!type) return "Manual trigger";
    return TRIGGER_TYPES.find((trigger) => trigger.value === type)?.label ?? type.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}
