import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "CMS Courses",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type CourseRow = {
  id: string;
  name: string;
  short_name: string;
  level: string;
  stream: string;
  fee_inr: number | null;
  duration: string | null;
  status: string;
  is_published: boolean;
};

export default async function AdminCoursesPage() {
  const courses = await query<CourseRow>(
    `select id, name, short_name, level, stream, fee_inr, duration, status, is_published
     from course
     order by stream, name`,
  ).catch(() => ({ rows: [] as CourseRow[] }));

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>Course review queue</h1>
            <p>Imported course records stay draft until a reviewer confirms source, fee, approvals, and page copy.</p>
          </div>
          <div className="course-actions" style={{ marginTop: 0 }}>
            <div className="admin-count">{courses.rows.length} records</div>
            <Link className="btn primary" href="/admin/courses/new">New course</Link>
          </div>
        </div>

        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                {["Course", "Level", "Stream", "Duration", "Fee", "Status", "Published", "Action"].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {courses.rows.map((course) => (
                <tr key={course.id}>
                  <td>
                    <strong>{course.name}</strong>
                    <span>{course.short_name}</span>
                  </td>
                  <td>{course.level}</td>
                  <td>{course.stream}</td>
                  <td>{course.duration || "-"}</td>
                  <td>{course.fee_inr ? `₹${course.fee_inr.toLocaleString("en-IN")}` : "Fee pending"}</td>
                  <td><span className="admin-status">{course.status}</span></td>
                  <td>{course.is_published ? "Yes" : "No"}</td>
                  <td><Link className="text-link" href={`/admin/courses/${course.id}`}>Edit</Link></td>
                </tr>
              ))}
              {!courses.rows.length ? (
                <tr>
                  <td colSpan={8}>No courses available.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
