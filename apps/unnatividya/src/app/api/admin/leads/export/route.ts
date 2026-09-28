import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { query } from "@/lib/db";

type LeadRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string | null;
  course_id: string | null;
  university_id: string | null;
  email_otp_verified: boolean;
  phone_otp_verified: boolean;
  crm_sync_status: string;
  created_at: string;
};

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// F26 fix (WP16): src/proxy.ts gates every /api/admin/* route, but only checks the cookie's own
// signature+expiry (it can't reach Postgres from the edge runtime) -- it never notices a
// deactivated admin or a forced revocation. This bulk PII export (name/email/phone for up to
// 2000 leads) is the single most sensitive route in this app, so it gets its own authoritative,
// DB-backed check on top rather than relying on proxy.ts alone. See getAdminSession's own comment
// in src/lib/admin-auth.ts for the full reasoning.
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "CMS admin login required" }, { status: 401 });
  }

  const leads = await query<LeadRow>(
    `select id, name, email, phone, city, course_id, university_id, email_otp_verified, phone_otp_verified, crm_sync_status, created_at
     from lead_capture
     order by created_at desc
     limit 2000`,
  ).catch(() => ({ rows: [] as LeadRow[] }));

  const header = ["Name", "Email", "Phone", "City", "Course", "University", "Email verified", "Phone verified", "CRM status", "Created"];
  const rows = leads.rows.map((lead) => [
    lead.name,
    lead.email,
    lead.phone,
    lead.city || "",
    lead.course_id || "",
    lead.university_id || "",
    lead.email_otp_verified ? "Verified" : "Pending",
    lead.phone_otp_verified ? "Verified" : "Pending",
    lead.crm_sync_status,
    new Date(lead.created_at).toISOString(),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="unnatividya-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
