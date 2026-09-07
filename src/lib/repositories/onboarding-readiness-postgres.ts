import { randomUUID } from "crypto";
import { queryOne } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";

type TenantUser = { id: string; tenantId: string | null };

// Gap checklist Module 10's "guided onboarding and demo mode" item -- "module readiness
// checklist" and "first-run setup tasks" collapse into one real feature: a tenant-admin-facing
// checklist of real, queryable signals (has a pipeline been configured? has the team been
// invited? etc), each linking straight to the settings page that completes it. This is
// deliberately NOT a DOM-overlay product tour (no such library in this app, and none installed
// here) -- it's a guided, dismissible list of what to do next, which is what actually made this
// checklist item's "sample walkthroughs" sub-item concrete for an admin-provisioned tenant with
// no self-serve signup flow to hook a tour into.
function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

export type OnboardingChecklistItem = {
  key: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
};

export type OnboardingReadiness = {
  items: OnboardingChecklistItem[];
  completedCount: number;
  totalCount: number;
  dismissed: boolean;
};

async function count(sql: string, tenantId: string): Promise<number> {
  const row = await queryOne<{ count: string | number }>(sql, [tenantId]);
  return Number(row?.count ?? 0);
}

export async function getOnboardingReadinessForTenant(user: TenantUser): Promise<OnboardingReadiness> {
  const tenantId = requireTenantId(user);

  const [pipelineCount, userCount, leadCount, automationCount, savedViewCount, providerCount, config] = await Promise.all([
    count('select count(*)::int as count from "OpportunityType" where "tenantId" = $1', tenantId),
    count('select count(*)::int as count from "User" where "tenantId" = $1', tenantId),
    count('select count(*)::int as count from "Lead" where "tenantId" = $1', tenantId),
    count('select count(*)::int as count from "AutomationV2" where "tenantId" = $1', tenantId),
    count(`select count(*)::int as count from "CustomReport" where "tenantId" = $1 and "chartType" = 'SAVED_VIEW'`, tenantId),
    count('select count(*)::int as count from "CommunicationProviderConfig" where "tenantId" = $1', tenantId),
    queryOne<{ featureFlags: Record<string, unknown> | null }>('select "featureFlags" from "TenantConfig" where "tenantId" = $1 limit 1', [tenantId]),
  ]);

  const onboardingFlags =
    config?.featureFlags && typeof config.featureFlags === "object" && !Array.isArray(config.featureFlags)
      ? ((config.featureFlags as Record<string, unknown>).onboarding as { dismissed?: boolean } | undefined)
      : undefined;

  const items: OnboardingChecklistItem[] = [
    {
      key: "pipeline",
      label: "Set up your first pipeline",
      description: "Configure an opportunity type and its stages so deals have somewhere to live.",
      done: pipelineCount > 0,
      href: "/dashboard/settings/opportunity-types",
    },
    {
      key: "team",
      label: "Invite your team",
      description: "Add teammates so leads and deals can be assigned and shared.",
      done: userCount > 1,
      href: "/dashboard/settings/users",
    },
    {
      key: "leads",
      label: "Add or import your leads",
      description: "Bring in your first leads to start working the pipeline.",
      done: leadCount > 0,
      href: "/dashboard/leads",
    },
    {
      key: "workflow",
      label: "Create an automation or saved view",
      description: "Automate a routine task, or save a filtered view for your team to reuse.",
      done: automationCount > 0 || savedViewCount > 0,
      href: "/dashboard/automations-v2",
    },
    {
      key: "channel",
      label: "Connect a communication channel",
      description: "Connect email, SMS, or WhatsApp so activities can be logged and sent from the CRM.",
      done: providerCount > 0,
      href: "/dashboard/settings/integrations",
    },
  ];

  return {
    items,
    completedCount: items.filter((item) => item.done).length,
    totalCount: items.length,
    dismissed: Boolean(onboardingFlags?.dismissed),
  };
}

export async function dismissOnboardingChecklistForTenant(user: TenantUser): Promise<void> {
  const tenantId = requireTenantId(user);
  const existingConfig = await queryOne<{ id: string; featureFlags: Record<string, unknown> | null }>(
    'select id, "featureFlags" from "TenantConfig" where "tenantId" = $1 limit 1',
    [tenantId],
  );
  const featureFlags =
    existingConfig?.featureFlags && typeof existingConfig.featureFlags === "object" && !Array.isArray(existingConfig.featureFlags)
      ? { ...existingConfig.featureFlags }
      : {};
  (featureFlags as Record<string, unknown>).onboarding = { dismissed: true };

  await withTransaction(user, async (tx) => {
    if (existingConfig?.id) {
      await tx.query('update "TenantConfig" set "featureFlags" = $1 where "tenantId" = $2 and id = $3', [
        featureFlags,
        tenantId,
        existingConfig.id,
      ]);
    } else {
      await tx.query('insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3)', [
        randomUUID(),
        tenantId,
        featureFlags,
      ]);
    }
  });
}
