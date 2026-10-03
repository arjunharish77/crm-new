import { NextResponse } from "next/server";
import { getCurrentUser, requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { queryOne } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";

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

// My account › Profile (UI/UX plan decision 8): a user can change their own display name.
// Nothing else -- email, role, team and access stay with admins in Settings › Users.
export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!name) return badRequest("Enter your name");
    if (name.length > 120) return badRequest("Use 120 characters or fewer");
    const before = await queryOne<{ name: string | null }>('select name from "User" where id = $1', [user.id]);
    const updated = await queryOne<{ id: string; name: string }>(
      'update "User" set name = $1, "updatedAt" = now() where id = $2 returning id, name',
      [name, user.id],
    );
    if (!updated) return unauthorized();
    if ((before?.name ?? null) !== name) {
      await createAuditLog(user as any, "UPDATE", "USER", user.id, { name: before?.name ?? null }, { name }, { name: { before: before?.name ?? null, after: name } });
    }
    return NextResponse.json({ id: updated.id, name: updated.name });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update your profile", error);
  }
}
