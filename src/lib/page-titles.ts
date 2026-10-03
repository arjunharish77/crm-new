import { humanizeEnum } from "@/lib/display/status";
import { settingsPageFor } from "@/lib/settings-pages";

// Browser tab titles (UI/UX plan G2, WCAG 2.4.2): "Aarav Rao · Leads · Unnatify". Built from the
// route; record pages add the record's name through useRecordTitle.

const APP = "Unnatify";

const SECTIONS: Record<string, string> = {
  activities: "Activities",
  applications: "Applications",
  approvals: "Approvals",
  "automations-v2": "Automations",
  "call-center": "Call center",
  cases: "Cases",
  exports: "Exports",
  forms: "Forms",
  leaderboard: "Leaderboard",
  leads: "Leads",
  lists: "Lists",
  marketing: "Marketing",
  "my-points": "My points",
  notifications: "Notifications",
  opportunities: "Opportunities",
  payouts: "Payouts",
  reports: "Reports",
  settings: "Settings",
  admin: "Settings",
  account: "My account",
  tasks: "Tasks",
  views: "Views",
};

// Singular names for a record page before its name has loaded.
const RECORD_NOUNS: Record<string, string> = {
  leads: "Lead",
  opportunities: "Opportunity",
  applications: "Application",
  cases: "Case",
  lists: "List",
  forms: "Form",
  "automations-v2": "Automation",
  partners: "Partner",
  teams: "Team",
  tenants: "Tenant",
  campaigns: "Campaign",
};

const PAGE_NAMES: Record<string, string> = {
  "api-keys": "API keys",
  "ai-assistant": "AI assistant",
  mfa: "Two-step verification",
  scim: "SCIM provisioning",
  gdpr: "Data privacy requests",
  "audit-logs": "Audit log",
  "task-sla-policies": "Task SLA policies",
  "next-best-action": "Next best action",
  "privileged-actions": "Privileged actions",
  "impersonation-review": "Impersonation review",
  "schema-status": "Schema status",
  "module-health": "Module health",
  "module-bundles": "Module bundles",
  dedupe: "Duplicate merge",
  "agent-availability": "Agent availability",
  queues: "Task queues",
  // My account
  preferences: "Preferences",
  security: "Sign-in & security",
  activity: "My activity",
};

const isId = (segment: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-|^[0-9a-z]{20,}$|^\d+$|^fx-/i.test(segment) || segment.length >= 24;

function pageName(segment: string) {
  return PAGE_NAMES[segment] ?? humanizeEnum(segment.replace(/-/g, "_"));
}

export function titleForPath(pathname: string, recordName?: string | null): string {
  const segments = pathname.split("?")[0].split("/").filter(Boolean);
  const parts: string[] = [];
  if (segments[0] === "platform-admin") {
    const rest = segments.slice(1);
    const page = rest.find((segment) => !isId(segment));
    const idIndex = rest.findIndex(isId);
    if (idIndex >= 0) parts.push(recordName || RECORD_NOUNS[rest[idIndex - 1]] || "Details");
    if (page) parts.push(pageName(page));
    parts.push("Platform admin");
  } else if (segments[0] === "dashboard") {
    const [section, ...rest] = segments.slice(1);
    // Settings pages are named by the Settings registry (the menu's names).
    const settingsPage = section === "settings" && rest.length ? settingsPageFor(`/${segments.join("/")}`) : null;
    if (!section) {
      parts.push("Dashboard");
    } else if (settingsPage) {
      const idIndex = rest.findIndex(isId);
      if (idIndex >= 0) parts.push(recordName || RECORD_NOUNS[rest[idIndex - 1]] || "Details");
      parts.push(settingsPage.title, "Settings");
    } else {
      const sectionName = SECTIONS[section] ?? pageName(section);
      const idIndex = rest.findIndex(isId);
      if (idIndex >= 0) {
        const parent = idIndex === 0 ? section : rest[idIndex - 1];
        parts.push(recordName || RECORD_NOUNS[parent] || "Details");
        const after = rest.slice(idIndex + 1).filter((segment) => !isId(segment));
        if (after.length) parts.unshift(pageName(after[after.length - 1]));
        if (idIndex > 0) parts.push(pageName(rest[idIndex - 1]));
      } else if (rest.length) {
        parts.push(pageName(rest[rest.length - 1]));
      }
      parts.push(sectionName);
    }
  } else if (recordName) {
    parts.push(recordName);
  }
  return [...parts, APP].filter((part, index, all) => part && all.indexOf(part) === index).join(" · ");
}
