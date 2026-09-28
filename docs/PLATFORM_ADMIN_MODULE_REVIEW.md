# Platform-admin tenant/module review

2026-09-28. Reviewed the CRM application, not the separate public website. The latest pushed local commit at the start of this follow-up was `ba453da`; the fixes described here were made **after** that push and need another commit/push/deployment.

## What was wrong and what changed

1. **Create Tenant exposed only Opportunities.** It now fetches the same `PlatformModule` catalog used for existing tenants and offers all **28 catalog entries**. Seven core modules remain enabled and cannot be switched off. A searchable, expandable selector limits clutter. API Access and Sales Groups have separate switches, covering the two feature flags without an equivalent individual catalog entry.
2. **Provisioning did not save module entitlements.** It now saves explicit choices for every catalog entry and initial module audit records, together with the tenant, admin account, feature flags and default objects, in one database transaction. Failure rolls everything back. No migration or new environment variable is required for this follow-up; the catalog tables already come from migration `0037`.
3. **Missing/stale catalog choices could be misleading.** Catalog-load failure prevents submission, unknown keys and disabled core selections are rejected, and failed saves retain selections. Duplicate tenant/admin details return a conflict instead of an unexplained server error.
4. **Older feature switches could bypass overlapping module restrictions.** For Opportunities, Automations, Forms, Reports, Payouts and Gamification, the shared server feature gate now requires both the feature flag and module entitlement to permit access. The authenticated user's effective feature flags and feature-gate components respect explicit disabled/suspended modules. Existing tenant pages identify overlapping feature flags that are still off.
5. **Canceling a module-status reason prompt still saved the change.** Cancel now stops the update.
6. **Creation dialog overflowed with enlarged text on small screens.** Reduced nested padding, wrapped actions/switches and block labels keep it within the viewport. The module catalog is expandable rather than forcing 28 controls into the initial view.

Existing tenant entitlements are not rewritten or bulk-enabled by these changes. The plan label does not automatically apply a pricing/module bundle.

## How to inspect an existing tenant

1. Sign in as a **Platform Admin** and open `/platform-admin/tenants`.
2. Click the tenant's name.
3. Open **Modules**. On narrow screens, select it in **Tenant section**.
4. Inspect each module's status. `ENABLED` and `TRIAL` permit module access where the module gate is implemented. `DISABLED` and `SUSPENDED` block gated access. Core modules remain enabled.
5. Open **Feature flags**. Check all eight flags, especially **API Access**, which defaults off. Where a feature overlaps a catalog module, both controls must allow it.
6. Review the user's **Roles & Permissions** in that tenant. A tenant entitlement does not replace user permissions.
7. Verify the resulting navigation and API behavior as a **real tenant user** after refreshing/signing in. Platform admins intentionally bypass many feature checks and are not a reliable negative-access test account.

Changes to an existing tenant save immediately. Disabling a module does not erase its records. Enabling a module does not configure providers, create an API key, or complete unfinished roadmap features.

## Catalog availability is not full feature completion

The catalog contains 28 entries, but the gap checklist still records unfinished work. Do not interpret 28 visible switches as 28 fully finished, universally enforced modules.

| Catalog entry | Current limitation found in this review |
| --- | --- |
| Telephony | Call Center exists, but this catalog switch is not a complete restriction across its related surfaces. |
| Data Platform | Integrations and exports still rely on their separate feature/role controls; this one switch does not fully restrict them. |
| Counseling | Full counseling workspace/workflows remain roadmap work. |
| Quality Management | Full QA/coaching workspace remains roadmap work. |
| DevOps & Ops | Full operations workspace remains roadmap work. |
| Product Catalog | Catalog and Applications are available, but the full Module 12 checklist is still only 6/20 complete. |

The known limitations are stated beside the relevant create/edit controls where applicable. This review is not a certification that every endpoint/worker path in every catalog module has complete entitlement enforcement. Telephony/Data Platform enforcement deserves a separate follow-up before using those switches as licensing or access-isolation boundaries.

## Validation

- Full automated suite: **1,959 tests passed** across 156 files.
- Local database provisioning: **15 checks passed**; 28 module choices, seven protected core modules, matching feature flags, audit attribution and rollback. Test tenants/users were removed.
- Browser tests cover catalog load failure, all catalog choices, core locks, search, retained failed saves, payload/retry and mobile/desktop layout with 200% text. Existing-tenant checks cover Modules, all eight feature flags and canceling status changes.
- TypeScript and full ESLint were checked; the existing MFA QR-image performance warning is separate from these changes.
- See `ui-audit-2026-09/platform-tenant-modules/results.json` for the final browser result and `scripts/tenant-provisioning-smoke.ts` for the database test.

Production deployment still requires building the actual Docker images, applying pending migrations if the VPS remains at `0023`, and checking the deployed workspace. Use [the existing-VPS upgrade guide](VPS_UPGRADE_2026_09.md), not the old wipe/reinstall runbook.
