import { FilterField } from "@/types/filters";
import { SmartViewModule } from "@/types/smart-views";

export const SMART_VIEW_MODULE_OPTIONS: Array<{ value: SmartViewModule; label: string }> = [
    { value: "LEADS", label: "Leads" },
    { value: "OPPORTUNITIES", label: "Opportunities" },
    { value: "ACTIVITIES", label: "Activities" },
    { value: "TASKS", label: "Tasks" },
    { value: "PARTNERS", label: "Partners" },
    { value: "PAYOUTS", label: "Payouts" },
    { value: "REPORTS", label: "Reports" },
];

const STATUS_OPTIONS = [
    { label: "New", value: "NEW" },
    { label: "Contacted", value: "CONTACTED" },
    { label: "Qualified", value: "QUALIFIED" },
    { label: "Converted", value: "CONVERTED" },
    { label: "Lost", value: "LOST" },
];

export type SmartViewReferenceOptions = {
    users?: Array<{ label: string; value: string }>;
    stages?: Array<{ label: string; value: string }>;
    activityTypes?: Array<{ label: string; value: string }>;
    leads?: Array<{ label: string; value: string }>;
    opportunities?: Array<{ label: string; value: string }>;
    partners?: Array<{ label: string; value: string }>;
    partnerOrganizations?: Array<{ label: string; value: string }>;
    reports?: Array<{ label: string; value: string }>;
};

