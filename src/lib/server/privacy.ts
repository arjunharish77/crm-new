import * as pgPrivacy from "@/lib/repositories/privacy-postgres";

type TenantUser = { id: string; tenantId: string | null; isPlatformAdmin?: boolean };

export async function listPrivacyRequestsForTenant(user: TenantUser) {
  return pgPrivacy.listPrivacyRequestsForTenant(user);
}

export async function runPrivacyExportForLead(user: TenantUser, leadId: string) {
  return pgPrivacy.runPrivacyExportForLead(user, leadId);
}

export async function runPrivacyDeleteForLead(user: TenantUser, leadId: string) {
  return pgPrivacy.runPrivacyDeleteForLead(user, leadId);
}

export async function createPrivacyRequestForContact(user: TenantUser, input: { contactEmail?: string; type?: "EXPORT" | "DELETE" }) {
  return pgPrivacy.createPrivacyRequestForContact(user, input);
}

export async function getPrivacyRequestDownload(user: TenantUser, requestId: string) {
  return pgPrivacy.getPrivacyRequestDownload(user, requestId);
}
