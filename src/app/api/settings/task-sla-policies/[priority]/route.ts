import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { deleteTaskSlaPolicyForTenant } from "@/lib/repositories/task-sla-policies-postgres";

type Params = {
  params: Promise<{ priority: string }>;
};

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireTenantAdmin(request);
    const { priority } = await params;
    const deleted = await deleteTaskSlaPolicyForTenant(user, priority);
    if (!deleted) return NextResponse.json({ message: "Policy not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only tenant admins can manage SLA policies");
    return serverError("Failed to delete task SLA policy", error);
  }
}
