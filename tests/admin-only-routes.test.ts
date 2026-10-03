import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Settings writes that only admins may make (UI/UX plan Phase 3 access review). Each of these
// used to need only a signed-in user, so a rep or partner could change the workspace's teams,
// fields, scoring rules or imports, or approve their own export. Keep the list in step with the
// routes; a handler that stops calling requireTenantAdmin fails here.
const ADMIN_ONLY: Record<string, string[]> = {
  "teams": ["POST"], "teams/[id]": ["PATCH", "DELETE"], "teams/[id]/members": ["POST"], "teams/[id]/members/[userId]": ["DELETE"],
  "sales-groups": ["POST"], "sales-groups/[id]": ["PATCH", "DELETE"], "sales-groups/[id]/members": ["POST"], "sales-groups/[id]/members/[userId]": ["DELETE"],
  "activity-types": ["POST"], "activity-types/[id]": ["PATCH", "DELETE"],
  "custom-fields": ["POST"], "custom-fields/[id]": ["PATCH", "DELETE"],
  "type-custom-fields": ["POST"], "type-custom-fields/[id]": ["PATCH", "DELETE"], "type-custom-fields/reorder/[id]": ["PUT"],
  "lead-scoring/rules": ["POST"], "lead-scoring/rules/[id]": ["PATCH", "DELETE"], "lead-scoring/recompute-all": ["POST"],
  "integrations/csv/jobs": ["POST"], "integrations/csv/jobs/[id]/approve": ["POST"], "integrations/csv/jobs/[id]/reject": ["POST"], "integrations/csv/jobs/[id]/cancel": ["POST"],
  "integrations/csv/preview": ["POST"], "integrations/csv/templates": ["POST"], "integrations/csv/templates/[id]": ["DELETE"],
  "integrations/telephony/suppress": ["POST"], "integrations/telephony/suppress/[id]": ["DELETE"],
  "exports/[id]/approve": ["POST"], "exports/[id]/reject": ["POST"], "exports/sensitive-fields": ["POST"], "exports/sensitive-fields/[id]": ["DELETE"],
  "automation-v2/process-due": ["POST"],
  "opportunity-types/[id]/stages": ["GET", "POST"], "opportunity-types/[id]/stages/[stageId]": ["PATCH", "DELETE"], "opportunity-types/[id]/stages/reorder": ["PUT"],
  "reports/annotations": ["POST"], "reports/annotations/[id]": ["DELETE"],
  "opportunity-types": ["POST"], "opportunity-types/[id]": ["PATCH", "DELETE"], "opportunity-types/reorder": ["PUT"],
  "lead-scoring/self-learning/models/[versionId]/promote": ["POST"], "lead-scoring/self-learning/overrides": ["POST", "DELETE"], "lead-scoring/self-learning/recompute": ["POST"],
  "communications/outbox": ["GET"], "communications/settings": ["GET", "PUT"], "communications/templates/[id]/approval": ["POST"],
  "governance/audit-logs/[id]/review": ["PATCH"], "governance/audit-logs/[id]/comments": ["GET", "POST"], "governance/audit-logs/[id]/legal-hold": ["PATCH", "POST"],
};

function handler(source: string, method: string) {
  const match = source.match(new RegExp(`export async function ${method}\\b([\\s\\S]*?)(?=\\nexport async function|$)`));
  return match?.[1] ?? null;
}

describe("admin-only API writes", () => {
  for (const [route, methods] of Object.entries(ADMIN_ONLY)) {
    const source = readFileSync(join(process.cwd(), "src/app/api", route, "route.ts"), "utf8");
    for (const method of methods) {
      const body = handler(source, method);
      if (body === null) continue; // e.g. legal hold is PATCH or POST, whichever exists
      it(`${method} /api/${route} requires an admin`, () => {
        expect(body).toMatch(/requireTenantAdmin\(|requirePlatformAdmin\(/);
        expect(body).not.toMatch(/requireCurrentUser\(/);
      });
    }
  }

  it("every listed route exists", () => {
    for (const [route, methods] of Object.entries(ADMIN_ONLY)) {
      const source = readFileSync(join(process.cwd(), "src/app/api", route, "route.ts"), "utf8");
      expect(methods.some((method) => handler(source, method) !== null), route).toBe(true);
    }
  });
});
