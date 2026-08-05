import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UniversityEditForm } from "@/components/university-edit-form";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "Edit University",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type UniversityRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  city: string | null;
  status: "DRAFT" | "NEEDS_REVIEW" | "PUBLISHED" | "ARCHIVED";
  data: Record<string, unknown>;
  is_published: boolean;
};

export default async function EditUniversityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await query<UniversityRow>(
    `select id, slug, name, short_name, city, status, data, is_published
     from university
     where id = $1
     limit 1`,
    [id],
  ).catch(() => ({ rows: [] as UniversityRow[] }));
  const university = result.rows[0];
  if (!university) notFound();

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>{university.name}</h1>
            <p>Edit university metadata and publish status.</p>
          </div>
          <Link className="btn ghost" href="/admin/universities">Back to universities</Link>
        </div>
        <section className="card admin-detail-card">
          <UniversityEditForm
            university={{
              id: university.id,
              slug: university.slug,
              name: university.name,
              shortName: university.short_name,
              city: university.city || "",
              status: university.status,
              isPublished: university.is_published,
              data: university.data,
            }}
          />
        </section>
      </div>
    </section>
  );
}
