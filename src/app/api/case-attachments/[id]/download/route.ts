import { NextResponse } from "next/server";
import { assertTenantModule } from "@/lib/server/module-entitlements";
import { requireInternalUser } from "@/lib/server/auth";
import { badRequest, forbidden, safeContentDispositionFilename, serverError, unauthorized } from "@/lib/server/http";
import { queryOne } from "@/lib/db/query";
import { readPrivateFile } from "@/lib/storage/file-storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    await assertTenantModule(user, "SERVICE_DESK");
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;

    const attachment = await queryOne<any>(
      `select a.filename, a."contentType", f."storageKey", f."storageDriver" from "CaseAttachment" a
       join "FileObject" f on f.id = a."fileObjectId"
       where a."tenantId" = $1 and a.id = $2`,
      [user.tenantId, id],
    );
    if (!attachment) return badRequest("Attachment not found");
    if (attachment.storageDriver !== "local") return serverError("Unsupported storage driver", new Error(attachment.storageDriver));

    const buffer = await readPrivateFile(attachment.storageKey);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": attachment.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeContentDispositionFilename(attachment.filename || "attachment")}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to download case attachment", error);
  }
}
