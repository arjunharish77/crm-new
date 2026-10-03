import { NextResponse } from "next/server";
import {
  archiveAutomationForTenant,
  deleteAutomationForTenant,
  getAutomationForTenant,
  updateAutomationForTenant,
} from "@/lib/server/crm";
import { badRequest, forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";
import { requireInternalUser } from "@/lib/server/auth";
import { saveAutomationDraftForTenant } from "@/lib/repositories/automations-postgres";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    const automation = await getAutomationForTenant(user, id);
    if (!automation) return notFound("Automation not found");
    return NextResponse.json(automation);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch automation", error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireInternalUser(request);
    const body = await request.json().catch(() => null);
    const { id } = await params;
    // { draft: {...} } is the builder's autosave (decision 29): it never changes what runs.
    if (body && typeof body.draft === "object" && body.draft) return NextResponse.json(await saveAutomationDraftForTenant(user, id, body.draft));
    const automation = await updateAutomationForTenant(user, id, body ?? {});
    return NextResponse.json(automation);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Automations is not enabled for this workspace");
    }
    if (error instanceof Error && error.message === "AUTOMATION_ARCHIVED") return NextResponse.json({ message: "This automation is archived. Restore it to make changes." }, { status: 409 });
    if (error instanceof Error && error.message === "AUTOMATION_NOT_PUBLISHED") return NextResponse.json({ message: "Publish this automation before turning it on." }, { status: 409 });
    if (error instanceof Error && error.message === "AUTOMATION_NOT_FOUND") return notFound("Automation not found");
    return serverError("Failed to update automation", error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    // Delete archives (decision 31); ?permanent=1 removes an already-archived automation for good.
    if (new URL(request.url).searchParams.get("permanent") === "1") {
      await deleteAutomationForTenant(user, id);
      return NextResponse.json({ success: true, deleted: true });
    }
    const archived = await archiveAutomationForTenant(user, id);
    return NextResponse.json({ success: true, archived: true, purgeAfter: archived.purgeAfter });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "AUTOMATION_NOT_FOUND") return notFound("Automation not found");
    if (error instanceof Error && error.message === "AUTOMATION_NOT_ARCHIVED") return badRequest("Archive the automation before deleting it permanently");
    if (error instanceof Error && error.message === "AUTOMATION_USED_BY_JOURNEY") {
      const names = ((error as any).journeys as string[]).join(", ");
      return NextResponse.json({ message: `This automation runs the journey ${names}. Archive the journey instead.` }, { status: 409 });
    }
    return serverError("Failed to delete automation", error);
  }
}
