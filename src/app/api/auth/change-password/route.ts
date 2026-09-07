import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { changeOwnPassword, PasswordPolicyError } from "@/lib/server/password-policy";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;
    if (!currentPassword || !newPassword) return badRequest("currentPassword and newPassword are required");

    await changeOwnPassword(user, String(currentPassword), String(newPassword));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "INVALID_CURRENT_PASSWORD") return badRequest("Current password is incorrect");
    if (error instanceof PasswordPolicyError) return badRequest(error.errors.join(", "));
    return serverError("Failed to change password", error);
  }
}
