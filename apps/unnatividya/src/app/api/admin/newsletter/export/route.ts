import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { unsubscribeUrl } from "@/lib/newsletter";

// Confirmed subscribers only, each with a working unsubscribe link, for whichever tool sends the
// newsletter. Administrators only: this is a bulk export of personal data.
function csvCell(value: string) {
  // A leading = or @ (or + / - not starting a number) would run as a formula in a spreadsheet.
  const safe = /^(?:[=@\t\r]|[+-](?!\d))/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "CMS admin login required" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Only administrators can export subscribers." }, { status: 403 });
  const rows = (await query<{ id: string; email: string; source: string; consent_version: string; confirmed_at: string }>(
    "select id, email, source, consent_version, confirmed_at from newsletter_subscriber where status='CONFIRMED' order by confirmed_at desc",
  )).rows;
  const header = ["Email", "Source", "Consent version", "Confirmed", "Unsubscribe URL"];
  const csv = [header, ...rows.map((row) => [row.email, row.source, row.consent_version, new Date(row.confirmed_at).toISOString(), unsubscribeUrl(row.id)])]
    .map((row) => row.map(csvCell).join(",")).join("\n");
  return new NextResponse(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="unnatividya-newsletter-${new Date().toISOString().slice(0, 10)}.csv"`,
    "Cache-Control": "no-store",
  } });
}
