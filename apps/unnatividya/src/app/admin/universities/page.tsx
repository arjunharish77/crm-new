import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "CMS Universities",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type UniversityRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  city: string | null;
  status: string;
  is_published: boolean;
  updated_at: string;
};

export default async function AdminUniversitiesPage() {
  const universities = await query<UniversityRow>(
    `select id, slug, name, short_name, city, status, is_published, updated_at
     from university
     order by name`,
  ).catch(() => ({ rows: [] as UniversityRow[] }));

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>University review queue</h1>
            <p>Manage university source data, status, and publish visibility for public pages.</p>
          </div>
          <div className="course-actions" style={{ marginTop: 0 }}>
            <div className="admin-count">{universities.rows.length} records</div>
            <Link className="btn primary" href="/admin/universities/new">New university</Link>
          </div>
        </div>

        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                {["University", "City", "Slug", "Status", "Published", "Updated", "Action"].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {universities.rows.map((university) => (
                <tr key={university.id}>
                  <td><strong>{university.name}</strong><span>{university.short_name}</span></td>
                  <td>{university.city || "-"}</td>
                  <td>{university.slug}</td>
                  <td><span className="admin-status">{university.status}</span></td>
                  <td>{university.is_published ? "Yes" : "No"}</td>
                  <td>{new Date(university.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                  <td><Link className="text-link" href={`/admin/universities/${university.id}`}>Edit</Link></td>
                </tr>
              ))}
              {!universities.rows.length ? (
                <tr>
                  <td colSpan={7}>No universities available.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
