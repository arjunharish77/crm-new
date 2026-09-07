import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { revokeTrustedDevice } from "@/lib/server/mfa";
import { serverError, unauthorized } from "@/lib/server/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await revokeTrustedDevice(user.id, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to revoke trusted device", error);
  }
}
