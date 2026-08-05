import type { Metadata } from "next";
import Link from "next/link";
import { CourseExplorer } from "@/components/course-explorer";
import { courses, courseWithUniversity } from "@/data/catalog";

export const metadata: Metadata = {
  title: "Online Degree Courses",
  description: "Browse UGC-approved online MBA, BBA, BCA, MCA, BCom, MCom, BA, and MA programs.",
  alternates: { canonical: "/courses" },
};

export default async function CoursesPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const q = params?.q?.toLowerCase().trim() || "";
  const items = courses.map(courseWithUniversity);
  const shell = { maxWidth: 1200, margin: "0 auto", paddingLeft: 24, paddingRight: 24, width: "100%", boxSizing: "border-box" as const };

  return (
    <>
      <div style={{ background: "#F7F8F9", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div style={{ ...shell, paddingTop: 28, paddingBottom: 28 }}>
          <div style={{ color: "#707070", fontSize: 12, marginBottom: 8 }}>
            <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; Courses
          </div>
          <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>Online degree courses</h1>
          <div style={{ color: "#696868", fontSize: 14, marginTop: 6 }}>
            {items.length} UGC-entitled programs from 3 universities
          </div>
          </div>
        </div>

        <div style={{ background: "#F4F3FC", borderBottom: "1px solid #EAEAEA" }}>
          <div style={{ ...shell, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingTop: 12, paddingBottom: 12 }}>
          <span style={{ color: "#696868", fontSize: 12, fontWeight: 700, letterSpacing: 0.4 }}>TRENDING COMPARISONS</span>
          {[
            ["MBA: MUJ vs Amity", "/compare?add=mba-muj"],
            ["MBA: SMU vs MUJ", "/compare?add=mba-smu"],
            ["BCA: MUJ vs Amity", "/compare?add=bca-muj"],
            ["MCA: MUJ vs Amity", "/compare?add=mca-muj"],
          ].map(([label, href]) => (
            <Link href={href} style={{ fontSize: 13, fontWeight: 600, border: "1px solid #CFDAE6", background: "#fff", borderRadius: 999, padding: "6px 12px", color: "#363634" }} key={label}>
              {label}
            </Link>
          ))}
          </div>
        </div>

        <div style={{ ...shell, paddingTop: 28, paddingBottom: 56, flex: 1 }}>
          <CourseExplorer courses={items} initialQuery={q} />
        </div>
      </div>
    </>
  );
}
