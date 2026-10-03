export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { CourseExplorer } from "@/components/course-explorer";
import { JsonLd } from "@/components/json-ld";
import { formatFee } from "@/lib/catalog-format";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export const metadata: Metadata = {
  title: "Online Degree Courses",
  description: "Browse UGC-approved online MBA, BBA, BCA, MCA, BCom, MCom, BA, and MA programs.",
  alternates: { canonical: "/courses" },
};

export default async function CoursesPage() {
  const catalog = await getPublishedCatalog();
  const { courses, courseWithUniversity } = catalog;
  const items = courses.map(courseWithUniversity);
  const shell = { maxWidth: 1200, margin: "0 auto", paddingLeft: 24, paddingRight: 24, width: "100%", boxSizing: "border-box" as const };

  // Google's "Course list" structured data — a plain ItemList of Course objects, min 3 items,
  // description capped at 60 chars. This is the type that actually appears in Google's current
  // Search Gallery; the per-course `Course` markup on each detail page does not (see 23_...'s §5.1).
  const courseListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((course) => ({
      "@type": "Course",
      url: `${SITE_URL}/courses/${course.slug}`,
      name: course.name,
      description: `${course.level} · ${course.duration} · ${formatFee(course.fee)}`,
      provider: { "@type": "Organization", name: course.university.name },
    })),
  };

  return <PublishedCatalogBoundary>{(
    <>
      <JsonLd data={courseListJsonLd} />
      <div style={{ background: "#F7F8F9", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div style={{ ...shell, paddingTop: 28, paddingBottom: 28 }}>
          <div style={{ color: "#707070", fontSize: 12, marginBottom: 8 }}>
            <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; Courses
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>Online degree courses</h1>
            <Link
              href="/recommender"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #CFDAE6", borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#544CC8" }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "linear-gradient(135deg,#4F46E5,#7C3AED)", display: "inline-block" }} aria-hidden="true" />
              Not sure? Ask UnnatiAI
            </Link>
          </div>
          </div>
        </div>

        <div style={{ background: "#F4F3FC", borderBottom: "1px solid #EAEAEA" }}>
          <div style={{ ...shell, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingTop: 12, paddingBottom: 12 }}>
          <details style={{width:"100%"}}><summary style={{cursor:"pointer",fontSize:14,fontWeight:600,color:"#443b9e"}}>Quick comparisons</summary>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
          {[
            ["MBA: MUJ vs Amity", "/compare?add=mba-muj,mba-amity"],
            ["MBA: SMU vs MUJ", "/compare?add=mba-smu,mba-muj"],
            ["BCA: MUJ vs Amity", "/compare?add=bca-muj,bca-amity"],
            ["MCA: MUJ vs SMU", "/compare?add=mca-muj,mca-smu"],
          ].map(([label, href]) => (
            <Link href={href} style={{ fontSize: 13, fontWeight: 600, border: "1px solid #CFDAE6", background: "#fff", borderRadius: 999, padding: "6px 12px", color: "#363634" }} key={label}>
              {label}
            </Link>
          ))}
          </div></details>
          </div>
        </div>

        <div style={{ ...shell, paddingTop: 28, paddingBottom: 56, flex: 1 }}>
          <CourseExplorer courses={items} />
        </div>
      </div>
    </>
  )}</PublishedCatalogBoundary>;
}
