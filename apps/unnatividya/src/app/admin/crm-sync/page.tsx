import type { Metadata } from "next";
import Link from "next/link";
import { CrmSyncConfigForm } from "@/components/crm-sync-config-form";
import { getCrmSyncConfig } from "@/lib/crm-sync";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "CRM Sync",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type ConfigRow = {
  is_enabled: boolean;
  auto_push_enabled: boolean;
  manual_push_enabled: boolean;
  api_base_url: string | null;
  endpoint_path: string | null;
};

export default async function CrmSyncPage() {
  const configModel = await getCrmSyncConfig();
  const config = await query<ConfigRow>(
    `select is_enabled, auto_push_enabled, manual_push_enabled, api_base_url, endpoint_path
     from crm_sync_config
     order by created_at
     limit 1`,
  ).catch(() => ({ rows: [] as ConfigRow[] }));
  const row = config.rows[0];

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>External API / CRM sync</h1>
            <p>Configure JSON payload handoff with merge-token mappings. Auto-push remains off until approved.</p>
          </div>
          <span className={row?.is_enabled ? "admin-status good" : "admin-status"}>{row?.is_enabled ? "Enabled" : "Disabled"}</span>
        </div>

        <div className="admin-grid">
          <article className="card admin-tile">
            <span className="admin-tag">Status</span>
            <h2>Current status</h2>
            <div className="admin-kv">
              <span>Sync</span><strong>{row?.is_enabled ? "Enabled" : "Disabled"}</strong>
              <span>Manual push</span><strong>{row?.manual_push_enabled ? "Enabled" : "Disabled"}</strong>
              <span>Auto-push</span><strong>{row?.auto_push_enabled ? "Enabled" : "Disabled"}</strong>
              <span>Endpoint</span><strong>{row?.api_base_url && row.endpoint_path ? `${row.api_base_url}${row.endpoint_path}` : "Not configured"}</strong>
            </div>
          </article>
          <article className="card admin-tile">
            <span className="admin-tag">Payload</span>
            <h2>Mapping builder</h2>
            <p>Configure JSON payloads with merge tokens and helpers.</p>
            <Link href="/admin/crm-sync/mappings" className="text-link">
              Open mappings
            </Link>
          </article>
          <article className="card admin-tile">
            <span className="admin-tag">Audit</span>
            <h2>History</h2>
            <p>View queued, processing, success, failed, skipped, and duplicate attempts.</p>
            <Link href="/admin/crm-sync/history" className="text-link">
              Open history
            </Link>
          </article>
        </div>

        <section className="card admin-detail-card" style={{ marginTop: 18 }}>
          <h2>Sync settings</h2>
          <CrmSyncConfigForm initialConfig={configModel} />
        </section>
      </div>
    </section>
  );
}