export function getSmartViewFields(module: SmartViewModule, references: SmartViewReferenceOptions = {}): FilterField[] {
    if (module === "LEADS") {
        return [
            { key: "name", label: "Lead name", type: "text" },
            { key: "email", label: "Email", type: "text" },
            { key: "company", label: "Company", type: "text" },
            { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
            { key: "source", label: "Source", type: "select", options: sourceOptions() },
            { key: "score", label: "Score", type: "number" },
            { key: "predictiveScoreBand", label: "Predictive score band", type: "select", options: scoreBandOptions() },
            { key: "predictiveConversionProbability", label: "Conversion probability", type: "number" },
            { key: "predictiveConfidence", label: "Score confidence", type: "number" },
            { key: "predictiveStallRisk", label: "Stall risk", type: "number" },
            { key: "predictiveExpectedResponseLikelihood", label: "Response likelihood", type: "number" },
            { key: "predictiveDuplicateRisk", label: "Duplicate risk", type: "number" },
            { key: "predictiveStaleRisk", label: "Stale risk", type: "number" },
            { key: "ownerId", label: "Owner", type: "select", options: references.users ?? [] },
            { key: "ownerSegment", label: "Owner segment", type: "select", options: dynamicOwnerOptions() },
            { key: "teamSegment", label: "Team segment", type: "select", options: dynamicTeamOptions() },
            { key: "activitySegment", label: "Activity touch state", type: "select", options: touchStateOptions() },
            { key: "createdAt", label: "Created date", type: "date" },
        ];
    }

    if (module === "OPPORTUNITIES") {
        return [
            { key: "title", label: "Opportunity", type: "text" },
            { key: "amount", label: "Amount", type: "number" },
            { key: "stageId", label: "Stage", type: "select", options: references.stages ?? [] },
            { key: "predictiveScoreBand", label: "Predictive score band", type: "select", options: scoreBandOptions() },
            { key: "predictiveWinProbability", label: "Win probability", type: "number" },
            { key: "predictiveConfidence", label: "Score confidence", type: "number" },
            { key: "predictiveStallRisk", label: "Stall risk", type: "number" },
            { key: "predictiveExpectedCloseRisk", label: "Expected close risk", type: "number" },
            { key: "priority", label: "Priority", type: "select", options: priorityOptions() },
            { key: "ownerId", label: "Owner", type: "select", options: references.users ?? [] },
            { key: "ownerSegment", label: "Owner segment", type: "select", options: dynamicOwnerOptions() },
            { key: "teamSegment", label: "Team segment", type: "select", options: dynamicTeamOptions() },
            { key: "expectedCloseDate", label: "Expected close", type: "date" },
            { key: "createdAt", label: "Created date", type: "date" },
        ];
    }

    if (module === "ACTIVITIES") {
        return [
            { key: "typeId", label: "Activity type", type: "select", options: references.activityTypes ?? [] },
            { key: "outcome", label: "Outcome", type: "select", options: activityOutcomeOptions() },
            { key: "notes", label: "Notes", type: "text" },
            { key: "dueAt", label: "Due date", type: "date" },
            { key: "slaStatus", label: "SLA status", type: "select", options: slaStatusOptions() },
            { key: "createdBy", label: "Created by", type: "select", options: references.users ?? [] },
            { key: "ownerSegment", label: "Owner segment", type: "select", options: dynamicOwnerOptions() },
            { key: "teamSegment", label: "Team segment", type: "select", options: dynamicTeamOptions() },
        ];
    }

    if (module === "TASKS") {
        return [
            { key: "due", label: "Due segment", type: "select", options: dueOptions() },
            { key: "title", label: "Task title", type: "text" },
            { key: "status", label: "Status", type: "select", options: taskStatusOptions() },
            { key: "priority", label: "Priority", type: "select", options: priorityOptions() },
            { key: "ownerId", label: "Owner", type: "select", options: references.users ?? [] },
            { key: "ownerSegment", label: "Owner segment", type: "select", options: dynamicOwnerOptions() },
            { key: "teamSegment", label: "Team segment", type: "select", options: dynamicTeamOptions() },
            { key: "leadId", label: "Lead", type: "select", options: references.leads ?? [] },
            { key: "opportunityId", label: "Opportunity", type: "select", options: references.opportunities ?? [] },
            { key: "dueAt", label: "Due date", type: "date" },
        ];
    }

    if (module === "PARTNERS") {
        return [
            { key: "status", label: "Status", type: "select", options: [{ label: "Active", value: "ACTIVE" }, { label: "Suspended", value: "SUSPENDED" }] },
            { key: "partnerLoginRole", label: "Partner login role", type: "select", options: partnerLoginRoleOptions() },
            { key: "canAccessPayouts", label: "Can access payouts", type: "boolean" },
            { key: "ownerSegment", label: "Owner segment", type: "select", options: dynamicOwnerOptions() },
            { key: "teamSegment", label: "Team segment", type: "select", options: dynamicTeamOptions() },
            { key: "partnerOrganizationId", label: "Partner organization", type: "select", options: references.partnerOrganizations ?? [] },
            { key: "createdAt", label: "Created date", type: "date" },
        ];
    }

    if (module === "PAYOUTS") {
        return [
            { key: "status", label: "Status", type: "select", options: payoutStatusOptions() },
            { key: "isHeld", label: "Held", type: "boolean" },
            { key: "partnerId", label: "Partner", type: "select", options: references.partners ?? [] },
            { key: "partnerOrganizationId", label: "Partner organization", type: "select", options: references.partnerOrganizations ?? [] },
            { key: "ownerSegment", label: "Owner segment", type: "select", options: dynamicOwnerOptions() },
            { key: "teamSegment", label: "Team segment", type: "select", options: dynamicTeamOptions() },
            { key: "amount", label: "Amount", type: "number" },
            { key: "createdAt", label: "Created date", type: "date" },
        ];
    }

    return [
        { key: "name", label: "Report name", type: "text" },
        { key: "reportKey", label: "Report", type: "select", options: references.reports ?? [] },
        { key: "module", label: "Report module", type: "select", options: SMART_VIEW_MODULE_OPTIONS.map((option) => ({ label: option.label, value: option.value })) },
        { key: "createdBy", label: "Created by", type: "select", options: references.users ?? [] },
        { key: "createdAt", label: "Created date", type: "date" },
    ];
}

function scoreBandOptions() {
    return [
        { label: "Hot", value: "HOT" },
        { label: "Warm", value: "WARM" },
        { label: "Cold", value: "COLD" },
        { label: "Risk", value: "RISK" },
    ];
}

function dynamicOwnerOptions() {
    return [
        { label: "Current user", value: "CURRENT_USER" },
        { label: "Other users", value: "OTHER" },
    ];
}

function dynamicTeamOptions() {
    return [
        { label: "Current team", value: "CURRENT_TEAM" },
        { label: "Other teams", value: "OTHER" },
    ];
}

function touchStateOptions() {
    return [
        { label: "Touched", value: "TOUCHED" },
        { label: "Untouched", value: "UNTOUCHED" },
    ];
}

export function getSmartViewQuickActions(module: SmartViewModule): Array<{ value: string; label: string }> {
    if (module === "LEADS") {
        return [
            { value: "create_task", label: "Create task" },
            { value: "log_activity", label: "Log activity" },
            { value: "assign_owner", label: "Assign owner" },
            { value: "add_to_list", label: "Add to list" },
        ];
    }

    if (module === "OPPORTUNITIES") {
        return [
            { value: "create_task", label: "Create task" },
            { value: "change_stage", label: "Change stage" },
            { value: "assign_owner", label: "Assign owner" },
        ];
    }

    if (module === "ACTIVITIES") {
        return [
            { value: "create_follow_up", label: "Create follow-up" },
            { value: "mark_done", label: "Mark done" },
            { value: "link_record", label: "Link record" },
        ];
    }

    if (module === "TASKS") {
        return [
            { value: "complete_task", label: "Complete task" },
            { value: "reassign_task", label: "Reassign task" },
            { value: "reschedule_task", label: "Reschedule task" },
        ];
    }

    if (module === "PARTNERS") {
        return [
            { value: "add_login", label: "Add login" },
            { value: "toggle_payout_access", label: "Toggle payout access" },
            { value: "suspend_partner", label: "Suspend partner" },
        ];
    }

    if (module === "PAYOUTS") {
        return [
            { value: "approve_payout", label: "Approve payout" },
            { value: "hold_payout", label: "Hold payout" },
            { value: "mark_paid", label: "Mark paid" },
            { value: "generate_invoice", label: "Generate invoice" },
        ];
    }

    return [
        { value: "preview_report", label: "Preview report" },
        { value: "export_report", label: "Export report" },
        { value: "schedule_report", label: "Schedule report" },
    ];
}

export function fieldLabel(fields: FilterField[], fieldKey?: string | null) {
    if (!fieldKey) return "None";
    return fields.find((field) => field.key === fieldKey)?.label ?? fieldKey;
}

function priorityOptions() {
    return [
        { label: "Low", value: "LOW" },
        { label: "Medium", value: "MEDIUM" },
        { label: "High", value: "HIGH" },
        { label: "Urgent", value: "URGENT" },
    ];
}

function sourceOptions() {
    return [
        { label: "Website", value: "WEBSITE" },
        { label: "Form", value: "FORM" },
        { label: "Partner", value: "PARTNER" },
        { label: "Referral", value: "REFERRAL" },
        { label: "Import", value: "IMPORT" },
        { label: "Manual", value: "MANUAL" },
        { label: "Campaign", value: "CAMPAIGN" },
        { label: "Social", value: "SOCIAL" },
        { label: "Event", value: "EVENT" },
    ];
}

function slaStatusOptions() {
    return [
        { label: "Pending", value: "PENDING" },
        { label: "Met", value: "MET" },
        { label: "Breached", value: "BREACHED" },
    ];
}

function activityOutcomeOptions() {
    return [
        { label: "Success", value: "SUCCESS" },
        { label: "Follow-up Needed", value: "FOLLOW_UP_NEEDED" },
        { label: "No Answer", value: "NO_ANSWER" },
        { label: "Not Interested", value: "NOT_INTERESTED" },
    ];
}

function taskStatusOptions() {
    return [
        { label: "Open", value: "OPEN" },
        { label: "In Progress", value: "IN_PROGRESS" },
        { label: "Completed", value: "COMPLETED" },
        { label: "Cancelled", value: "CANCELLED" },
    ];
}

function dueOptions() {
    return [
        { label: "Today", value: "today" },
        { label: "Overdue", value: "overdue" },
        { label: "Upcoming", value: "upcoming" },
        { label: "Completed", value: "completed" },
    ];
}

function partnerLoginRoleOptions() {
    return [
        { label: "Primary", value: "PRIMARY" },
        { label: "Manager", value: "MANAGER" },
        { label: "Member", value: "MEMBER" },
        { label: "Finance", value: "FINANCE" },
    ];
}

function payoutStatusOptions() {
    return [
        { label: "Draft", value: "DRAFT" },
        { label: "Pending Approval", value: "PENDING_APPROVAL" },
        { label: "Approved", value: "APPROVED" },
        { label: "Paid", value: "PAID" },
        { label: "Rejected", value: "REJECTED" },
    ];
}
