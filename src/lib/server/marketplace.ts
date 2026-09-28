import * as pgMarketplace from "@/lib/repositories/marketplace-postgres";

type TenantUser = { id: string; tenantId: string | null; isPlatformAdmin?: boolean };

type RegisterAppInput = {
  name?: string;
  description?: string | null;
  category?: string;
  redirectUrls?: string[];
  webhookUrl?: string | null;
  eventSubscriptions?: string[];
  requestedPermissions?: unknown;
  requiredContractVersion?: string | null;
  dependsOnAppIds?: string[];
};

type UpdateAppInput = {
  description?: string | null;
  redirectUrls?: string[];
  webhookUrl?: string | null;
  eventSubscriptions?: string[];
  requestedPermissions?: unknown;
  changeNotes?: string | null;
  requiredContractVersion?: string | null;
  dependsOnAppIds?: string[];
};

export async function listMarketplaceAppsForTenant(user: TenantUser) {
  return pgMarketplace.listMarketplaceAppsForTenant(user);
}

export async function registerMarketplaceApp(user: TenantUser, input: RegisterAppInput) {
  return pgMarketplace.registerMarketplaceApp(user, input);
}

export async function updateMarketplaceApp(user: TenantUser, appId: string, input: UpdateAppInput) {
  return pgMarketplace.updateMarketplaceApp(user, appId, input);
}

export async function updateAppDeliveryLimit(user: TenantUser, appId: string, dailyDeliveryLimit: number | null) {
  return pgMarketplace.updateAppDeliveryLimit(user, appId, dailyDeliveryLimit);
}

export async function updateAppRateLimit(user: TenantUser, appId: string, rateLimitPerMinute: number) {
  return pgMarketplace.updateAppRateLimit(user, appId, rateLimitPerMinute);
}

export async function getConnectorContractForApp(user: TenantUser, appId: string) {
  return pgMarketplace.getConnectorContractForApp(user, appId);
}

export async function checkAppCompatibilityForTenant(user: TenantUser, appId: string) {
  return pgMarketplace.checkAppCompatibilityForTenant(user, appId);
}

export async function approvePermissionChange(user: TenantUser, installId: string) {
  return pgMarketplace.approvePermissionChange(user, installId);
}

export async function rejectPermissionChange(user: TenantUser, installId: string) {
  return pgMarketplace.rejectPermissionChange(user, installId);
}

export async function listPendingPermissionChangesForTenant(user: TenantUser) {
  return pgMarketplace.listPendingPermissionChangesForTenant(user);
}

export async function listMarketplaceAppsForPlatformAdmin() {
  return pgMarketplace.listMarketplaceAppsForPlatformAdmin();
}

export async function suspendAppAsPlatformAdmin(platformAdminUser: { id: string }, appId: string, reason: string | null) {
  return pgMarketplace.suspendAppAsPlatformAdmin(platformAdminUser, appId, reason);
}

export async function rotateAppSecretAsPlatformAdmin(platformAdminUser: { id: string }, appId: string, tenantId: string) {
  return pgMarketplace.rotateAppSecretAsPlatformAdmin(platformAdminUser, appId, tenantId);
}

export async function rollbackAppToVersion(user: TenantUser, appId: string, targetVersion: number) {
  return pgMarketplace.rollbackAppToVersion(user, appId, targetVersion);
}

export async function setAppDeprecation(user: TenantUser, appId: string, isDeprecated: boolean, message?: string | null) {
  return pgMarketplace.setAppDeprecation(user, appId, isDeprecated, message);
}

export async function listAppVersionsForTenant(user: TenantUser, appId: string) {
  return pgMarketplace.listAppVersionsForTenant(user, appId);
}

export async function listAppInstallsForTenant(user: TenantUser, status?: string) {
  return pgMarketplace.listAppInstallsForTenant(user, status);
}

export async function reviewAppInstall(user: TenantUser, installId: string, comment?: string | null) {
  return pgMarketplace.reviewAppInstall(user, installId, comment);
}

export async function approveAppInstall(user: TenantUser, installId: string) {
  return pgMarketplace.approveAppInstall(user, installId);
}

export async function approvePlatformWritePermissions(platformAdminUser: { id: string }, tenantId: string, installId: string) {
  return pgMarketplace.approvePlatformWritePermissions(platformAdminUser, tenantId, installId);
}

export async function rejectPlatformWritePermissions(platformAdminUser: { id: string }, tenantId: string, installId: string) {
  return pgMarketplace.rejectPlatformWritePermissions(platformAdminUser, tenantId, installId);
}

export async function listPendingPlatformPermissionChangesForPlatformAdmin() {
  return pgMarketplace.listPendingPlatformPermissionChangesForPlatformAdmin();
}

export async function rejectAppInstall(user: TenantUser, installId: string, reason?: string | null) {
  return pgMarketplace.rejectAppInstall(user, installId, reason);
}

export async function suspendAppInstall(user: TenantUser, installId: string, reason?: string | null) {
  return pgMarketplace.suspendAppInstall(user, installId, reason);
}

export async function reinstateAppInstall(user: TenantUser, installId: string) {
  return pgMarketplace.reinstateAppInstall(user, installId);
}

export async function uninstallApp(user: TenantUser, installId: string) {
  return pgMarketplace.uninstallApp(user, installId);
}

