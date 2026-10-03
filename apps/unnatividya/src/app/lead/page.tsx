export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { LeadFormLoader } from "@/components/lead-form-loader";

export const metadata: Metadata = { title: "Apply now", robots: { index: false, follow: false } };

type LeadParams = { course?: string | string[]; university?: string | string[]; intent?: string | string[]; goal?: string | string[] };
export default async function LeadPage({ searchParams }: { searchParams?: Promise<LeadParams> }) {
  const catalog = await getPublishedCatalog();
  const raw = (await searchParams) || {};
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const params = {course:first(raw.course),university:first(raw.university),intent:first(raw.intent),goal:first(raw.goal)};
  const course = catalog.courses.find(item => item.id === params.course || item.slug === params.course);
  const university = catalog.universities.find(item => item.id === (course?.universityId || params.university) || item.slug === params.university);
  const contextLabel = course ? `${course.name}${university ? ` — ${university.shortName}` : ""}` : university?.name;
  return <PublishedCatalogBoundary><section className="application-page container">
    <header><p className="breadcrumb"><Link href="/courses">Browse courses</Link> &gt; Application enquiry</p><h1>Apply now{contextLabel ? ` — ${contextLabel}` : ""}</h1><p>Start with your contact details. Choose a course and optional university preference next.</p></header>
    <div className="application-layout">
      <div className="application-form-panel"><LeadFormLoader context={{...params, course: course?.id || params.course, university: university?.id || params.university}} /></div>
      <aside className="application-explanation" aria-labelledby="application-next-title"><h2 id="application-next-title">What happens next</h2>
        <ol><li><strong>Save your details</strong><p>Your details are saved when you continue. Our team may follow up even if you leave before finishing.</p></li><li><strong>Choose your preferences</strong><p>Select a course. You can leave the university choice open.</p></li><li><strong>Verify your email</strong><p>Enter the email code to unlock interactive course comparison.</p></li></ol>
        <p>This is an enquiry to Unnati Vidya. University admission is confirmed separately by the university.</p><Link href="/privacy">Read our privacy policy</Link>
      </aside>
    </div>
  </section></PublishedCatalogBoundary>;
}
