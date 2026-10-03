import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { CatalogReviewQueue, type QueueParams } from "@/components/catalog-review-queue";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "CMS Courses",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type CourseRow = {
  university_id: string;
  university_name: string | null;
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

export default async function AdminCoursesPage({ searchParams }: { searchParams: Promise<QueueParams> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const [courses, universities] = await Promise.all([
    query<CourseRow>(`select c.id, c.name, c.short_name, c.level, c.stream, c.fee_inr, c.duration, c.status, c.is_published, c.university_id, u.name as university_name from course c left join university u on u.id = c.university_id order by c.stream, c.name, c.id`),
    query<{ id: string; name: string }>("select id, name from university order by name, id"),
  ]);
  return <CatalogReviewQueue type="course" canCreate={session.role !== "VIEWER"} params={await searchParams} universities={universities.rows} records={courses.rows.map(course => ({
    id: course.id, name: course.name, searchText: `${course.name} ${course.id} ${course.short_name}`, status: course.status, published: course.is_published, universityId: course.university_id, universityName: course.university_name || "University unavailable",
    fields: [{ label: "Level", value: course.level }, { label: "Stream", value: course.stream }, { label: "Duration", value: course.duration || "Not provided" }, { label: "Recorded tuition (INR)", value: course.fee_inr ? `₹${Number(course.fee_inr).toLocaleString("en-IN")}` : "Fee pending" }],
  }))} />;
}
