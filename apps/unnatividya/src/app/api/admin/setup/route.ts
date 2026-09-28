import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const schema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(10),
});

// Arbitrary fixed key for pg_advisory_xact_lock -- only ever used to serialize this one route's
// "is there already an admin?" check-then-insert, so any stable constant works.
const CMS_SETUP_LOCK_KEY = 78_412_003;

function setupTokenMatches(request: Request, configuredToken: string) {
  const provided = request.headers.get("x-cms-setup-token") || "";
  const expected = Buffer.from(configuredToken);
  const received = Buffer.from(provided);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  // F26 fix (WP16): this used to be ENABLED BY DEFAULT (only an explicit "=false" turned it off)
  // with no credential of any kind -- anyone who found this route before the real site owner
  // could POST their own name/email/password and become the first CMS admin. Now it requires an
  // explicit, owner-held one-use token; with no token configured, setup is disabled outright.
  const configuredToken = process.env.UNNATIVIDYA_CMS_SETUP_TOKEN;
  if (!configuredToken) {
    return NextResponse.json({ error: "Setup is disabled" }, { status: 403 });
  }
  if (!setupTokenMatches(request, configuredToken)) {
    return NextResponse.json({ error: "Invalid setup token" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid admin details" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    // Serializes concurrent setup attempts on the same fixed key so only one request at a time
    // can observe "no admin exists yet" and act on it -- without this, two simultaneous POSTs
    // (both racing to be first) could each pass the count check before either had inserted,
    // creating two first-admins instead of one.
    await client.query("select pg_advisory_xact_lock($1)", [CMS_SETUP_LOCK_KEY]);

    const existing = await client.query<{ count: string }>("select count(*)::text as count from cms_user");
    if (Number(existing.rows[0]?.count || 0) > 0) {
      await client.query("commit");
      return NextResponse.json({ error: "Admin already exists" }, { status: 409 });
    }

    const created = await client.query<{ id: string }>(
      `insert into cms_user (name, email, password_hash, role, two_factor_enabled)
       values ($1, $2, $3, 'ADMIN', true)
       returning id`,
      [parsed.data.name, parsed.data.email.toLowerCase(), hashPassword(parsed.data.password)],
    );
    await client.query(
      `insert into cms_audit_log (user_id, action, entity_type, entity_id, metadata)
       values ($1, 'CMS_ADMIN_CREATED', 'cms_user', $2, '{}'::jsonb)`,
      [created.rows[0].id, created.rows[0].id],
    );

    await client.query("commit");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
