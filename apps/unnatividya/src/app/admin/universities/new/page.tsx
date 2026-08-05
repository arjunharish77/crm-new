import type { Metadata } from "next";
import Link from "next/link";
import { UniversityEditForm } from "@/components/university-edit-form";

export const metadata: Metadata = {
  title: "New University",
  robots: { index: false, follow: false, nocache: true },
};

export default function NewUniversityPage() {
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
          <UniversityEditForm
            mode="create"
            university={{
              id: "",
              slug: "",
              name: "",
              shortName: "",
              city: "",
              status: "DRAFT",
              isPublished: false,
              data: { approvals: [], sourceUrls: [] },
            }}
          />
        </section>
      </div>
    </section>
  );
}
