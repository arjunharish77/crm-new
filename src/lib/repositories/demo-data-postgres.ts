import { execute, queryOne } from "@/lib/db/query";
import { DatabaseError } from "@/lib/db/errors";
import { createLeadForTenant } from "@/lib/repositories/leads-postgres";
import { createOpportunityForTenant, listOpportunityTypesForTenant } from "@/lib/repositories/opportunities-postgres";

// Gap checklist Module 10's "guided onboarding and demo mode" item -- "seeded demo labels" and
// "safe demo reset utilities", scoped to Lead + Opportunity (see migration 0098's own comment
// for why). Seeding reuses the SAME create paths a real user's own action would use
// (createLeadForTenant/createOpportunityForTenant) rather than a raw duplicate insert, so seeded
// records get the exact same automations/webhooks/audit-log treatment real records do -- then
// flips `isDemoData` on the result. Reset only ever deletes by that flag, never by
// name/label pattern-matching, and never cascades beyond Lead/Opportunity themselves.
function isForeignKeyViolation(error: unknown) {
  return error instanceof DatabaseError && error.code === "23503";
}

// The platform-admin-triggered seed action needs to act AS a real user in the target tenant --
// unlike Lead.createdBy (plain text, no FK), createLeadForTenant's own audit-log write
// (AuditLog.userId) has a real foreign key to User(id), so a synthetic/fabricated id throws a FK
// violation on the very first seeded lead (caught by this repository's own smoke test against a
// real dev-tenant, not just the mocked unit tests). Attributes seeded records to the tenant's
// own oldest user (typically its first admin) instead.
async function demoSeedContext(tenantId: string) {
  const owner = await queryOne<{ id: string }>('select id from "User" where "tenantId" = $1 order by "createdAt" asc limit 1', [tenantId]);
  if (!owner) throw new Error("TENANT_HAS_NO_USERS");
  return { id: owner.id, tenantId, isPlatformAdmin: true };
}

const DEMO_LEADS: Array<{ name: string; email: string; company: string; source: string; status: string }> = [
  { name: "[DEMO] Priya Sharma", email: "priya.sharma@demo.example", company: "Acme Robotics", source: "Website", status: "NEW" },
  { name: "[DEMO] Daniel Cho", email: "daniel.cho@demo.example", company: "Brightline Media", source: "Referral", status: "CONTACTED" },
  { name: "[DEMO] Fatima Al-Sayed", email: "fatima.alsayed@demo.example", company: "Northwind Traders", source: "Webinar", status: "NEW" },
  { name: "[DEMO] Marcus Webb", email: "marcus.webb@demo.example", company: "Solace Health", source: "Cold Call", status: "QUALIFIED" },
  { name: "[DEMO] Ana Torres", email: "ana.torres@demo.example", company: "Vertex Logistics", source: "Website", status: "CONTACTED" },
  { name: "[DEMO] Liam O'Connor", email: "liam.oconnor@demo.example", company: "Palisade Finance", source: "Trade Show", status: "NEW" },
  { name: "[DEMO] Grace Kim", email: "grace.kim@demo.example", company: "Everline Retail", source: "Referral", status: "QUALIFIED" },
  { name: "[DEMO] Samuel Ade", email: "samuel.ade@demo.example", company: "Harbor Analytics", source: "Website", status: "NEW" },
];

export type DemoDataStatus = { leadCount: number; opportunityCount: number };

export async function getDemoDataStatusForTenant(tenantId: string): Promise<DemoDataStatus> {
  const [leadRow, oppRow] = await Promise.all([
    queryOne<{ count: string | number }>('select count(*)::int as count from "Lead" where "tenantId" = $1 and "isDemoData" = true', [tenantId]),
    queryOne<{ count: string | number }>('select count(*)::int as count from "Opportunity" where "tenantId" = $1 and "isDemoData" = true', [tenantId]),
  ]);
  return { leadCount: Number(leadRow?.count ?? 0), opportunityCount: Number(oppRow?.count ?? 0) };
}

export type SeedDemoDataResult = { leadsCreated: number; opportunitiesCreated: number; opportunitiesSkippedReason: string | null };

export async function seedDemoDataForTenant(tenantId: string): Promise<SeedDemoDataResult> {
  const user = await demoSeedContext(tenantId);

  const createdLeads: any[] = [];
  for (const demoLead of DEMO_LEADS) {
    const lead = await createLeadForTenant(user, demoLead);
    await execute('update "Lead" set "isDemoData" = true where id = $1', [lead.id]);
    createdLeads.push(lead);
  }

  let opportunitiesCreated = 0;
  let opportunitiesSkippedReason: string | null = null;
  try {
    const types = await listOpportunityTypesForTenant(user);
    const firstType = types[0];
    if (!firstType || !firstType.stages?.length) {
      opportunitiesSkippedReason = "No pipeline (opportunity type) is configured yet -- set one up, then seed again to also get demo opportunities.";
    } else {
      const DEMO_OPPORTUNITIES = [
        { title: "[DEMO] Acme Robotics -- Automation Rollout", amount: 42000 },
        { title: "[DEMO] Northwind Traders -- Fleet Contract", amount: 18500 },
        { title: "[DEMO] Palisade Finance -- Platform Renewal", amount: 76000 },
      ];
      for (let i = 0; i < DEMO_OPPORTUNITIES.length && i < createdLeads.length; i++) {
        await createOpportunityForTenant(user, {
          leadId: createdLeads[i].id,
          opportunityTypeId: firstType.id,
          title: DEMO_OPPORTUNITIES[i].title,
          amount: DEMO_OPPORTUNITIES[i].amount,
        }).then(async (opportunity: any) => {
          await execute('update "Opportunity" set "isDemoData" = true where id = $1', [opportunity.id]);
          opportunitiesCreated += 1;
        });
      }
    }
  } catch (error) {
    opportunitiesSkippedReason = error instanceof Error && error.message.startsWith("FEATURE_DISABLED")
      ? "Opportunities is not enabled for this workspace -- only demo leads were seeded."
      : "Could not seed demo opportunities -- only demo leads were seeded.";
  }

  return { leadsCreated: createdLeads.length, opportunitiesCreated, opportunitiesSkippedReason };
}

export type ResetDemoDataResult = { ok: true } | { ok: false; reason: string };

export async function resetDemoDataForTenant(tenantId: string): Promise<ResetDemoDataResult> {
  try {
    // Opportunities first (Opportunity.leadId -> Lead is ON DELETE RESTRICT), so a demo Lead
    // that still has a demo Opportunity attached never blocks on its own account.
    await execute('delete from "Opportunity" where "tenantId" = $1 and "isDemoData" = true', [tenantId]);
    await execute('delete from "Lead" where "tenantId" = $1 and "isDemoData" = true', [tenantId]);
    return { ok: true };
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return {
        ok: false,
        reason: "Some demo records have real activity, tasks, or notes attached and were left in place to avoid deleting that related data. Remove those first, then reset again.",
      };
    }
    throw error;
  }
}
