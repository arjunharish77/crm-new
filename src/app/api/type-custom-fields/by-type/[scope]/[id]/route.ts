import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listCustomFieldsForTenant } from "@/lib/server/admin-modules";
import { forbidden, unauthorized } from "@/lib/server/http";

const SCOPE_TO_OBJECT_TYPE: Record<string, string> = {
  ACTIVITY_TYPE: "ACTIVITY",
  OPPORTUNITY_TYPE: "OPPORTUNITY",
};

export async function GET(request: Request, { params }: { params: Promise<{ scope: string; id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { scope } = await params;
    const objectType = SCOPE_TO_OBJECT_TYPE[scope];

    if (!objectType) {
      return NextResponse.json([]);
    }

    const fields = await listCustomFieldsForTenant(user, objectType);
    return NextResponse.json(
      fields.map((field) => ({
        id: field.id,
        fieldKey: field.key,
        fieldLabel: field.label,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        isActive: field.isActive,
        order: field.order,
        fieldConfig: {
          options: field.options ?? field.metadata?.options ?? [],
          placeholder: "",
        },
      }))
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return NextResponse.json([]);
  }
}
