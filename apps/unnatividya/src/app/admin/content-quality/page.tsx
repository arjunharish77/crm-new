import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "Content Quality",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type CourseQualityRow = {
  id: string;
  name: string;
  status: string;
  is_published: boolean;
  fee_inr: number | null;
  duration: string | null;
  data: Record<string, unknown>;
};

type UniversityQualityRow = {
  id: string;
  name: string;
  status: string;
  is_published: boolean;
  data: Record<string, unknown>;
};

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function courseIssues(course: CourseQualityRow) {
  const data = course.data || {};
  const issues = [
    !course.fee_inr ? "Exact fee missing" : "",
    !course.duration ? "Duration missing" : "",
    !hasValue(data.sourceReview) ? "Source facts not reviewed/applied" : "",
    !hasValue(data.eligibility) ? "Eligibility block missing" : "",
    !hasValue(data.curriculum) ? "Curriculum block missing" : "",
    !hasValue(data.careers) ? "Career outcomes block missing" : "",
    !hasValue(data.faqs) ? "FAQ block missing" : "",
    course.is_published && course.status !== "PUBLISHED" ? "Published flag conflicts with status" : "",
  ].filter(Boolean);
  return issues;
}

function universityIssues(university: UniversityQualityRow) {
  const data = university.data || {};
  return [
    !hasValue(data.sourceReview) ? "Source facts not reviewed/applied" : "",
    !hasValue(data.approvals) ? "Approval details missing" : "",
    !hasValue(data.overview) ? "Overview block missing" : "",
    !hasValue(data.faqs) ? "FAQ block missing" : "",
    university.is_published && university.status !== "PUBLISHED" ? "Published flag conflicts with status" : "",
  ].filter(Boolean);
}

export default async function ContentQualityPage() {
  const [courses, universities] = await Promise.all([
    query<CourseQualityRow>(
      `select id, name, status, is_published, fee_inr, duration, data
       from course
       order by is_published desc, status, name`,
    ).catch(() => ({ rows: [] as CourseQualityRow[] })),
    query<UniversityQualityRow>(
      `select id, name, status, is_published, data
       from university
       order by is_published desc, status, name`,
    ).catch(() => ({ rows: [] as UniversityQualityRow[] })),
  ]);

  const courseResults = courses.rows.map((course) => ({ course, issues: courseIssues(course) }));
  const universityResults = universities.rows.map((university) => ({ university, issues: universityIssues(university) }));
  const totalIssues = courseResults.reduce((sum, item) => sum + item.issues.length, 0) +
    universityResults.reduce((sum, item) => sum + item.issues.length, 0);
  const publishReadyCourses = courseResults.filter((item) => item.issues.length === 0).length;
  const publishReadyUniversities = universityResults.filter((item) => item.issues.length === 0).length;

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">SEO Controls</span>
            <h1>Content quality</h1>
            <p>Review source confidence, missing content blocks, publish conflicts, and SEO readiness before pages are indexed.</p>
          </div>
          <div className="course-actions" style={{ marginTop: 0 }}>
            <div className={totalIssues ? "admin-count warning" : "admin-count"}>{totalIssues} open checks</div>
          </div>
        </div>

        <div className="admin-grid">
          <article className="card admin-tile">
            <span className="admin-tag">Courses</span>
            <h2>{publishReadyCourses} ready</h2>
            <p>{courses.rows.length - publishReadyCourses} course pages need editorial or source review.</p>
          </article>
          <article className="card admin-tile">
            <span className="admin-tag">Universities</span>
            <h2>{publishReadyUniversities} ready</h2>
            <p>{universities.rows.length - publishReadyUniversities} university pages need editorial or source review.</p>
          </article>
          <article className="card admin-tile">
            <span className="admin-tag">Indexing</span>
            <h2>{totalIssues ? "Hold thin pages" : "Ready to submit"}</h2>
            <p>Only source-reviewed, complete pages should be submitted through sitemap and IndexNow.</p>
          </article>
        </div>

        <QualityTable
          title="Course checks"
          empty="No course records found."
          rows={courseResults.map(({ course, issues }) => ({
            id: course.id,
            label: course.name,
            status: course.status,
            published: course.is_published,
            issues,
            href: `/admin/courses/${course.id}`,
          }))}
        />

        <QualityTable
          title="University checks"
          empty="No university records found."
          rows={universityResults.map(({ university, issues }) => ({
            id: university.id,
            label: university.name,
            status: university.status,
            published: university.is_published,
            issues,
            href: `/admin/universities/${university.id}`,
          }))}
        />
      </div>
    </section>
  );
}

function QualityTable({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; label: string; status: string; published: boolean; issues: string[]; href: string }>;
}) {
  return (
    <section className="admin-table-card" style={{ marginTop: 18 }}>
      <div className="admin-table-head">
        <h2>{title}</h2>
        <span className="admin-muted">{rows.filter((row) => row.issues.length).length} records need attention</span>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            {["Record", "Status", "Published", "Quality checks", "Action"].map((head) => <th key={head}>{head}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><strong>{row.label}</strong><span>{row.id}</span></td>
              <td><span className="admin-status">{row.status}</span></td>
              <td>{row.published ? "Yes" : "No"}</td>
              <td>
                {row.issues.length ? (
                  <div className="quality-chip-list">
                    {row.issues.map((issue) => <span className="quality-chip" key={issue}>{issue}</span>)}
                  </div>
                ) : (
                  <span className="admin-status good">Ready</span>
                )}
              </td>
              <td><Link className="text-link" href={row.href}>Fix</Link></td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={5}>{empty}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
