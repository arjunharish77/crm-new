import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import {
  deleteCustomFieldForTenant,
  updateCustomFieldForTenant,
} from "@/lib/server/admin-modules";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const updated = await updateCustomFieldForTenant(user, id, {
      label: body?.fieldLabel,
      key: body?.fieldKey,
      fieldType: body?.fieldType,
      isRequired: body?.isRequired,
      options: body?.fieldConfig?.options,
      isActive: body?.isActive,
    });

    return NextResponse.json({
      id: updated.id,
      fieldLabel: updated.label,
      fieldKey: updated.key,
      fieldType: body?.fieldType ?? updated.type,
      isRequired: updated.isRequired ?? false,
      fieldConfig: {
        placeholder: body?.fieldConfig?.placeholder ?? "",
        options: Array.isArray(updated.options) ? updated.options : [],
      },
      order: updated.order ?? 0,
      isActive: updated.isActive ?? true,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update type custom field", error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    await deleteCustomFieldForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to delete type custom field", error);
  }
}
