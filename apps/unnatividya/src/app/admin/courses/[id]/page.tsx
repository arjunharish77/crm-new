import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseEditForm } from "@/components/course-edit-form";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "Edit Course",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type CourseRow = {
  id: string;
  slug: string;
  university_id: string;
  name: string;
  short_name: string;
  level: "UG" | "PG";
  program_type: string;
  ugc_approved: boolean;
  stream: string;
  fee_inr: number | null;
  duration: string | null;
  status: "DRAFT" | "NEEDS_REVIEW" | "PUBLISHED" | "ARCHIVED";
  data: Record<string, unknown>;
  is_published: boolean;
};

type UniversityOption = {
  id: string;
  name: string;
};

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [courseResult, universityResult] = await Promise.all([
    query<CourseRow>(
      `select id, slug, university_id, name, short_name, level, program_type, ugc_approved,
              stream, fee_inr, duration, status, data, is_published
       from course
       where id = $1
       limit 1`,
      [id],
    ).catch(() => ({ rows: [] as CourseRow[] })),
    query<UniversityOption>(
      `select id, name
       from university
       order by name`,
    ).catch(() => ({ rows: [] as UniversityOption[] })),
  ]);
  const course = courseResult.rows[0];
  if (!course) notFound();

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>{course.name}</h1>
            <p>Edit course fee, source-backed details, structured content, and publish status.</p>
          </div>
          <Link className="btn ghost" href="/admin/courses">Back to courses</Link>
        </div>
        <section className="card admin-detail-card">
          <CourseEditForm
            universities={universityResult.rows}
            course={{
              id: course.id,
              slug: course.slug,
              universityId: course.university_id,
              name: course.name,
              shortName: course.short_name,
              level: course.level,
              programType: course.program_type,
              ugcApproved: course.ugc_approved,
              stream: course.stream,
              feeInr: course.fee_inr,
              duration: course.duration || "",
              status: course.status,
              isPublished: course.is_published,
              data: course.data,
            }}
          />
        </section>
      </div>
    </section>
  );
}
