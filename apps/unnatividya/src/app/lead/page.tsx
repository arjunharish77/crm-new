export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck, Headset, LifeBuoy, ReceiptIndianRupee } from "lucide-react";
import { LeadFormLoader } from "@/components/lead-form-loader";
import { withSocial } from "@/lib/page-metadata";
import { publishedFeeCategory } from "@/lib/total-cost";

export const metadata: Metadata = withSocial({ title: "Apply now", robots: { index: false, follow: false } });

// Owner-confirmed points only (claims register): free counselling, no hidden charges, support till
// enrolment, and document and education-loan help. No phone line and no response-time promise.
const PERKS = [
  { icon: Headset, title: "Free counselling", copy: "Counselling is free for learners. Our team follows up about your enquiry." },
  { icon: ReceiptIndianRupee, title: "No hidden charges", copy: "Unnati Vidya adds no charge on top of the university fee." },
  { icon: LifeBuoy, title: "Support till enrolment", copy: "Follow-ups handled until your university LMS login arrives." },
  { icon: FileCheck, title: "Documents and loan help", copy: "Help checking your documents and exploring education-loan options." },
];

type LeadParams = { course?: string | string[]; university?: string | string[]; uni?: string | string[]; intent?: string | string[]; goal?: string | string[]; category?: string | string[] };
export default async function LeadPage({ searchParams }: { searchParams?: Promise<LeadParams> }) {
  const catalog = await getPublishedCatalog();
  const raw = (await searchParams) || {};
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  // `uni` is the design handoff's name for `university`; both are accepted.
  const params = {course:first(raw.course),university:first(raw.university) || first(raw.uni),intent:first(raw.intent),goal:first(raw.goal),feeCategoryKey:first(raw.category)};
  const course = catalog.courses.find(item => item.id === params.course || item.slug === params.course);
  const feeCourse = course ? catalog.courseWithUniversity(course) : null;
  const validFeeCategoryKey = feeCourse && publishedFeeCategory(feeCourse, params.feeCategoryKey || "") ? params.feeCategoryKey : undefined;
  const university = catalog.universities.find(item => item.id === (course?.universityId || params.university) || item.slug === params.university);
  const contextLabel = course ? `${course.name}${university ? ` — ${university.shortName}` : ""}` : university?.name;
  return <PublishedCatalogBoundary><div className="uv-apply">
    <div className="uv-apply-grid">
      <header className="uv-apply-intro">
        <p className="uv-eyebrow">Free counselling · No obligation</p>
        <h1 className="uv-apply-title">Start your application enquiry</h1>
        {contextLabel ? <p className="uv-apply-context">For: <strong>{contextLabel}</strong></p> : null}
        <p className="uv-apply-lede">Share your contact details, then choose your course and optional university preference. Our team will follow up.</p>
      </header>
      <div className="uv-apply-card application-form-panel">
        <LeadFormLoader context={{...params, course: course?.id || params.course, university: university?.id || params.university, feeCategoryKey: validFeeCategoryKey}} />
      </div>
      <div className="uv-apply-side">
        <ul className="uv-apply-perks" aria-label="What Unnati Vidya offers">
          {PERKS.map(({ icon: Icon, title, copy }) => <li key={title}>
            <span className="uv-apply-perk-icon" aria-hidden="true"><Icon size={22} /></span>
            <span><strong>{title}</strong><span>{copy}</span></span>
          </li>)}
        </ul>
        <aside className="uv-apply-next application-explanation" aria-labelledby="application-next-title">
          <h2 id="application-next-title">What happens next</h2>
          <ol>
            <li><strong>Save your details</strong><span>Your details are saved when you continue. Our team may contact you about your enquiry.</span></li>
            <li><strong>Choose your preferences</strong><span>Select a course. You can leave the university choice open.</span></li>
            <li><strong>Verify your email</strong><span>Enter the email code to unlock interactive course comparison.</span></li>
          </ol>
          <p>This is an enquiry to Unnati Vidya. University admission is confirmed separately by the university.</p>
          <Link href="/privacy" className="uv-link">Read our privacy policy</Link>
        </aside>
      </div>
    </div>
  </div></PublishedCatalogBoundary>;
}
