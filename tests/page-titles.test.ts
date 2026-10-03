import { describe, expect, it } from "vitest";
import { titleForPath } from "@/lib/page-titles";

describe("titleForPath (UI/UX plan G2)", () => {
  it.each([
    ["/dashboard", undefined, "Dashboard · Unnatify"],
    ["/dashboard/leads", undefined, "Leads · Unnatify"],
    ["/dashboard/leads/fccdaf08-ca63-493e-9ec7-16845bacce46", "Aarav Rao", "Aarav Rao · Leads · Unnatify"],
    ["/dashboard/leads/fccdaf08-ca63-493e-9ec7-16845bacce46", undefined, "Lead · Leads · Unnatify"],
    ["/dashboard/settings/access/users", undefined, "Users · Settings · Unnatify"],
    ["/dashboard/settings/security/api-keys", undefined, "API keys · Settings · Unnatify"],
    ["/dashboard/settings/security/audit-log", undefined, "Audit log · Settings · Unnatify"],
    ["/dashboard/settings/access/teams/3f2b9c1e-1111-4222-8333-944455556666", "North team", "North team · Teams · Settings · Unnatify"],
    ["/dashboard/settings/data/fields", undefined, "Objects & fields · Settings · Unnatify"],
    ["/dashboard/account/security", undefined, "Sign-in & security · My account · Unnatify"],
    ["/dashboard/reports/standard/rep_performance", undefined, "Rep performance · Reports · Unnatify"],
    ["/dashboard/tasks/queues", undefined, "Task queues · Tasks · Unnatify"],
    ["/dashboard/automations-v2", undefined, "Automations · Unnatify"],
    ["/platform-admin", undefined, "Platform admin · Unnatify"],
    ["/platform-admin/tenants/3f2b9c1e-1111-4222-8333-944455556666", "Demo University", "Demo University · Tenants · Platform admin · Unnatify"],
  ])("%s -> %s", (path, record, expected) => {
    expect(titleForPath(path, record)).toBe(expected);
  });
});
