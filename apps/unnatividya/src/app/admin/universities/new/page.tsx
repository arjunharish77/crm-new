import { getAdminSession } from "@/lib/admin-auth";
import type { Metadata } from "next";
import Link from "next/link";
import { CatalogCreateForm } from "@/components/catalog-create-form";

export const metadata: Metadata = {
  title: "New University",
  robots: { index: false, follow: false, nocache: true },
};

export default async function NewUniversityPage() {
  const session = await getAdminSession();
  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>New university</h1>
            <p>Create a draft university record. Keep public visibility off until approvals and source data are reviewed.</p>
          </div>
          <Link className="btn ghost" href="/admin/universities">Back to universities</Link>
        </div>
        <section className="card admin-detail-card">
          <CatalogCreateForm entityType="university" role={session?.role || "VIEWER"} />
        </section>
      </div>
    </section>
  );
}
