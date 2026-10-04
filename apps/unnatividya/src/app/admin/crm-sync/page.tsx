import type { Metadata } from "next";
import Link from "next/link";
import { CrmSyncConfigForm } from "@/components/crm-sync-config-form";
import { getCrmSyncConfig } from "@/lib/crm-sync";


export const metadata: Metadata = {
  title: "CRM Sync",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function CrmSyncPage() {
  const configModel = await getCrmSyncConfig();
  return (
    <section className="admin-shell crm-config-page">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>External API / CRM sync</h1>
            <p>Set the CRM destination, review payload mappings and check delivery history. Saving settings does not test the connection.</p>
          </div>
          <span className={configModel.isEnabled ? "admin-status good" : "admin-status"}>{configModel.isEnabled ? "Enabled" : "Disabled"}</span>
        </div>

        <div className="admin-grid">
          <article className="card admin-tile">
            <span className="admin-tag">Status</span>
            <h2>Current status</h2>
            <div className="admin-kv">
              <span>Sync</span><strong>{configModel.isEnabled ? "Enabled" : "Disabled"}</strong>
              <span>Manual push</span><strong>{configModel.manualPushEnabled ? "Enabled" : "Disabled"}</strong>
              <span>Auto-push</span><strong>{configModel.autoPushEnabled ? "Enabled" : "Disabled"}</strong>
              <span>Endpoint</span><strong>{configModel.apiBaseUrl ? `${configModel.apiBaseUrl}${configModel.endpointPath}` : "Not configured"}</strong>
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
