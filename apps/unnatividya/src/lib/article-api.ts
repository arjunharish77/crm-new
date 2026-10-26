import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getAdminSession, type AdminSession } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { ArticleError, lockArticles } from "@/lib/article-revisions";

type Role = AdminSession["role"];

// One transaction per article write, behind the authoritative DB-backed session check and a role
// check (editors draft and submit; administrators review, publish and unpublish).
export async function articleWrite(roles: Role[], work: (db: PoolClient, session: AdminSession) => Promise<NextResponse>) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "CMS login required" }, { status: 401 });
  if (!roles.includes(session.role)) return NextResponse.json({ error: session.role === "VIEWER" ? "Viewers can't change articles." : "Only administrators can do this." }, { status: 403 });
  const db = await pool.connect();
  try {
    await db.query("begin");
    await lockArticles(db);
    const response = await work(db, session);
    await db.query(response.ok ? "commit" : "rollback");
    return response;
  } catch (error) {
    await db.query("rollback").catch(() => {});
    if (error instanceof ArticleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  } finally { db.release(); }
}
