import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { createCustomFieldForTenant } from "@/lib/server/admin-modules";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

const ENTITY_TYPE_TO_OBJECT_TYPE: Record<string, string> = {
  ACTIVITY_TYPE: "ACTIVITY",
  OPPORTUNITY_TYPE: "OPPORTUNITY",
};

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    const objectType = ENTITY_TYPE_TO_OBJECT_TYPE[String(body?.entityType ?? "")];
    if (!body?.fieldLabel || !body?.fieldKey || !objectType) {
      return badRequest("Field label, field key, and a supported entity type are required");
    }

    const created = await createCustomFieldForTenant(user, {
      label: body.fieldLabel,
      key: body.fieldKey,
      objectType,
      type: body.fieldType,
      required: body.isRequired,
      options: body.fieldConfig?.options,
      order: body.order,
      isActive: true,
    });

    return NextResponse.json({
      id: created.id,
      fieldLabel: created.label,
      fieldKey: created.key,
      fieldType: body.fieldType ?? created.type,
      isRequired: created.isRequired ?? false,
      fieldConfig: {
        placeholder: body.fieldConfig?.placeholder ?? "",
        options: Array.isArray(created.options) ? created.options : [],
      },
      order: created.order ?? 0,
      isActive: created.isActive ?? true,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to create type custom field", error);
  }
}
