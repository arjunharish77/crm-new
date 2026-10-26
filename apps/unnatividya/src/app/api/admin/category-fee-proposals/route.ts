import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { CategoryFeeBatchChangedError, stageCategoryFeeBatch } from "@/lib/category-fee-batch";

const schema = z.object({ courseIds: z.array(z.string().min(1).max(200)).min(1).max(18), reviewedSources: z.literal(true) }).strict();

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "CMS login required" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Only an administrator can stage these fee proposals." }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON request required." }, { status: 415 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Set(parsed.data.courseIds).size !== parsed.data.courseIds.length) return NextResponse.json({ error: "Review the sources and refresh the fee list before staging." }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const staged = await stageCategoryFeeBatch(client, session.userId, parsed.data.courseIds);
    await client.query("commit");
    return NextResponse.json({ staged: staged.length, revisionIds: staged }, { status: 201 });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (error instanceof CategoryFeeBatchChangedError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  } finally { client.release(); }
}
