import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "CMS Dashboard",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type LeadRow = {
  id: string;
  name: string;
  email: string;
  course_id: string | null;
  email_otp_verified: boolean;
  crm_sync_status: string;
  created_at: string;
};

type CourseCountRow = { course_id: string; count: string };

function pctDelta(current: number, previous: number) {
  if (!previous) return current ? "new" : "flat";
  const delta = Math.round(((current - previous) / previous) * 100);
  return `${delta >= 0 ? "+" : ""}${delta}%`;
}

export default async function AdminDashboardPage() {
  const catalog = await getPublishedCatalog();
  const { courses } = catalog;
  const [weekly, verification, crm, recent, byProgram, contentQuality] = await Promise.all([
    query<{ this_week: string; prior_week: string }>(
      `select
         count(*) filter (where created_at >= now() - interval '7 days')::text as this_week,
         count(*) filter (where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days')::text as prior_week
       from lead_capture`,
    ),
    query<{ verified: string; total: string }>(
      `select count(*) filter (where email_otp_verified)::text as verified, count(*)::text as total from lead_capture`,
    ),
    query<{ synced: string; total: string }>(
      `select count(*) filter (where crm_sync_status = 'SUCCESS')::text as synced, count(*)::text as total from lead_capture`,
    ),
    query<LeadRow>(
      `select id, name, email, course_id, email_otp_verified, crm_sync_status, created_at
       from lead_capture order by created_at desc, id desc limit 6`,
    ),
    query<CourseCountRow>(
      `select course_id, count(*)::text as count from lead_capture
       where course_id is not null group by course_id order by count(*) desc, course_id limit 6`,
    ),
    query<{ total: string; published: string }>(`select count(*)::text as total, count(*) filter (where is_published)::text as published from course`),
  ]);

  const thisWeek = Number(weekly?.rows[0]?.this_week || 0);
  const priorWeek = Number(weekly?.rows[0]?.prior_week || 0);
  const verified = Number(verification?.rows[0]?.verified || 0);
  const totalLeads = Number(verification?.rows[0]?.total || 0);
  const synced = Number(crm?.rows[0]?.synced || 0);
  const crmTotal = Number(crm?.rows[0]?.total || 0);
  const publishedCourses = Number(contentQuality?.rows[0]?.published || 0);
  const totalCourses = Number(contentQuality?.rows[0]?.total || 0);

  const nameById = new Map(courses.map((course) => [course.id, course.name]));
  const maxProgramCount = Math.max(1, ...byProgram.rows.map((row) => Number(row.count)));

  return (
    <section className="admin-shell admin-dashboard">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>Dashboard</h1>
            <p>Review recent enquiries, delivery status and published content.</p>
          </div>
        </div>

        <nav className="dashboard-shortcuts" aria-label="Dashboard shortcuts">
          <Link className="btn primary" href="/admin/leads">Open lead inbox</Link>
          <Link className="btn secondary" href="/admin/content-quality">Review content checks</Link>
          <Link className="btn ghost" href="/admin/catalog-revisions">Review revisions</Link>
        </nav>
        <div className="admin-grid">
          <article className="card admin-tile">
            <span className="admin-tag">Leads in the last 7 days</span>
            <h2>{thisWeek}</h2>
            <p>{pctDelta(thisWeek, priorWeek)} vs the previous 7 days ({priorWeek})</p>
          </article>
          <article className="card admin-tile">
            <span className="admin-tag">Email verified · all time</span>
            <h2>{verified}</h2>
            <p>{totalLeads ? Math.round((verified / totalLeads) * 100) : 0}% of {totalLeads} total leads</p>
          </article>
          <article className="card admin-tile">
            <span className="admin-tag">CRM synced · all time</span>
            <h2>{synced}</h2>
            <p>{crmTotal ? Math.round((synced / crmTotal) * 100) : 0}% of {crmTotal} total leads delivered successfully</p>
          </article>
          <article className="card admin-tile">
            <span className="admin-tag">Course publication</span>
            <h2>{publishedCourses}/{totalCourses}</h2>
            <p>records have their published flag enabled — <Link href="/admin/content-quality" className="text-link" style={{ marginTop: 0 }}>full breakdown</Link></p>
          </article>
        </div>

        <div className="dashboard-sections">
          <section className="admin-table-card">
            <div className="admin-table-head">
              <h2>Recent leads</h2>
              <Link href="/admin/leads" className="text-link" style={{ marginTop: 0 }}>View all →</Link>
            </div>
            <div className="dashboard-leads">
              {recent.rows.map(lead => <article key={lead.id} className="dashboard-lead">
                <h3><Link href={`/admin/leads/${encodeURIComponent(lead.id)}`}>{lead.name}</Link></h3>
                <dl>
                  <div><dt>Program interest</dt><dd>{lead.course_id ? `${nameById.get(lead.course_id) || "Program"} (${lead.course_id})` : "Not selected yet"}</dd></div>
                  <div><dt>Email verification</dt><dd>{lead.email_otp_verified ? "Verified" : "Pending"}</dd></div>
                  <div><dt>CRM delivery</dt><dd>{lead.crm_sync_status}</dd></div>
                  <div><dt>Captured (India time)</dt><dd>{new Date(lead.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</dd></div>
                </dl>
              </article>)}
              {!recent.rows.length && <p>No enquiries captured yet. New enquiries appear here after contact details are saved.</p>}
            </div>
          </section>

          <section className="admin-table-card">
            <div className="admin-table-head">
              <h2>Top program interests</h2>
            </div>
            <div className="dashboard-programs"><p className="admin-muted">All-time leads with a program selected; up to six programs shown. Leads without a selection are excluded.</p>
              {byProgram.rows.map((row) => (
                <div key={row.course_id}>
                  <div className="dashboard-program-label">
                    <span>{nameById.get(row.course_id) || "Program"}<small>{row.course_id}</small></span>
                    <b>{row.count}</b>
                  </div>
                  <div aria-hidden="true" style={{ height: 6, borderRadius: 999, background: "#F0F0F0" }}>
                    <div style={{ height: 6, borderRadius: 999, background: "#544CC8", width: `${(Number(row.count) / maxProgramCount) * 100}%` }} />
                  </div>
                </div>
              ))}
              {!byProgram.rows.length ? <div style={{ fontSize: 13, color: "#707070" }}>No leads with a program attached yet.</div> : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
