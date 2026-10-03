import feeIssues from "@/data/fee-review-issues.json";
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
  const quality = data.dataQuality as Record<string, unknown> | undefined;
  const issues = [
    feeIssues.some((issue) => issue.courseId === course.id) ? "Fee terms have unresolved source findings; review the course notice" : "",
    !course.fee_inr ? "Exact fee missing" : "",
    !course.duration ? "Duration missing" : "",
    !hasValue(data.sourceReview) ? "Source notes missing; source review required" : "",
    !hasValue(data.eligibility) ? "Eligibility block missing" : quality?.eligibility !== "verified" ? "Eligibility needs official-source review" : "",
    !hasValue(data.curriculum) ? "Curriculum block missing" : quality?.curriculum !== "verified" ? "Curriculum needs official-source review; public outline is illustrative" : "",
    !hasValue(data.careerRoles) ? "Career roles block missing" : "",
    !hasValue(data.faqs) ? "FAQ block missing" : "",
    course.is_published && course.status !== "PUBLISHED" ? "Published flag conflicts with status" : "",
  ].filter(Boolean);
  return issues;
}

function universityIssues(university: UniversityQualityRow) {
  const data = university.data || {};
  return [
    !hasValue(data.sourceReview) ? "Source notes missing; source review required" : "",
    !hasValue(data.approvals) ? "Approval details missing" : "",
    !hasValue(data.overview) ? "Overview block missing" : "",
    !hasValue(data.faqs) ? "FAQ block missing" : "",
    university.is_published && university.status !== "PUBLISHED" ? "Published flag conflicts with status" : "",
  ].filter(Boolean);
}

type QualityRecord = { id: string; label: string; type: "course" | "university"; status: string; published: boolean; issues: string[]; href: string };
type SearchParams = Record<string, string | string[] | undefined>;
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }

export default async function ContentQualityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 200);
  const type = ["course", "university"].includes(first(params.type)) ? first(params.type) : "";
  const review = ["open", "clear", "fees"].includes(first(params.review)) ? first(params.review) : "";
  const [courses, universities] = await Promise.all([
    query<CourseQualityRow>(
      `select id, name, status, is_published, fee_inr, duration, data
       from course
       order by is_published desc, status, name`,
    ),
    query<UniversityQualityRow>(
      `select id, name, status, is_published, data
       from university
       order by is_published desc, status, name`,
    ),
  ]);

  const courseResults = courses.rows.map((course) => ({ course, issues: courseIssues(course) }));
  const universityResults = universities.rows.map((university) => ({ university, issues: universityIssues(university) }));
  const totalIssues = courseResults.reduce((sum, item) => sum + item.issues.length, 0) +
    universityResults.reduce((sum, item) => sum + item.issues.length, 0);
  const publishReadyCourses = courseResults.filter((item) => item.issues.length === 0).length;
  const publishReadyUniversities = universityResults.filter((item) => item.issues.length === 0).length;

  const records: QualityRecord[] = [
    ...courseResults.map(({ course, issues }) => ({ id: course.id, label: course.name, type: "course" as const, status: course.status, published: course.is_published, issues, href: `/admin/courses/${encodeURIComponent(course.id)}` })),
    ...universityResults.map(({ university, issues }) => ({ id: university.id, label: university.name, type: "university" as const, status: university.status, published: university.is_published, issues, href: `/admin/universities/${encodeURIComponent(university.id)}` })),
  ];
  const filtered = records.filter(record => {
    if (q && !`${record.label} ${record.id}`.toLocaleLowerCase().includes(q.toLocaleLowerCase())) return false;
    if (type && record.type !== type) return false;
    if (review === "open" && !record.issues.length) return false;
    if (review === "clear" && record.issues.length) return false;
    if (review === "fees" && !(record.type === "course" && feeIssues.some(issue => issue.courseId === record.id))) return false;
    return true;
  });
  const hasFilters = Boolean(q || type || review);
  return (
    <section className="admin-shell content-quality">
      <div className="container">
        <div className="admin-page-head">
          <div><span className="eyebrow">Editorial review</span><h1>Content quality</h1>
            <p>Find missing content, unresolved source findings and publication conflicts. These checks guide review; they do not certify accuracy or control indexing.</p>
          </div>
          <div className={totalIssues ? "admin-count warning" : "admin-count"}>{totalIssues} open checks across all records</div>
        </div>
        <div className="admin-grid">
          <article className="card admin-tile"><span className="admin-tag">Courses</span><h2>{courses.rows.length - publishReadyCourses} need review</h2><p>{publishReadyCourses} of {courses.rows.length} have no listed checks.</p></article>
          <article className="card admin-tile"><span className="admin-tag">Universities</span><h2>{universities.rows.length - publishReadyUniversities} need review</h2><p>{publishReadyUniversities} of {universities.rows.length} have no listed checks.</p></article>
          <article className="card admin-tile"><span className="admin-tag">Review scope</span><h2>Confirm before publishing</h2><p>Attached source notes do not establish verification. Review current eligibility, recognition, fees and intake evidence separately.</p></article>
        </div>
        <form className="card quality-filters" action="/admin/content-quality" method="get" role="search" aria-label="Filter content checks">
          <div><label htmlFor="quality-query">Name or record ID</label><input id="quality-query" name="q" type="search" maxLength={200} defaultValue={q} /></div>
          <div><label htmlFor="quality-type">Record type</label><select id="quality-type" name="type" defaultValue={type}><option value="">All records</option><option value="course">Courses</option><option value="university">Universities</option></select></div>
          <div><label htmlFor="quality-review">Review status</label><select id="quality-review" name="review" defaultValue={review}><option value="">All checks</option><option value="open">Needs review</option><option value="fees">Unresolved fee findings</option><option value="clear">No listed checks</option></select></div>
          <div className="quality-filter-actions"><button className="btn primary" type="submit">Filter records</button>{hasFilters && <Link className="text-link" href="/admin/content-quality">Clear filters</Link>}</div>
        </form>
        <p role="status">Showing {filtered.length} of {records.length} records. Summary counts above cover all records.</p>
        <div className="quality-records">
          {filtered.map(row => <article className="card quality-record" key={`${row.type}:${row.id}`}>
            <div><span className="admin-tag">{row.type === "course" ? "Course" : "University"}</span><h2>{row.label}</h2><p className="admin-muted">{row.id}</p></div>
            <dl><div><dt>Record status</dt><dd>{row.status.replaceAll("_", " ")}</dd></div><div><dt>Published flag</dt><dd>{row.published ? "Yes" : "No"}</dd></div></dl>
            {row.issues.length ? <details><summary>{row.issues.length} open checks</summary><ul>{row.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details> : <p>No listed checks. Complete editorial verification before publication.</p>}
            <div className="quality-record-actions"><Link className="btn secondary" href={row.href} aria-label={`Review record: ${row.label} (${row.id})`}>Review record</Link><Link className="text-link" href={`/admin/catalog-revisions?type=${row.type}&id=${encodeURIComponent(row.id)}`} aria-label={`View revisions: ${row.label} (${row.id})`}>View revisions</Link></div>
          </article>)}
        </div>
        {!filtered.length && <section className="card quality-empty"><h2>{hasFilters ? "No matching records" : "No catalog records yet"}</h2><p>{hasFilters ? "Try another name, record type or review status." : "Course and university checks appear here when records are added."}</p>{hasFilters && <Link className="btn secondary" href="/admin/content-quality">View all records</Link>}</section>}
      </div>
    </section>
  );
}
