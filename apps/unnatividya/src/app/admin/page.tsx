import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";
import { courses } from "@/data/catalog";

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
  const [weekly, verification, crm, recent, byProgram, contentQuality] = await Promise.all([
    query<{ this_week: string; prior_week: string }>(
      `select
         count(*) filter (where created_at >= now() - interval '7 days')::text as this_week,
         count(*) filter (where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days')::text as prior_week
       from lead_capture`,
    ).catch(() => null),
    query<{ verified: string; total: string }>(
      `select count(*) filter (where email_otp_verified)::text as verified, count(*)::text as total from lead_capture`,
    ).catch(() => null),
    query<{ synced: string; total: string }>(
      `select count(*) filter (where crm_sync_status = 'SUCCESS')::text as synced, count(*)::text as total from lead_capture`,
    ).catch(() => null),
    query<LeadRow>(
      `select id, name, email, course_id, email_otp_verified, crm_sync_status, created_at
       from lead_capture order by created_at desc limit 6`,
    ).catch(() => ({ rows: [] as LeadRow[] })),
    query<CourseCountRow>(
      `select course_id, count(*)::text as count from lead_capture
       where course_id is not null group by course_id order by count(*) desc limit 6`,
    ).catch(() => ({ rows: [] as CourseCountRow[] })),
    query<{ total: string; published: string }>(`select count(*)::text as total, count(*) filter (where is_published)::text as published from course`).catch(() => null),
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
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>Dashboard</h1>
            <p>Real counts from the live database — no demo numbers.</p>
          </div>
        </div>

        <div className="admin-grid">
          <article className="card admin-tile">
            <span className="admin-tag">Leads this week</span>
            <h2>{thisWeek}</h2>
            <p>{pctDelta(thisWeek, priorWeek)} vs the previous 7 days ({priorWeek})</p>
          </article>
          <article className="card admin-tile">
            <span className="admin-tag">Email OTP verified</span>
            <h2>{verified}</h2>
            <p>{totalLeads ? Math.round((verified / totalLeads) * 100) : 0}% of {totalLeads} total leads</p>
          </article>
          <article className="card admin-tile">
            <span className="admin-tag">CRM synced</span>
            <h2>{synced}</h2>
            <p>{crmTotal ? Math.round((synced / crmTotal) * 100) : 0}% of leads pushed successfully</p>
          </article>
          <article className="card admin-tile">
            <span className="admin-tag">Content readiness</span>
            <h2>{publishedCourses}/{totalCourses}</h2>
            <p>course pages published — <Link href="/admin/content-quality" className="text-link" style={{ marginTop: 0 }}>full breakdown</Link></p>
          </article>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginTop: 24 }} className="grid-mobile-stack">
          <section className="admin-table-card">
            <div className="admin-table-head">
              <h2>Recent leads</h2>
              <Link href="/admin/leads" className="text-link" style={{ marginTop: 0 }}>View all →</Link>
            </div>
            <table className="admin-table">
              <thead>
                <tr>{["Name", "Interest", "Verified", "CRM", "Created"].map((head) => <th key={head}>{head}</th>)}</tr>
              </thead>
              <tbody>
                {recent.rows.map((lead) => (
                  <tr key={lead.id}>
                    <td><Link href={`/admin/leads/${lead.id}`} className="text-link" style={{ marginTop: 0 }}>{lead.name}</Link></td>
                    <td>{lead.course_id ? nameById.get(lead.course_id) || lead.course_id : "—"}</td>
                    <td><span className={lead.email_otp_verified ? "admin-status good" : "admin-status"}>{lead.email_otp_verified ? "Verified" : "Pending"}</span></td>
                    <td><span className="admin-status">{lead.crm_sync_status}</span></td>
                    <td>{new Date(lead.created_at).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
                {!recent.rows.length ? <tr><td colSpan={5}>No leads captured yet.</td></tr> : null}
              </tbody>
            </table>
          </section>

          <section className="admin-table-card">
            <div className="admin-table-head">
              <h2>Leads by program</h2>
            </div>
            <div style={{ padding: "4px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {byProgram.rows.map((row) => (
                <div key={row.course_id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#363634", marginBottom: 4 }}>
                    <span>{nameById.get(row.course_id) || row.course_id}</span>
                    <b>{row.count}</b>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: "#F0F0F0" }}>
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
