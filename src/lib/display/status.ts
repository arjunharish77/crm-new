// One place that turns stored enum values into what people read (UI/UX plan §11.6 N, rule R8:
// no raw enums as labels) and the status tone each one uses (§3.2). Unknown values (custom
// statuses, new enum members) still get a readable label and a neutral tone.

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";
export type StatusDisplay = { label: string; tone: StatusTone };
export type StatusKind =
  | "leadStatus"
  | "priority"
  | "taskStatus"
  | "sla"
  | "delivery"
  | "health"
  | "scoreBand"
  | "lifecycle"
  | "outcome";

type Map = Record<string, StatusDisplay>;

const LEAD_STATUS: Map = {
  NEW: { label: "New", tone: "info" },
  CONTACTED: { label: "Contacted", tone: "info" },
  QUALIFIED: { label: "Qualified", tone: "accent" },
  CONVERTED: { label: "Converted", tone: "success" },
  LOST: { label: "Lost", tone: "danger" },
};

const PRIORITY: Map = {
  LOW: { label: "Low", tone: "neutral" },
  MEDIUM: { label: "Medium", tone: "warning" },
  HIGH: { label: "High", tone: "danger" },
  URGENT: { label: "Urgent", tone: "danger" },
  CRITICAL: { label: "Critical", tone: "danger" },
};

const TASK_STATUS: Map = {
  TODO: { label: "To do", tone: "neutral" },
  OPEN: { label: "Open", tone: "neutral" },
  PENDING: { label: "Pending", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  BLOCKED: { label: "Blocked", tone: "warning" },
  WAITING: { label: "Waiting", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  DONE: { label: "Done", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  OVERDUE: { label: "Overdue", tone: "danger" },
};

const SLA: Map = {
  PENDING: { label: "Pending", tone: "neutral" },
  ON_TRACK: { label: "On track", tone: "info" },
  AT_RISK: { label: "At risk", tone: "warning" },
  MET: { label: "Met", tone: "success" },
  BREACHED: { label: "Breached", tone: "danger" },
  PAUSED: { label: "Paused", tone: "neutral" },
};

const DELIVERY: Map = {
  PENDING: { label: "Pending", tone: "neutral" },
  QUEUED: { label: "Queued", tone: "info" },
  SENDING: { label: "Sending", tone: "info" },
  SENT: { label: "Sent", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "success" },
  OPENED: { label: "Opened", tone: "success" },
  CLICKED: { label: "Clicked", tone: "success" },
  READ: { label: "Read", tone: "success" },
  REPLIED: { label: "Replied", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  BOUNCED: { label: "Bounced", tone: "danger" },
  REJECTED: { label: "Rejected", tone: "danger" },
  SUPPRESSED: { label: "Suppressed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const HEALTH: Map = {
  HEALTHY: { label: "Healthy", tone: "success" },
  OK: { label: "Healthy", tone: "success" },
  DEGRADED: { label: "Degraded", tone: "warning" },
  WARNING: { label: "Needs attention", tone: "warning" },
  UNHEALTHY: { label: "Unhealthy", tone: "danger" },
  DOWN: { label: "Down", tone: "danger" },
  CRITICAL: { label: "Critical", tone: "danger" },
  UNKNOWN: { label: "Unknown", tone: "neutral" },
};

const SCORE_BAND: Map = {
  HOT: { label: "Hot", tone: "success" },
  WARM: { label: "Warm", tone: "warning" },
  COLD: { label: "Cold", tone: "info" },
  RISK: { label: "At risk", tone: "danger" },
};

// Records, campaigns, journeys, modules, integrations and other things with a lifecycle.
const LIFECYCLE: Map = {
  ACTIVE: { label: "Active", tone: "success" },
  ENABLED: { label: "Enabled", tone: "success" },
  LIVE: { label: "Live", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
  DISABLED: { label: "Disabled", tone: "neutral" },
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_APPROVAL: { label: "Pending approval", tone: "warning" },
  PENDING: { label: "Pending", tone: "neutral" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  RUNNING: { label: "Running", tone: "info" },
  PROCESSING: { label: "Processing", tone: "info" },
  PAUSED: { label: "Paused", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
  TRIAL: { label: "Trial", tone: "warning" },
  WON: { label: "Won", tone: "success" },
  OPEN: { label: "Open", tone: "info" },
  CLOSED: { label: "Closed", tone: "neutral" },
  RESOLVED: { label: "Resolved", tone: "success" },
};

const OUTCOME: Map = {
  SUCCESS: { label: "Successful", tone: "success" },
  FOLLOW_UP_NEEDED: { label: "Follow-up needed", tone: "warning" },
  NO_ANSWER: { label: "No answer", tone: "neutral" },
  VOICEMAIL: { label: "Voicemail", tone: "neutral" },
  NOT_INTERESTED: { label: "Not interested", tone: "danger" },
  BUSY: { label: "Busy", tone: "neutral" },
  WRONG_NUMBER: { label: "Wrong number", tone: "danger" },
};

const MAPS: Record<StatusKind, Map> = {
  leadStatus: LEAD_STATUS,
  priority: PRIORITY,
  taskStatus: TASK_STATUS,
  sla: SLA,
  delivery: DELIVERY,
  health: HEALTH,
  scoreBand: SCORE_BAND,
  lifecycle: LIFECYCLE,
  outcome: OUTCOME,
};

// Kept upper case when they appear as a word in an enum value.
const ACRONYMS = new Set(["SLA", "SMS", "API", "ID", "URL", "NBA", "ROI", "CSV", "PDF", "CRM", "OTP", "KYC", "MFA", "SSO", "IVR", "UTM", "GST", "PAN", "UPI", "AI", "ETA", "OK"]);

// "FOLLOW_UP_NEEDED" -> "Follow up needed", "sms_delivery" -> "SMS delivery", "not-attempted" ->
// "Not attempted". Values that are already readable ("Website", "Google Ads") are returned as is.
export function humanizeEnum(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (!/^[A-Za-z0-9]+(?:[_\-\s][A-Za-z0-9]+)*$/.test(text) || (/[a-z]/.test(text) && /[A-Z]/.test(text) && !/[_-]/.test(text))) return text;
  const words = text.split(/[_\-\s]+/).filter(Boolean);
  return words
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      const lower = word.toLowerCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

export function statusDisplay(kind: StatusKind, value: unknown): StatusDisplay {
  const key = String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return MAPS[kind][key] ?? { label: humanizeEnum(value) || "—", tone: "neutral" };
}

export function statusLabel(kind: StatusKind, value: unknown): string {
  return statusDisplay(kind, value).label;
}
