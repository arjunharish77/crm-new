import type { Metadata } from "next";
import { CrmMappingForm } from "@/components/crm-mapping-form";
import { crmSyncTokens, getActiveMapping } from "@/lib/crm-sync";

export const metadata: Metadata = {
  title: "CRM Sync Mappings",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function CrmMappingsPage() {
  const activeMapping = await getActiveMapping();

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>Field mapping builder</h1>
            <p>Build the JSON request body with approved merge fields. Clicking a token copies it.</p>
          </div>
          <span className="admin-status">JSON</span>
        </div>
        <CrmMappingForm
          tokens={[...crmSyncTokens]}
          activeMapping={
            activeMapping
              ? {
                  name: activeMapping.name,
                  requestBodyTemplate: activeMapping.request_body_template,
                }
              : null
          }
        />
      </div>
    </section>
  );
}
