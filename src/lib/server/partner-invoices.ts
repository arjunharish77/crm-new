import { randomUUID } from "crypto";
import { createAuditLog } from "@/lib/server/crm";
import {
  getPartnerPayoutSettingsForTenant,
  type PartnerPayoutSettingsInput,
} from "@/lib/server/payouts";
import { getPayoutVisiblePartnerUserIds, resolvePartnerRollupTarget } from "@/lib/server/partner-access";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { query, queryOne, jsonbParam } from "@/lib/db/query";
import { readPrivateFile, writePrivateFile } from "@/lib/storage/file-storage";
import { getFileObjectForEntity, upsertFileObjectForTenant } from "@/lib/repositories/files-postgres";
import { generateSignedDownloadToken, verifySignedDownloadToken } from "@/lib/server/signed-urls";
import { safeContentDispositionFilename } from "@/lib/server/http";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

const INVOICE_COLUMNS = `id, "tenantId", "partnerId", "payoutId", "invoiceNumber", "invoiceDate", "supplierSnapshot",
            "recipientSnapshot", "lineItems", "taxableValue", "cgstAmount", "sgstAmount", "igstAmount",
            "totalAmount", "isGstInvoice", "pdfStoragePath", "status", "supersedesInvoiceId", "cancelledAt",
            "cancelledBy", "cancellationReason", "generatedAt", "generatedBy", "createdAt"`;

// --- Pure functions (no I/O) — kept separate and exported for direct unit testing. ---

// Supports {prefix}, {fy}, {counter}, and {counter:0Nd} for zero-padding to N digits.
export function formatInvoiceNumber(
  pattern: string,
  values: { prefix: string; counter: number; fy: string }
): string {
  return pattern.replace(/\{(prefix|fy|counter)(?::0(\d+)d)?\}/g, (_match, key: string, padWidth?: string) => {
    if (key === "prefix") return values.prefix;
    if (key === "fy") return values.fy;
    const counterStr = String(values.counter);
    return padWidth ? counterStr.padStart(Number(padWidth), "0") : counterStr;
  });
}

// Indian financial year: April 1 - March 31. E.g. 2026-03-31 -> "2025-26",
// 2026-04-01 -> "2026-27".
export function getCurrentFinancialYear(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-indexed; April = 3
  const fyStartYear = month >= 3 ? year : year - 1;
  const fyEndYearShort = String((fyStartYear + 1) % 100).padStart(2, "0");
  return `${fyStartYear}-${fyEndYearShort}`;
}

export type TaxSplit = { cgstAmount: number; sgstAmount: number; igstAmount: number; totalAmount: number };

// Place-of-supply logic: same state -> CGST+SGST split evenly; different state ->
// IGST at the full rate; unregistered supplier -> no GST at all (plain receipt).
export function computeTaxSplit(
  taxableValue: number,
  gstRatePercent: number,
  supplierState: string | null,
  recipientState: string | null,
  isGstInvoice: boolean
): TaxSplit {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  if (!isGstInvoice) {
    return { cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: round2(taxableValue) };
  }

  const sameState =
    !!supplierState && !!recipientState && supplierState.trim().toLowerCase() === recipientState.trim().toLowerCase();

  if (sameState) {
    const half = round2((taxableValue * gstRatePercent) / 2 / 100);
    return { cgstAmount: half, sgstAmount: half, igstAmount: 0, totalAmount: round2(taxableValue + half * 2) };
  }

  const igst = round2((taxableValue * gstRatePercent) / 100);
  return { cgstAmount: 0, sgstAmount: 0, igstAmount: igst, totalAmount: round2(taxableValue + igst) };
}

// --- I/O functions ---

export async function getPartnerInvoiceTemplate(user: TenantUser, partnerId: string) {
  if (!user.tenantId) return null;
  return queryOne<any>(
    `select id, "tenantId", "partnerId", "logoUrl", "footerNotes", "signatoryName", "isActive", "createdAt", "updatedAt"
     from "PartnerInvoiceTemplate"
     where "tenantId" = $1 and "partnerId" = $2
     limit 1`,
    [user.tenantId, partnerId],
  );
}

