import type { Metadata } from "next";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "CRM Sync History",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type Attempt = {
  id: string;
  trigger_type: string;
  status: string;
  response_status: number | null;
  crm_record_id: string | null;
  error_message: string | null;
  created_at: string;
};

export default async function CrmSyncHistoryPage() {
  const attempts = await query<Attempt>(
    `select id, trigger_type, status, response_status, crm_record_id, error_message, created_at
     from crm_sync_attempt
     order by created_at desc
     limit 50`,
  ).catch(() => ({ rows: [] as Attempt[] }));

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>CRM sync history</h1>
            <p>Audit queued, processing, success, failed, skipped, and duplicate API handoff attempts.</p>
          </div>
          <div className="admin-count">{attempts.rows.length} latest</div>
        </div>

        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                {["Trigger", "Status", "HTTP", "CRM record", "Message", "Created"].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attempts.rows.map((attempt) => (
                <tr key={attempt.id}>
                  <td><strong>{attempt.trigger_type}</strong><span>{attempt.id.slice(0, 8)}</span></td>
                  <td><span className={attempt.status === "success" ? "admin-status good" : "admin-status"}>{attempt.status}</span></td>
                  <td>{attempt.response_status || "-"}</td>
                  <td>{attempt.crm_record_id || "-"}</td>
                  <td>{attempt.error_message || "No response yet"}</td>
                  <td>{new Date(attempt.created_at).toLocaleString("en-IN")}</td>
                </tr>
              ))}
              {!attempts.rows.length ? (
                <tr>
                  <td colSpan={6}>No sync attempts yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
