import { NextResponse } from "next/server";
import { archiveFormForTenant, deleteFormForTenant, getFormForTenant, updateFormForTenant } from "@/lib/server/crm";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";
import { saveFormDraftForTenant } from "@/lib/repositories/forms-postgres";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const form = await getFormForTenant(user, id);
    if (!form) return notFound("Form not found");
    return NextResponse.json(form);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch form", error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    // { draft: {...} } is the editor's autosave (decision 29): the public form doesn't change.
    if (body && typeof body.draft === "object" && body.draft) return NextResponse.json(await saveFormDraftForTenant(user, id, body.draft));
    const form = await updateFormForTenant(user, id, body ?? {});
    return NextResponse.json(form);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Form Builder is not enabled for this workspace");
    }
    if (error instanceof Error && error.message === "FORM_NOT_FOUND") return notFound("Form not found");
    if (error instanceof Error && error.message === "FORM_NOT_PUBLISHED") return NextResponse.json({ message: "Publish the form before turning it on." }, { status: 409 });
    if (error instanceof Error && error.message === "FORM_ARCHIVED") return NextResponse.json({ message: "This form is archived. Restore it to make changes." }, { status: 409 });
    if (error instanceof Error && error.message === "FORM_VERSION_CONFLICT") {
      return NextResponse.json({ message: "This form was changed somewhere else after you opened it. Reload to get the latest version, then make your change again." }, { status: 409 });
    }
    return serverError("Failed to update form", error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    // Delete archives (decision 31); ?permanent=1 removes an already-archived form and its submissions.
    if (new URL(request.url).searchParams.get("permanent") === "1") {
      await deleteFormForTenant(user, id);
      return NextResponse.json({ success: true, deleted: true });
    }
    const archived = await archiveFormForTenant(user, id);
    return NextResponse.json({ success: true, archived: true, purgeAfter: archived.purgeAfter });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORM_NOT_FOUND") return notFound("Form not found");
    if (error instanceof Error && error.message === "FORM_NOT_ARCHIVED") return badRequest("Archive the form before deleting it permanently");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return badRequest("Forms is not enabled for this workspace");
    return serverError("Failed to delete form", error);
  }
}