export async function upsertPartnerInvoiceTemplate(
  user: TenantUser,
  partnerId: string,
  input: { logoUrl?: string | null; footerNotes?: string | null; signatoryName?: string | null }
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await getPartnerInvoiceTemplate(user, partnerId);
  const now = new Date().toISOString();
  if (existing) {
    return queryOne<any>(
      `update "PartnerInvoiceTemplate"
       set "logoUrl" = $1, "footerNotes" = $2, "signatoryName" = $3, "updatedAt" = $4
       where id = $5 and "tenantId" = $6
       returning id, "tenantId", "partnerId", "logoUrl", "footerNotes", "signatoryName", "isActive", "createdAt", "updatedAt"`,
      [input.logoUrl || null, input.footerNotes || null, input.signatoryName || null, now, existing.id, user.tenantId],
    );
  }

  const data = await queryOne<any>(
    `insert into "PartnerInvoiceTemplate"
      (id, "tenantId", "partnerId", "logoUrl", "footerNotes", "signatoryName", "isActive", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, true, $7, $7)
     returning id, "tenantId", "partnerId", "logoUrl", "footerNotes", "signatoryName", "isActive", "createdAt", "updatedAt"`,
    [randomUUID(), user.tenantId, partnerId, input.logoUrl || null, input.footerNotes || null, input.signatoryName || null, now],
  );
  if (!data) throw new Error("PARTNER_INVOICE_TEMPLATE_INSERT_FAILED");
  return data;
}

async function getNextInvoiceNumber(
  user: TenantUser,
  partnerProfile: any,
  settings: PartnerPayoutSettingsInput,
  asOfDate: Date
) {
  const pattern = partnerProfile.invoiceNumberPattern || settings.invoiceNumberPattern || "{prefix}-{counter}";

  if (pattern.includes("{fy}")) {
    const fy = getCurrentFinancialYear(asOfDate);
    const countersByFy = partnerProfile.invoiceNumberCountersByFy ?? {};
    const nextCounter = (countersByFy[fy] ?? 0) + 1;
    await query(
      `update "PartnerProfile"
       set "invoiceNumberCountersByFy" = $1, "updatedAt" = $2
       where id = $3`,
      [{ ...countersByFy, [fy]: nextCounter }, new Date().toISOString(), partnerProfile.id],
    );
    return formatInvoiceNumber(pattern, { prefix: partnerProfile.invoiceNumberPrefix, counter: nextCounter, fy });
  }

  const nextCounter = (partnerProfile.invoiceNumberCounter ?? 0) + 1;
  await query(
    `update "PartnerProfile"
     set "invoiceNumberCounter" = $1, "updatedAt" = $2
     where id = $3`,
    [nextCounter, new Date().toISOString(), partnerProfile.id],
  );
  return formatInvoiceNumber(pattern, { prefix: partnerProfile.invoiceNumberPrefix, counter: nextCounter, fy: "" });
}

