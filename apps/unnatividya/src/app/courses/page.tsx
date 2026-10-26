export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { CourseExplorer, CourseSearch } from "@/components/course-explorer";
import { JsonLd } from "@/components/json-ld";
import { formatFee } from "@/lib/catalog-format";
import { allComparisonPairs } from "@/lib/comparisons";
import { withSocial } from "@/lib/page-metadata";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export const metadata: Metadata = withSocial({
  title: "Online Degree Courses",
  description: "Browse UGC-approved online MBA, BBA, BCA, MCA, BCom, MCom, BA, and MA programs.",
  alternates: { canonical: "/courses" },
});

// Design "Quick compare" chips. They open the public editorial comparison pages (ungated,
// crawlable), not the OTP-gated /compare tool.
const QUICK_COMPARE: Array<[string, string, string]> = [
  ["MBA: MUJ vs Amity", "mba-muj", "mba-amity"],
  ["MBA: SMU vs MUJ", "mba-smu", "mba-muj"],
  ["BCA: MUJ vs Amity", "bca-muj", "bca-amity"],
  ["MCA: MUJ vs SMU", "mca-muj", "mca-smu"],
];

export default async function CoursesPage() {
  const catalog = await getPublishedCatalog();
  const { courses, courseWithUniversity } = catalog;
  const items = courses.map(courseWithUniversity);
  const pairs = allComparisonPairs(catalog);
  const quickCompare = QUICK_COMPARE.map(([label, a, b]) => {
    const pair = pairs.find((item) => [item.left.id, item.right.id].sort().join() === [a, b].sort().join());
    return pair ? { label, href: `/compare/${pair.key}/${pair.slug}` } : null;
  }).filter((item): item is { label: string; href: string } => Boolean(item));

  // Google's course list (carousel) format: ListItem entries with a position, each holding a
  // Course with a distinct name and a real description (technical SEO review M4).
  const courseListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((course, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Course",
        url: `${SITE_URL}/courses/${course.slug}`,
        name: `${course.name} (${course.university.shortName})`,
        description: `${course.name} from ${course.university.name}: ${course.duration}, total fee ${formatFee(course.fee)}.`,
        provider: { "@type": "CollegeOrUniversity", name: course.university.name, sameAs: `${SITE_URL}/universities/${course.university.slug}` },
      },
    })),
  };

  return <PublishedCatalogBoundary>{(
    <div className="uvc-page">
      <JsonLd data={courseListJsonLd} />
      <section className="uvc-hero" aria-labelledby="courses-title">
        <div className="uvc-hero-inner">
          <nav aria-label="Breadcrumb">
            <ol className="uv-breadcrumb">
              <li><Link href="/">Home</Link></li>
              <li><span aria-current="page">Courses</span></li>
            </ol>
          </nav>
          <h1 id="courses-title" className="uvc-title">Online degree courses</h1>
          <p className="uvc-sub">Online degree programs from MUJ, SMU and Amity, with listed tuition and EMI.</p>
          <div className="uvc-search-row">
            <CourseSearch />
            <Link href="/recommender" className="uvc-fit"><Sparkles size={20} aria-hidden="true" />Not sure? Find my course</Link>
          </div>
          {quickCompare.length ? <div className="uvc-quick">
            <span id="quick-compare-label">Quick compare</span>
            <ul aria-labelledby="quick-compare-label">
              {quickCompare.map((item) => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}
            </ul>
          </div> : null}
        </div>
      </section>

      <div className="uvc-main">
        <CourseExplorer courses={items} />
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}
