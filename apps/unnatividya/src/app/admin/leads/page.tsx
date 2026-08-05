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

export default async function AdminLeadsPage() {
  const leads = await query<LeadRow>(
    `select id, name, email, phone, city, email_otp_verified, phone_otp_verified, crm_sync_status, created_at
     from lead_capture
     order by created_at desc
     limit 50`,
  ).catch(() => ({ rows: [] as LeadRow[] }));

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>Lead inbox</h1>
            <p>Captured leads are saved before verification and marked email/phone verified independently.</p>
          </div>
          <div className="admin-count">{leads.rows.length} latest</div>
        </div>

        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                {["Name", "Email", "Phone", "City", "Email verified", "Phone verified", "CRM", "Created"].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.rows.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link href={`/admin/leads/${lead.id}`} className="text-link" style={{ marginTop: 0 }}>{lead.name}</Link>
                    <span>{lead.id.slice(0, 8)}</span>
                  </td>
                  <td>{lead.email}</td>
                  <td>{lead.phone}</td>
                  <td>{lead.city || "-"}</td>
                  <td><span className={lead.email_otp_verified ? "admin-status good" : "admin-status"}>{lead.email_otp_verified ? "Verified" : "Pending"}</span></td>
                  <td><span className={lead.phone_otp_verified ? "admin-status good" : "admin-status"}>{lead.phone_otp_verified ? "Verified" : "Pending"}</span></td>
                  <td><span className="admin-status">{lead.crm_sync_status}</span></td>
                  <td>{new Date(lead.created_at).toLocaleString("en-IN")}</td>
                </tr>
              ))}
              {!leads.rows.length ? (
                <tr>
                  <td colSpan={8}>No leads captured yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