// The one-click flow: a partner (or admin on their behalf) turns an APPROVED payout
// into an invoice. Requires PartnerPayoutSettings' company GST details to be filled
// in first — errors clearly rather than generating an invoice with blank fields.
export async function generatePartnerInvoiceForPayout(
  user: TenantUser,
  payoutId: string,
  opts: { supersedesInvoiceId?: string } = {}
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "payoutsEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const payout = await queryOne<any>(
    `select id, "tenantId", "payoutCycleId", "partnerId", "partnerOrganizationId", "totalCommissionAmount", status, "invoiceId"
     from "Payout"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, payoutId],
  );
  if (!payout) return null;
  // A reissue (supersedesInvoiceId set) is regenerating the document for an already-
  // invoiced/paid payout, so the normal "must be APPROVED" gate doesn't apply there.
  if (!opts.supersedesInvoiceId && payout.status !== "APPROVED") throw new Error("PAYOUT_NOT_APPROVED");

  const settings = await getPartnerPayoutSettingsForTenant(user);
  if (!settings?.companyLegalName || !settings?.companyState) throw new Error("COMPANY_GST_DETAILS_NOT_CONFIGURED");
  const allowedPartnerUserIds =
    user.isTenantAdmin || user.isPlatformAdmin
      ? (await resolvePartnerRollupTarget(user.tenantId, payout.partnerId)).memberUserIds
      : await getPayoutVisiblePartnerUserIds(user, settings);
  if (!user.isTenantAdmin && !user.isPlatformAdmin) {
    if (!allowedPartnerUserIds.includes(payout.partnerId)) throw new Error("PAYOUT_NOT_VISIBLE_FOR_USER");
    if (settings.allowPartnerSelfInvoice === false) {
      throw new Error("PARTNER_SELF_INVOICE_DISABLED");
    }
  }

  const partnerProfile = await queryOne<any>(
    `select id, "userId", "legalBusinessName", gstin, "registeredAddress", "registeredState",
            "invoiceNumberPrefix", "invoiceNumberCounter", "invoiceNumberPattern", "invoiceNumberCountersByFy"
     from "PartnerProfile"
     where "tenantId" = $1 and "userId" = $2
     limit 1`,
    [user.tenantId, payout.partnerId],
  );
  if (!partnerProfile) throw new Error("PARTNER_PROFILE_NOT_FOUND");

  const cycle = await queryOne<any>(
    `select id, "cycleLabel", "startDate", "endDate"
     from "PayoutCycle"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, payout.payoutCycleId],
  );
  if (!cycle) throw new Error("PAYOUT_CYCLE_NOT_FOUND");

  const ledgerEntries = await query<any>(
    `select id, "partnerId", "entryType", "commissionAmount", "opportunityId", "createdAt"
     from "CommissionLedger"
     where "tenantId" = $1 and "createdAt" >= $2 and "createdAt" < $3 and "partnerId" = any($4::text[])`,
    [user.tenantId, cycle.startDate, cycle.endDate, allowedPartnerUserIds],
  );

  const isGstInvoice = !!partnerProfile.gstin;
  const taxableValue = Number(payout.totalCommissionAmount ?? 0);
  const taxSplit = computeTaxSplit(
    taxableValue,
    settings.gstRatePercent ?? 18,
    partnerProfile.registeredState,
    settings.companyState,
    isGstInvoice
  );

  const now = new Date();
  const invoiceNumber = await getNextInvoiceNumber(user, partnerProfile, settings, now);

  const supplierSnapshot = {
    legalBusinessName: partnerProfile.legalBusinessName,
    gstin: partnerProfile.gstin ?? null,
    registeredAddress: partnerProfile.registeredAddress ?? null,
    registeredState: partnerProfile.registeredState ?? null,
  };
  const recipientSnapshot = {
    companyLegalName: settings.companyLegalName,
    companyGstin: settings.companyGstin ?? null,
    companyAddress: settings.companyAddress ?? null,
    companyState: settings.companyState,
  };
  const lineItems = ledgerEntries.map((entry: any) => ({
    description: `Commission - ${entry.entryType}${entry.opportunityId ? ` (opportunity ${entry.opportunityId})` : ""}`,
    hsnSac: settings.defaultHsnSacCode ?? null,
    amount: entry.entryType === "CORRECTION_DEBIT" ? -Number(entry.commissionAmount) : Number(entry.commissionAmount),
  }));
  const createdAt = now.toISOString();

  const invoice = await queryOne<any>(
    `insert into "PartnerInvoice"
      (id, "tenantId", "partnerId", "payoutId", "invoiceNumber", "invoiceDate", "supplierSnapshot",
       "recipientSnapshot", "lineItems", "taxableValue", "cgstAmount", "sgstAmount", "igstAmount",
       "totalAmount", "isGstInvoice", "status", "supersedesInvoiceId", "generatedAt", "generatedBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'ISSUED', $16, $17, $18, $17)
     returning ${INVOICE_COLUMNS}`,
    [
      randomUUID(),
      user.tenantId,
      payout.partnerId,
      payout.id,
      invoiceNumber,
      createdAt,
      supplierSnapshot,
      recipientSnapshot,
      jsonbParam(lineItems),
      taxableValue,
      taxSplit.cgstAmount,
      taxSplit.sgstAmount,
      taxSplit.igstAmount,
      taxSplit.totalAmount,
      isGstInvoice,
      opts.supersedesInvoiceId || null,
      createdAt,
      user.id,
    ],
  );
  if (!invoice) throw new Error("PARTNER_INVOICE_INSERT_FAILED");

  const template = await getPartnerInvoiceTemplate(user, payout.partnerId);
  const { renderPartnerInvoicePdf } = await import("@/lib/server/invoice-pdf");
  const pdfBuffer = await renderPartnerInvoicePdf({ invoice, cycleLabel: cycle?.cycleLabel ?? "", template });
  const storedFile = await writePrivateFile(`partner-invoices/${user.tenantId}/${payout.partnerId}/${invoice.id}.pdf`, pdfBuffer, {
    bucket: "partner-invoices",
    contentType: "application/pdf",
  });
  await upsertFileObjectForTenant(user, {
    bucket: storedFile.bucket,
    storageKey: storedFile.storageKey,
    storageDriver: storedFile.driver,
    originalFilename: `partner-invoice-${invoice.invoiceNumber}.pdf`,
    contentType: storedFile.contentType,
    byteSize: storedFile.byteSize,
    checksum: storedFile.checksum,
    entityType: "PARTNER_INVOICE",
    entityId: invoice.id,
    visibility: "PRIVATE",
    metadata: { partnerId: payout.partnerId, payoutId: payout.id, invoiceNumber },
  });
  const updatedInvoice = await queryOne<any>(
    `update "PartnerInvoice"
     set "pdfStoragePath" = $1
     where "tenantId" = $2 and id = $3
     returning ${INVOICE_COLUMNS}`,
    [storedFile.storageKey, user.tenantId, invoice.id],
  );
  if (!updatedInvoice) throw new Error("PARTNER_INVOICE_UPDATE_FAILED");
  // First-time invoicing moves the payout to INVOICED; a reissue against an already
  // INVOICED/PAID payout just repoints invoiceId at the new document without touching
  // the payout's own status (PAID stays PAID -- reissuing the paper trail isn't a payment event).
  if (payout.status === "APPROVED") {
    await query('update "Payout" set "invoiceId" = $1, status = $2, "updatedAt" = $3 where "tenantId" = $4 and id = $5', [
      invoice.id,
      "INVOICED",
      createdAt,
      user.tenantId,
      payout.id,
    ]);
  } else {
    await query('update "Payout" set "invoiceId" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4', [
      invoice.id,
      createdAt,
      user.tenantId,
      payout.id,
    ]);
  }
  await createAuditLog(user as any, "CREATE", "PARTNER_INVOICE", invoice.id, null, updatedInvoice, opts.supersedesInvoiceId ? { supersedesInvoiceId: opts.supersedesInvoiceId } : null);
  return updatedInvoice;
}