export async function listPermissionGrantsForInstall(user: TenantUser, installId: string) {
  return pgMarketplace.listPermissionGrantsForInstall(user, installId);
}

export async function getAppRecordScopeForInstall(user: TenantUser, installId: string) {
  return pgMarketplace.getAppRecordScopeForInstall(user, installId);
}

export async function updateAppRecordScopeForInstall(
  user: TenantUser,
  installId: string,
  input: { recordAccess: "OWN" | "TEAM" | "ALL"; ownerUserId: string | null; fieldPermissions: Record<string, unknown> | null },
) {
  return pgMarketplace.updateAppRecordScopeForInstall(user, installId, input);
}

export async function rotateAppSecret(user: TenantUser, appId: string) {
  return pgMarketplace.rotateAppSecret(user, appId);
}

export async function listAppSecretsMaskedForTenant(user: TenantUser) {
  return pgMarketplace.listAppSecretsMaskedForTenant(user);
}

export async function requestPublishApp(user: TenantUser, appId: string) {
  return pgMarketplace.requestPublishApp(user, appId);
}

export async function listPublishedAppsForCatalog(user: TenantUser) {
  return pgMarketplace.listPublishedAppsForCatalog(user);
}

export async function requestInstallOfPublishedApp(user: TenantUser, appId: string) {
  return pgMarketplace.requestInstallOfPublishedApp(user, appId);
}

export async function listPendingVersionsForPlatformAdmin() {
  return pgMarketplace.listPendingVersionsForPlatformAdmin();
}

export async function approveAppVersion(platformAdminUser: { id: string }, versionId: string) {
  return pgMarketplace.approveAppVersion(platformAdminUser, versionId);
}

export async function rejectAppVersion(platformAdminUser: { id: string }, versionId: string, reason: string | null) {
  return pgMarketplace.rejectAppVersion(platformAdminUser, versionId, reason);
}

export async function unpublishApp(platformAdminUser: { id: string }, appId: string, reason: string | null) {
  return pgMarketplace.unpublishApp(platformAdminUser, appId, reason);
}

export async function setAppTrustLevel(platformAdminUser: { id: string }, appId: string, trustLevel: string) {
  return pgMarketplace.setAppTrustLevel(platformAdminUser, appId, trustLevel);
}

export async function blockAppForTenant(platformAdminUser: { id: string }, tenantId: string, appId: string, reason: string | null) {
  return pgMarketplace.blockAppForTenant(platformAdminUser, tenantId, appId, reason);
}

export async function unblockAppForTenant(platformAdminUser: { id: string }, tenantId: string, appId: string) {
  return pgMarketplace.unblockAppForTenant(platformAdminUser, tenantId, appId);
}

export async function listAppTenantBlocksForPlatformAdmin() {
  return pgMarketplace.listAppTenantBlocksForPlatformAdmin();
}

export async function listAppActionsForTenant(user: TenantUser, appId: string) {
  return pgMarketplace.listAppActionsForTenant(user, appId);
}

export async function createAppAction(user: TenantUser, appId: string, input: { key?: string; name?: string; description?: string | null; inputSchema?: unknown }) {
  return pgMarketplace.createAppAction(user, appId, input);
}

export async function updateAppAction(
  user: TenantUser,
  appId: string,
  actionId: string,
  input: { name?: string; description?: string | null; inputSchema?: unknown; isActive?: boolean },
) {
  return pgMarketplace.updateAppAction(user, appId, actionId, input);
}

export async function deleteAppAction(user: TenantUser, appId: string, actionId: string) {
  return pgMarketplace.deleteAppAction(user, appId, actionId);
}

export async function listAvailableAppActionsForInstall(user: TenantUser) {
  return pgMarketplace.listAvailableAppActionsForInstall(user);
}

export async function listAppsWithAutomationTriggerGrant(user: TenantUser) {
  return pgMarketplace.listAppsWithAutomationTriggerGrant(user);
}

export async function listAppActionRunsForTenant(user: TenantUser, appId: string, limit?: number) {
  return pgMarketplace.listAppActionRunsForTenant(user, appId, limit);
}

export async function listAppReportsForTenant(user: TenantUser, appId: string) {
  return pgMarketplace.listAppReportsForTenant(user, appId);
}

export async function createAppReport(
  user: TenantUser,
  appId: string,
  input: { key?: string; name?: string; description?: string | null; columnSchema?: unknown; cacheTtlMinutes?: number },
) {
  return pgMarketplace.createAppReport(user, appId, input);
}

export async function updateAppReport(
  user: TenantUser,
  appId: string,
  reportId: string,
  input: { name?: string; description?: string | null; columnSchema?: unknown; cacheTtlMinutes?: number; isActive?: boolean },
) {
  return pgMarketplace.updateAppReport(user, appId, reportId, input);
}

export async function deleteAppReport(user: TenantUser, appId: string, reportId: string) {
  return pgMarketplace.deleteAppReport(user, appId, reportId);
}

export async function listAvailableAppReportsForInstall(user: TenantUser) {
  return pgMarketplace.listAvailableAppReportsForInstall(user);
}

export async function getAppReportData(user: TenantUser, appId: string, reportKey: string, opts?: { forceRefresh?: boolean }) {
  return pgMarketplace.getAppReportData(user, appId, reportKey, opts);
}
