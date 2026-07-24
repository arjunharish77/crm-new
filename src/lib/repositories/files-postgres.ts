import { randomUUID } from "crypto";
import { query, queryOne } from "@/lib/db/query";
import type { FileStorageDriver } from "@/lib/storage/file-storage";

type TenantUser = {
  id: string;
  tenantId: string | null;
};

type UpsertFileObjectInput = {
  bucket: string;
  storageKey: string;
  storageDriver: FileStorageDriver;
  originalFilename?: string | null;
  contentType?: string | null;
  byteSize?: number | null;
  checksum?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  visibility?: "PRIVATE" | "TENANT";
  metadata?: Record<string, unknown> | null;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

export async function upsertFileObjectForTenant(user: TenantUser, input: UpsertFileObjectInput) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "FileObject"
      (id, "tenantId", "storageDriver", bucket, "storageKey", "originalFilename", "contentType",
       "byteSize", checksum, "entityType", "entityId", visibility, metadata, "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
     on conflict ("tenantId", bucket, "storageKey") do update set
       "storageDriver" = excluded."storageDriver",
       "originalFilename" = excluded."originalFilename",
       "contentType" = excluded."contentType",
       "byteSize" = excluded."byteSize",
       checksum = excluded.checksum,
       "entityType" = excluded."entityType",
       "entityId" = excluded."entityId",
       visibility = excluded.visibility,
       metadata = excluded.metadata,
       "updatedAt" = excluded."updatedAt"
     returning id, "tenantId", "storageDriver", bucket, "storageKey", "originalFilename", "contentType",
               "byteSize", checksum, "entityType", "entityId", visibility, metadata, "createdAt", "updatedAt"`,
    [
      randomUUID(),
      tenantId,
      input.storageDriver,
      input.bucket,
      input.storageKey,
      input.originalFilename ?? null,
      input.contentType ?? null,
      Math.max(0, Number(input.byteSize ?? 0)),
      input.checksum ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      input.visibility ?? "PRIVATE",
      input.metadata ?? {},
      user.id,
      now,
    ],
  );
  if (!row) throw new Error("FILE_OBJECT_UPSERT_FAILED");
  return row;
}

export async function getFileObjectForEntity(user: TenantUser, input: { entityType: string; entityId: string; bucket?: string }) {
  const tenantId = requireTenantId(user);
  return queryOne<any>(
    `select id, "tenantId", "storageDriver", bucket, "storageKey", "originalFilename", "contentType",
            "byteSize", checksum, "entityType", "entityId", visibility, metadata, "createdAt", "updatedAt"
     from "FileObject"
     where "tenantId" = $1 and "entityType" = $2 and "entityId" = $3 and ($4::text is null or bucket = $4)
     order by "createdAt" desc
     limit 1`,
    [tenantId, input.entityType, input.entityId, input.bucket ?? null],
  );
}

export async function listInvoicePdfFileObjectsMissingForTenant(tenantId: string) {
  return query<any>(
    `select pi.id, pi."tenantId", pi."partnerId", pi."pdfStoragePath"
     from "PartnerInvoice" pi
     left join "FileObject" fo
       on fo."tenantId" = pi."tenantId"
      and fo."entityType" = 'PARTNER_INVOICE'
      and fo."entityId" = pi.id
     where pi."tenantId" = $1 and pi."pdfStoragePath" is not null and fo.id is null
     order by pi."createdAt" desc`,
    [tenantId],
  );
}