// Admin-only credit-note flow: cancels a mistakenly-issued invoice and immediately
// regenerates a fresh one (new invoice number, supersedesInvoiceId pointing at the
// cancelled one) against the same payout/cycle data. The cancelled invoice's PDF and
// row are kept forever for audit purposes -- never deleted, only marked CANCELLED.
export async function cancelAndReissuePartnerInvoice(user: TenantUser, invoiceId: string, reason: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!user.isTenantAdmin && !user.isPlatformAdmin) throw new Error("FORBIDDEN");
  if (!reason?.trim()) throw new Error("CANCELLATION_REASON_REQUIRED");
  // Checked here explicitly, not just relied upon via the later generatePartnerInvoiceForPayout
  // call (line ~162) -- that gate is reached only after the cancellation below has already
  // committed and been audit-logged, which would let a disabled tenant cancel a live invoice
  // with no replacement before the gate ever fires.
  await assertFeatureEnabled(user.tenantId, "payoutsEnabled", { isPlatformAdmin: user.isPlatformAdmin });

  const existing = await queryOne<any>(
    `select ${INVOICE_COLUMNS} from "PartnerInvoice" where "tenantId" = $1 and id = $2 limit 1`,
    [user.tenantId, invoiceId],
  );
  if (!existing) return null;
  if (existing.status !== "ISSUED") throw new Error("INVOICE_ALREADY_CANCELLED");

  const now = new Date().toISOString();
  const cancelled = await queryOne<any>(
    `update "PartnerInvoice"
     set "status" = 'CANCELLED', "cancelledAt" = $1, "cancelledBy" = $2, "cancellationReason" = $3
     where "tenantId" = $4 and id = $5
     returning ${INVOICE_COLUMNS}`,
    [now, user.id, reason.trim(), user.tenantId, invoiceId],
  );
  if (!cancelled) throw new Error("PARTNER_INVOICE_CANCEL_FAILED");
  await createAuditLog(user as any, "UPDATE", "PARTNER_INVOICE", invoiceId, existing, cancelled, {
    cancellation: { reason: reason.trim() },
  });

  try {
    const newInvoice = await generatePartnerInvoiceForPayout(user, existing.payoutId, { supersedesInvoiceId: invoiceId });
    return { cancelledInvoice: cancelled, newInvoice };
  } catch (error) {
    // The reissue failed after the cancellation already committed -- leaving the payout
    // pointed at a CANCELLED invoice with no replacement would strand it (no valid
    // document, and the PAID-gate re-validation below would then block payment forever).
    // Revert the cancellation so the original invoice is still usable.
    await query(
      `update "PartnerInvoice"
       set "status" = 'ISSUED', "cancelledAt" = null, "cancelledBy" = null, "cancellationReason" = null
       where "tenantId" = $1 and id = $2`,
      [user.tenantId, invoiceId],
    );
    throw error;
  }
}

