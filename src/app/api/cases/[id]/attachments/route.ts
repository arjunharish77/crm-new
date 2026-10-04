import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { assertTenantModule } from "@/lib/server/module-entitlements";
import { assertStorageAvailable } from "@/lib/server/usage-limits";
import { requireInternalUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { query, execute } from "@/lib/db/query";
import { writePrivateFile } from "@/lib/storage/file-storage";
import { upsertFileObjectForTenant } from "@/lib/repositories/files-postgres";
import { ALLOWED_ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_BYTES, base64DecodedLength, checkAttachment } from "@/lib/storage/attachment-policy";

async function caseExists(tenantId: string, caseId: string) {
  return (await query<{ id: string }>(`select id from "Case" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, caseId])).length > 0;
}

// Manual attachment capture (checklist item 1's "attachment capture", the manual-upload half --
// inbound-message attachments are captured automatically by captureInboundCaseMessage). Base64
// JSON body, matching this codebase's existing convention of no multipart/form-data upload
// surface anywhere else in the app.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    await assertTenantModule(user, "SERVICE_DESK");
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    if (!(await caseExists(user.tenantId, id))) return NextResponse.json({ message: "Case not found" }, { status: 404 });
    const rows = await query<any>(
      `select id, "caseId", "fileObjectId", filename, "contentType", "byteSize", source, "createdAt" from "CaseAttachment" where "tenantId" = $1 and "caseId" = $2 order by "createdAt" desc`,
      [user.tenantId, id],
    );
    return NextResponse.json(rows);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch case attachments", error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    await assertTenantModule(user, "SERVICE_DESK");
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body?.filename || !body?.base64) return badRequest("filename and base64 are required");
    if (!(await caseExists(user.tenantId, id))) return NextResponse.json({ message: "Case not found" }, { status: 404 });

    // Safe name, size cap and allowed types before decoding or writing anything (S7).
    const check = checkAttachment(body.filename, base64DecodedLength(String(body.base64)));
    if (!check.ok) {
      if (check.reason === "TOO_LARGE") return badRequest(`Attachments can be up to ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`);
      if (check.reason === "TYPE_NOT_ALLOWED") return badRequest(`That file type can't be attached. Allowed: ${ALLOWED_ATTACHMENT_EXTENSIONS.join(", ")}.`);
      return badRequest("The file is empty.");
    }
    const buffer = Buffer.from(String(body.base64), "base64");
    const storageKey = `cases/${user.tenantId}/${id}/${randomUUID()}-${check.fileName}`;
    // Storage limit (Module 21): refuse before anything is written to disk.
    await assertStorageAvailable(user.tenantId!, buffer.length);
    const written = await writePrivateFile(storageKey, buffer, { bucket: "case-attachments", contentType: check.contentType });
    const fileObject = await upsertFileObjectForTenant(user, {
      bucket: written.bucket, storageKey: written.storageKey, storageDriver: written.driver,
      originalFilename: check.fileName, contentType: written.contentType, byteSize: written.byteSize,
      checksum: written.checksum, entityType: "CASE", entityId: id, visibility: "TENANT",
    });

    const attachmentId = randomUUID();
    await execute(
      `insert into "CaseAttachment" (id, "tenantId", "caseId", "fileObjectId", filename, "contentType", "byteSize", source, "createdBy", "createdAt")
       values ($1,$2,$3,$4,$5,$6,$7,'MANUAL',$8,$9)`,
      [attachmentId, user.tenantId, id, fileObject.id, check.fileName, written.contentType, written.byteSize, user.id, new Date().toISOString()],
    );
    return NextResponse.json({ id: attachmentId, fileObjectId: fileObject.id, filename: check.fileName });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to upload case attachment", error);
  }
}
