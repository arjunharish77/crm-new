import { NextResponse } from "next/server";
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

// Reachable only with a valid admin session -- src/proxy.ts already gates every /api/admin/*
// route (including this one) and returns 401 before this handler ever runs otherwise.
export async function GET() {
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