export async function listPartnerInvoiceHistoryForPayout(user: TenantUser, payoutId: string) {
  if (!user.tenantId) return [];
  return query<any>(
    `select ${INVOICE_COLUMNS} from "PartnerInvoice" where "tenantId" = $1 and "payoutId" = $2 order by "createdAt" asc`,
    [user.tenantId, payoutId],
  );
}

export async function getPartnerInvoicePdfSignedUrl(user: TenantUser, invoiceId: string) {
  if (!user.tenantId) return null;
  const invoice = await queryOne<any>(
    `select id, "tenantId", "partnerId", "invoiceNumber", "pdfStoragePath"
     from "PartnerInvoice"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, invoiceId],
  );
  if (!invoice?.pdfStoragePath) return null;
  const fileObject = await getFileObjectForEntity(user, {
    entityType: "PARTNER_INVOICE",
    entityId: invoice.id,
    bucket: "partner-invoices",
  });
  const file = await readPrivateFile(fileObject?.storageKey ?? invoice.pdfStoragePath);
  return {
    file,
    contentType: fileObject?.contentType ?? "application/pdf",
    partnerId: invoice.partnerId,
    invoiceNumber: invoice.invoiceNumber as string,
  };
}

// A genuine expiring signed URL (gap checklist: "true expiring signed URLs"), additive to the
// function above rather than replacing it -- that one is used for the existing authenticated
// inline-view route, unchanged, and this is a new, separate capability: a link an authenticated
// tenant admin or the owning partner can mint and share (e.g. paste into an email to the
// partner) that itself works without a live session, for exactly as long as the token says.
// The mint step still does the same ownership check the download route does today
// (`isTenantAdmin`/`isPlatformAdmin`/`partnerId === user.id`) -- only re-verified here since
// this is the new function that can hand out access to someone who won't have a session,
// unlike the existing route where an active session already proved that once per request.
export async function mintPartnerInvoiceDownloadToken(user: TenantUser, invoiceId: string, expiresInSeconds = 3600) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const invoice = await queryOne<{ id: string; partnerId: string }>(
    `select id, "partnerId" from "PartnerInvoice" where "tenantId" = $1 and id = $2 limit 1`,
    [user.tenantId, invoiceId],
  );
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");
  if (!user.isTenantAdmin && !user.isPlatformAdmin && invoice.partnerId !== user.id) throw new Error("FORBIDDEN");
  const { token, expiresAt } = generateSignedDownloadToken("partner-invoice", invoiceId, expiresInSeconds);
  return { token, expiresAt };
}

// The public, token-verified counterpart -- no session required, identified by invoiceId (a
// globally unique row id, the same "identified by an unguessable id" precedent the
// report-delivery public download route already established) plus a signature that proves it
// was actually minted by someone who passed the ownership check above, not just guessed.
export async function getPartnerInvoiceDownloadByToken(invoiceId: string, token: string | null) {
  const verification = verifySignedDownloadToken("partner-invoice", invoiceId, token);
  if (!verification.valid) throw new Error(`INVALID_TOKEN:${verification.reason}`);

  const invoice = await queryOne<{ id: string; tenantId: string; invoiceNumber: string; pdfStoragePath: string | null }>(
    `select id, "tenantId", "invoiceNumber", "pdfStoragePath" from "PartnerInvoice" where id = $1 limit 1`,
    [invoiceId],
  );
  if (!invoice?.pdfStoragePath) throw new Error("INVOICE_NOT_FOUND");
  const fileObject = await getFileObjectForEntity({ tenantId: invoice.tenantId } as TenantUser, {
    entityType: "PARTNER_INVOICE",
    entityId: invoice.id,
    bucket: "partner-invoices",
  });
  const file = await readPrivateFile(fileObject?.storageKey ?? invoice.pdfStoragePath);
  return {
    file,
    contentType: fileObject?.contentType ?? "application/pdf",
    filename: safeContentDispositionFilename(`Invoice-${invoice.invoiceNumber}.pdf`, `invoice-${invoiceId}.pdf`),
  };
}

export async function listPartnerInvoicesForPartner(user: TenantUser, partnerId: string) {
  if (!user.tenantId) return [];
  const visiblePartnerUserIds = await getPayoutVisiblePartnerUserIds(user);
  if (!visiblePartnerUserIds.includes(partnerId)) return [];
  return query<any>(
    `select ${INVOICE_COLUMNS}
     from "PartnerInvoice"
     where "tenantId" = $1 and "partnerId" = any($2::text[])
     order by "createdAt" desc`,
    [user.tenantId, visiblePartnerUserIds],
  );
}

// CSV for the finance team, covering every partner in a cycle. Plain string
// building — no new dependency needed for a format this simple.
export async function generateCycleFinanceCsv(user: TenantUser, cycleId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const payouts = await query<any>(
    `select id, "partnerId", "totalCommissionAmount", status, "paymentReference"
     from "Payout"
     where "tenantId" = $1 and "payoutCycleId" = $2`,
    [user.tenantId, cycleId],
  );
  if (!payouts.length) return "Partner Name,Email,GSTIN,Amount,Status,Invoice Number,Payment Reference\n";

  const partnerIds = payouts.map((p: any) => p.partnerId);
  const [users, profiles, invoices] = await Promise.all([
    query<any>('select id, name, email from "User" where "tenantId" = $1 and id = any($2::text[])', [user.tenantId, partnerIds]),
    query<any>('select "userId", "legalBusinessName", gstin from "PartnerProfile" where "tenantId" = $1 and "userId" = any($2::text[])', [
      user.tenantId,
      partnerIds,
    ]),
    query<any>(
      `select "payoutId", "invoiceNumber" from "PartnerInvoice"
       where "tenantId" = $1 and "payoutId" = any($2::text[]) and "status" = 'ISSUED'`,
      [user.tenantId, payouts.map((p: any) => p.id)],
    ),
  ]);
  const userMap = new Map(users.map((row) => [row.id, row]));
  const profileMap = new Map(profiles.map((row) => [row.userId, row]));
  const invoiceMap = new Map(invoices.map((inv) => [inv.payoutId, inv.invoiceNumber]));

  const escapeCsv = (value: unknown) => {
    const text = String(value ?? "");
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = payouts.map((payout: any) => {
    const profile = profileMap.get(payout.partnerId);
    const user2 = userMap.get(payout.partnerId);
    return [
      escapeCsv(profile?.legalBusinessName ?? user2?.name ?? payout.partnerId),
      escapeCsv(user2?.email ?? ""),
      escapeCsv(profile?.gstin ?? "Unregistered"),
      payout.totalCommissionAmount,
      payout.status,
      escapeCsv(invoiceMap.get(payout.id) ?? ""),
      escapeCsv(payout.paymentReference ?? ""),
    ].join(",");
  });

  return ["Partner Name,Email,GSTIN,Amount,Status,Invoice Number,Payment Reference", ...rows].join("\n");
}
