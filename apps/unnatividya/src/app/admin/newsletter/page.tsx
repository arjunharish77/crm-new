import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { AdminState, statusTone } from "@/components/admin-state";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Newsletter", robots: { index: false, follow: false, nocache: true } };

const LABEL: Record<string, string> = { PENDING: "Waiting for confirmation", CONFIRMED: "Confirmed", UNSUBSCRIBED: "Unsubscribed" };

export default async function NewsletterAdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const counts = Object.fromEntries((await query<{ status: string; count: number }>("select status, count(*)::int as count from newsletter_subscriber group by status")).rows.map((row) => [row.status, row.count]));
  const recent = (await query<{ email: string; status: string; source: string; created_at: string }>("select email, status, source, created_at from newsletter_subscriber order by created_at desc limit 50")).rows;
  const marketingLeads = (await query<{ count: number }>("select count(*)::int as count from lead_capture where marketing_consent")).rows[0]?.count || 0;
  return <section className="admin-shell"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">Marketing</span><h1>Newsletter</h1>
      <p>New subscribers join from the footer or article sign-up and confirm by email. Earlier Apply now subscribers remain in this list until they unsubscribe. Each export row has its own unsubscribe link: include it in every email you send.</p></div>
      {session.role === "ADMIN" ? <Link className="btn primary" href="/api/admin/newsletter/export" prefetch={false}>Export confirmed subscribers (CSV)</Link> : null}
    </div>
    <ul className="checklist-summary" aria-label="Subscribers">
      {["CONFIRMED", "PENDING", "UNSUBSCRIBED"].map((status) => <li key={status}><strong>{counts[status] || 0}</strong> {LABEL[status].toLowerCase()}</li>)}
      <li><strong>{marketingLeads}</strong> enquiries with WhatsApp/newsletter consent</li>
    </ul>
    <div className="card admin-table-region">
      <table className="checklist-table">
        <caption className="sr-only">Latest 50 sign-ups</caption>
        <thead><tr><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Source</th><th scope="col">Signed up</th></tr></thead>
        <tbody>{recent.length ? recent.map((row) => <tr key={row.email}><th scope="row">{row.email}</th><td><AdminState tone={statusTone(row.status)}>{LABEL[row.status]}</AdminState></td><td>{row.source === "LEAD_FORM" ? "Apply now form" : "Sign-up form"}</td><td>{new Date(row.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td></tr>)
          : <tr><td colSpan={4}>No sign-ups yet.</td></tr>}</tbody>
      </table>
    </div>
  </div></section>;
}
