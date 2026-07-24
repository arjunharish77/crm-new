#!/usr/bin/env node
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;
const TENANT_ID = process.env.TENANT_ID;
const ROOT = path.resolve(__dirname, "..");
const STORAGE_ROOT = path.resolve(process.env.FILE_STORAGE_ROOT || path.join(ROOT, "storage"));

if (!DATABASE_URL) {
  console.error("DATABASE_URL or DIRECT_DATABASE_URL is required.");
  process.exit(1);
}

function normalizeStorageKey(storageKey) {
  const normalized = String(storageKey || "").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) throw new Error(`Invalid storage key: ${storageKey}`);
  return normalized;
}

function localPath(storageKey) {
  const normalized = normalizeStorageKey(storageKey);
  const absolute = path.resolve(STORAGE_ROOT, normalized);
  if (!absolute.startsWith(`${STORAGE_ROOT}${path.sep}`) && absolute !== STORAGE_ROOT) {
    throw new Error(`Unsafe storage path: ${storageKey}`);
  }
  return absolute;
}

function checksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
  try {
    const values = [];
    let where = 'pi."pdfStoragePath" is not null and fo.id is null';
    if (TENANT_ID) {
      values.push(TENANT_ID);
      where += ` and pi."tenantId" = $${values.length}`;
    }

    const { rows } = await pool.query(
      `select pi.id, pi."tenantId", pi."partnerId", pi."invoiceNumber", pi."payoutId", pi."pdfStoragePath"
       from "PartnerInvoice" pi
       left join "FileObject" fo
         on fo."tenantId" = pi."tenantId"
        and fo."entityType" = 'PARTNER_INVOICE'
        and fo."entityId" = pi.id
       where ${where}
       order by pi."createdAt" desc`,
      values,
    );

    let created = 0;
    let missing = 0;
    for (const invoice of rows) {
      const storageKey = normalizeStorageKey(invoice.pdfStoragePath);
      const absolute = localPath(storageKey.startsWith("partner-invoices/") ? storageKey : `partner-invoices/${storageKey}`);
      let stat;
      let buffer = null;
      try {
        buffer = fs.readFileSync(absolute);
        stat = fs.statSync(absolute);
      } catch {
        missing += 1;
      }

      await pool.query(
        `insert into "FileObject"
          (id, "tenantId", "storageDriver", bucket, "storageKey", "originalFilename", "contentType",
           "byteSize", checksum, "entityType", "entityId", visibility, metadata, "createdAt", "updatedAt")
         values (gen_random_uuid()::text, $1, 'local', 'partner-invoices', $2, $3, 'application/pdf',
                 $4, $5, 'PARTNER_INVOICE', $6, 'PRIVATE', $7, current_timestamp, current_timestamp)
         on conflict ("tenantId", bucket, "storageKey") do update set
           "byteSize" = excluded."byteSize",
           checksum = excluded.checksum,
           "entityType" = excluded."entityType",
           "entityId" = excluded."entityId",
           metadata = excluded.metadata,
           "updatedAt" = current_timestamp`,
        [
          invoice.tenantId,
          absolute.slice(STORAGE_ROOT.length + 1),
          `partner-invoice-${invoice.invoiceNumber || invoice.id}.pdf`,
          stat?.size || 0,
          buffer ? checksum(buffer) : null,
          invoice.id,
          { partnerId: invoice.partnerId, payoutId: invoice.payoutId, source: buffer ? "LOCAL_FILE_FOUND" : "LOCAL_FILE_MISSING" },
        ],
      );
      created += 1;
    }

    console.log(`Backfilled ${created} invoice file metadata row(s). Missing local PDF files: ${missing}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
