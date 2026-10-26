import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getAdminSession, type AdminSession } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { GuideError, lockGuides } from "@/lib/guide-revisions";

type Role = AdminSession["role"];

// One transaction per guide write, behind the DB-backed session check and a role check (editors
// draft and submit; administrators publish or send back), as for articles.
export async function guideWrite(roles: Role[], work: (db: PoolClient, session: AdminSession) => Promise<NextResponse>) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "CMS login required" }, { status: 401 });
  if (!roles.includes(session.role)) return NextResponse.json({ error: session.role === "VIEWER" ? "Viewers can't change guides." : "Only administrators can do this." }, { status: 403 });
  const db = await pool.connect();
  try {
    await db.query("begin");
    await lockGuides(db);
    const response = await work(db, session);
    await db.query(response.ok ? "commit" : "rollback");
    return response;
  } catch (error) {
    await db.query("rollback").catch(() => {});
    if (error instanceof GuideError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  } finally { db.release(); }
}
