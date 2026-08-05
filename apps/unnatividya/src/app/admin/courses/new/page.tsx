import type { Metadata } from "next";
import Link from "next/link";
import { CourseEditForm } from "@/components/course-edit-form";
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
  const universities = await query<UniversityOption>(
    `select id, name
     from university
     order by name`,
  ).catch(() => ({ rows: [] as UniversityOption[] }));

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
          <CourseEditForm
            mode="create"
            universities={universities.rows}
            course={{
              id: "",
              slug: "",
              universityId: universities.rows[0]?.id || "",
              name: "",
              shortName: "",
              level: "UG",
              programType: "DEGREE",
              ugcApproved: true,
              stream: "",
              feeInr: null,
              duration: "",
              status: "DRAFT",
              isPublished: false,
              data: {
                specializations: [],
                eligibility: "",
                curriculum: [],
                careerRoles: [],
                faqs: [],
                sourceUrls: [],
              },
            }}
          />
        </section>
      </div>
    </section>
  );
}
