import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { deleteNextBestActionRule, updateNextBestActionRule } from "@/lib/server/next-best-action";
import { serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const rule = await updateNextBestActionRule(user, id, body);
    if (!rule) return NextResponse.json({ message: "Rule not found" }, { status: 404 });
    return NextResponse.json(rule);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update Next-Best-Action rule", error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const rule = await deleteNextBestActionRule(user, id);
    if (!rule) return NextResponse.json({ message: "Rule not found" }, { status: 404 });
    return NextResponse.json({ success: true, purgeAfter: rule.purgeAfter ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to delete Next-Best-Action rule", error);
  }
}
