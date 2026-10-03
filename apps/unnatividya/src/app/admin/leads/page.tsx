import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "CMS Leads",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type LeadRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string | null;
  email_otp_verified: boolean;
  phone_otp_verified: boolean;
  crm_sync_status: string;
  created_at: string;
};

type Search = Record<string, string | string[] | undefined>;
function first(value: Search[string]) { return (Array.isArray(value) ? value[0] : value) || ""; }
const PAGE_SIZE = 20;

export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 200);
  const verified = ["verified", "pending"].includes(first(params.verified)) ? first(params.verified) : "";
  const inputPage = /^\d+$/.test(first(params.page)) ? Number(first(params.page)) : 1;
  const requestedPage = Number.isSafeInteger(inputPage) && inputPage > 0 ? inputPage : 1;
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = `($1 = '' or name ilike $2 or email ilike $2) and ($3 = '' or ($3 = 'verified' and email_otp_verified = true) or ($3 = 'pending' and email_otp_verified = false))`;
  const values = [q, pattern, verified];
  const result = await query<{ total: number }>(`select count(*)::int as total from lead_capture where ${where}`, values);
  const total = result.rows[0].total;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const leads = await query<LeadRow>(
    `select id, name, email, phone, city, email_otp_verified, phone_otp_verified, crm_sync_status, created_at
     from lead_capture where ${where} order by created_at desc, id desc limit $4 offset $5`,
    [...values, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  function pageHref(target: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (verified) next.set("verified", verified);
    next.set("page", String(target));
    return `/admin/leads?${next}`;
  }

  return (
    <section className="admin-shell lead-inbox">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>Lead inbox</h1>
            <p>Captured leads are saved before verification and marked email/phone verified independently.</p>
          </div>
          <div className="admin-count">{total} matching leads</div>
        </div>

        <div className="lead-inbox-toolbar">
          <form action="/admin/leads" method="get" role="search" aria-label="Search lead inbox">
            <label htmlFor="lead-inbox-query">Search leads by name or email</label>
            <div><input id="lead-inbox-query" type="search" name="q" defaultValue={q} maxLength={200} /></div>
            <label className="lead-verification-label" htmlFor="lead-email-status">Email verification</label>
            <select id="lead-email-status" name="verified" defaultValue={verified}><option value="">All email statuses</option><option value="verified">Verified email</option><option value="pending">Pending verification</option></select>
            <div style={{ marginTop: 16 }}><button className="btn primary" type="submit">Search leads</button>{(q || verified) && <Link className="text-link" href="/admin/leads">Clear filters</Link>}</div>
          </form>
          <div><Link href="/api/admin/leads/export" prefetch={false} className="btn secondary">Export latest leads (CSV)</Link><p className="admin-muted">Up to 2,000 latest leads; search filters do not apply to this export.</p></div>
        </div>

        <p role="status">{total ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} leads` : "No leads found"}</p>
        {leads.rows.length ? <div className="lead-inbox-cards">{leads.rows.map(lead => <article className="card admin-detail-card" key={lead.id}>
          <h2><Link href={`/admin/leads/${lead.id}`}>{lead.name}</Link></h2>
          <dl>
            <div><dt>Email</dt><dd>{lead.email}</dd></div>
            <div><dt>Phone</dt><dd>{lead.phone}</dd></div>
            <div><dt>City</dt><dd>{lead.city || "Not provided"}</dd></div>
            <div><dt>Email verification</dt><dd><span className={lead.email_otp_verified ? "admin-status good" : "admin-status"}>{lead.email_otp_verified ? "Verified" : "Pending"}</span></dd></div>
            <div><dt>Phone verification</dt><dd><span className={lead.phone_otp_verified ? "admin-status good" : "admin-status"}>{lead.phone_otp_verified ? "Verified" : "Pending"}</span></dd></div>
            <div><dt>CRM delivery</dt><dd><span className="admin-status">{lead.crm_sync_status}</span></dd></div>
            <div><dt>Captured (India time)</dt><dd>{new Date(lead.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</dd></div>
          </dl>
          <Link className="btn secondary" href={`/admin/leads/${lead.id}`} aria-label={`View enquiry: ${lead.name}`}>View enquiry</Link>
        </article>)}</div> : <section className="card admin-detail-card"><h2>{q || verified ? "No matching enquiries" : "No enquiries captured yet"}</h2><p>{q || verified ? "Try another name, email or verification status." : "New website enquiries will appear here after contact details are saved."}</p>{(q || verified) && <Link className="text-link" href="/admin/leads">View all leads</Link>}</section>}
        {total > PAGE_SIZE && <nav aria-label="Lead pages" className="source-import-pagination">
          {page > 1 && <Link className="btn ghost" href={pageHref(page - 1)}>Previous page</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link className="btn ghost" href={pageHref(page + 1)}>Next page</Link>}
        </nav>}

      </div>
    </section>
  );
}
