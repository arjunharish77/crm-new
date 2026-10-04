import { assertTenantModule } from "@/lib/server/module-entitlements";
import { query } from "@/lib/db/query";
import { requireTenantId } from "@/lib/server/tenant-guard";

type TenantUser = {
  id: string;
  tenantId: string | null;
};

// Same normalization precedent as inbuilt-reports.ts's duplicate-lead-detection report
// (strip everything but digits) -- extended here to compare the last 10 digits rather than
// requiring an exact string match, so a caller ID with a country-code prefix (e.g. "+91
// 9999999999") still matches a Lead stored as "09999999999" or "9999999999". This is the
// closest honest approximation of "mobile/alternate number" matching this codebase supports
// today -- there is no separate mobile/alternate-number column on Lead (confirmed by audit),
// only a single "phone" field, so "alternate numbers" means format-tolerant matching against
// that one field, not matching across several distinct stored numbers.
function normalizedLast10(value: unknown) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return digits.length >= 7 ? digits.slice(-10) : null;
}

export type InboundCallerContext = {
  phoneNumber: string;
  leadMatches: any[];
  opportunityMatches: any[];
  partnerMatches: any[];
  recentActivities: any[];
  recentCalls: any[];
};

// Built for the in-app inbound-call popup, deliberately NOT a replacement for the existing
// getAgentPopupContextForTenant (crm.ts) / GET /api/integrations/telephony/agent-popup --
// that route is a real, already-shipped contract an external provider's own popup UI may
// already poll (exact single-lead match, `{lead, opportunities, recentCalls}` shape); changing
// its matching logic or response shape risks breaking an integration this app doesn't control.
// This is a new, richer, additive lookup instead.
export async function getInboundCallerContextForTenant(user: TenantUser, phoneNumber: string): Promise<InboundCallerContext> {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const normalized = normalizedLast10(phoneNumber);

  if (!normalized) {
    return { phoneNumber, leadMatches: [], opportunityMatches: [], partnerMatches: [], recentActivities: [], recentCalls: [] };
  }

  // "Duplicate match resolution": returns every matching Lead (not just the first), so the
  // popup can show all candidates and let the agent pick the right one, rather than silently
  // guessing.
  const leadMatches = await query<any>(
    `select id, name, email, phone, company, status, source, "ownerId"
     from "Lead"
     where "tenantId" = $1 and "deletedAt" is null
       and right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $2
     order by "updatedAt" desc
     limit 5`,
    [tenantId, normalized],
  );

  const leadIds = leadMatches.map((lead) => lead.id);
  const opportunityMatches = leadIds.length
    ? await query<any>(
        `select op.id, op.title, op.amount, op."leadId", op."ownerId", sd.name as "stageName", coalesce(sd."isClosed", false) as "isClosed"
         from "Opportunity" op
         left join "StageDefinition" sd on sd.id = op."stageId"
         where op."tenantId" = $1 and op."deletedAt" is null and op."leadId" = any($2::text[])
         order by op."updatedAt" desc
         limit 10`,
        [tenantId, leadIds],
      )
    : [];

  // "Partner context": Opportunity/Lead have no phone-bearing Partner link, so this matches
  // through User.phone (PartnerProfile.userId -> User) -- the only real path from a phone
  // number to a partner in this data model (confirmed by audit).
  const partnerMatches = await query<any>(
    `select pp.id, pp."legalBusinessName", pp.status, u.id as "userId", u.name as "userName", u.phone
     from "PartnerProfile" pp
     join "User" u on u.id = pp."userId"
     where pp."tenantId" = $1 and right(regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g'), 10) = $2
     limit 3`,
    [tenantId, normalized],
  );

  const opportunityIds = opportunityMatches.map((opportunity) => opportunity.id);
  const recentActivities = leadIds.length || opportunityIds.length
    ? await query<any>(
        `select id, "leadId", "opportunityId", outcome, notes, "createdAt"
         from "Activity"
         where "tenantId" = $1 and "deletedAt" is null
           and ("leadId" = any($2::text[]) or "opportunityId" = any($3::text[]))
         order by "createdAt" desc
         limit 10`,
        [tenantId, leadIds, opportunityIds],
      )
    : [];

  const recentCalls = await query<any>(
    `select id, direction, status, duration, "leadId", "opportunityId", "startedAt"
     from "TelephonyCallLog"
     where "tenantId" = $1
       and (
         right(regexp_replace(coalesce("fromNumber", ''), '\\D', '', 'g'), 10) = $2
         or right(regexp_replace(coalesce("toNumber", ''), '\\D', '', 'g'), 10) = $2
       )
     order by "startedAt" desc
     limit 10`,
    [tenantId, normalized],
  );

  return { phoneNumber, leadMatches, opportunityMatches, partnerMatches, recentActivities, recentCalls };
}
