import { NextResponse } from "next/server";
import { getCurrentUser, requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { queryOne } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";
import { userPhoneForStorage } from "@/lib/user-phone";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return unauthorized();
    }

    return NextResponse.json(user);
  } catch (error) {
    return serverError("Failed to fetch current user", error);
  }
}

// My account › Profile: a user can change their name and the phone their calls ring.
// Email, role, team and access stay with admins in Settings › Users.
export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!name) return badRequest("Enter your name");
    if (name.length > 120) return badRequest("Use 120 characters or fewer");
    const before = await queryOne<{ name: string | null; phone: string | null }>('select name, phone from "User" where id = $1', [user.id]);
    const phone = Object.prototype.hasOwnProperty.call(body, "phone") ? userPhoneForStorage(body.phone) : before?.phone ?? null;
    const updated = await queryOne<{ id: string; name: string; phone: string | null }>(
      'update "User" set name = $1, phone = $2, "updatedAt" = now() where id = $3 returning id, name, phone',
      [name, phone, user.id],
    );
    if (!updated) return unauthorized();
    if ((before?.name ?? null) !== name || (before?.phone ?? null) !== phone) {
      await createAuditLog(user as any, "UPDATE", "USER", user.id, { name: before?.name ?? null, phone: before?.phone ?? null }, { name, phone }, {
        ...(before?.name !== name ? { name: { before: before?.name ?? null, after: name } } : {}),
        ...(before?.phone !== phone ? { phone: { before: before?.phone ?? null, after: phone } } : {}),
      });
    }
    return NextResponse.json({ id: updated.id, name: updated.name, phone: updated.phone });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "USER_PHONE_INVALID") return badRequest("Enter a dialable phone number, such as +919876543210 or 9876543210");
    return serverError("Failed to update your profile", error);
  }
}
