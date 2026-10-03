import { getAdminSession } from "@/lib/admin-auth";
import type { Metadata } from "next";
import Link from "next/link";
import { CatalogCreateForm } from "@/components/catalog-create-form";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "New Course",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type UniversityOption = {
  id: string;
  name: string;
};

export default async function NewCoursePage() {
  const session = await getAdminSession();
  const universities = await query<UniversityOption>(
    `select id, name
     from university
     order by name`,
  );

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>New course</h1>
            <p>Create a draft course record. Publish only after fee, UGC approval, and source data are reviewed.</p>
          </div>
          <Link className="btn ghost" href="/admin/courses">Back to courses</Link>
        </div>
        <section className="card admin-detail-card">
          <CatalogCreateForm entityType="course" role={session?.role || "VIEWER"} universities={universities.rows} />
        </section>
      </div>
    </section>
  );
}
