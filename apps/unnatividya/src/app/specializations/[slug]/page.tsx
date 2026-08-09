import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { formatFee } from "@/data/catalog";
import { allSpecializationPages, getSpecializationPageBySlug, specializationFaqs } from "@/lib/specializations";
import { getCareerScopeGuideBySlug, getEligibilityGuideBySlug } from "@/data/guide-content";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export function generateStaticParams() {
  return allSpecializationPages().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getSpecializationPageBySlug(slug);
  if (!page) return {};
  const title = page.isComparison
    ? `${page.courseLabel} in ${page.specialization} — Compared Across Universities`
    : `${page.courseLabel} in ${page.specialization} — Fees & Details`;
  const description = page.isComparison
    ? `${page.courseLabel} with a ${page.specialization} specialization, compared across ${page.courses.length} UGC-entitled universities: fees, EMI, and duration for each.`
    : `${page.courseLabel} with a ${page.specialization} specialization at ${page.courses[0].university.name} — fee, EMI, and duration.`;
  return { title, description, alternates: { canonical: `/specializations/${slug}` } };
}

export default async function SpecializationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getSpecializationPageBySlug(slug);
  if (!page) notFound();

  const faqs = specializationFaqs(page);
  const eligibilityGuide = getEligibilityGuideBySlug(`${page.courseKeyPart}-eligibility`);
  const careerScopeGuide = getCareerScopeGuideBySlug(`${page.courseKeyPart}-career-scope`);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Specializations", item: `${SITE_URL}/specializations` },
      { "@type": "ListItem", position: 3, name: `${page.courseLabel} in ${page.specialization}`, item: `${SITE_URL}/specializations/${slug}` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, faqJsonLd]} />
      <div style={{ background: "#F7F8F9" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div className="container" style={{ paddingTop: 28, paddingBottom: 28 }}>
            <div className="breadcrumb" style={{ marginBottom: 8 }}>
              <Link href="/">Home</Link> &gt; <Link href="/specializations">Specializations</Link> &gt; {page.courseLabel} in {page.specialization}
            </div>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>
              {page.courseLabel} in {page.specialization}
            </h1>
            <div style={{ color: "#696868", fontSize: 13, marginTop: 8 }}>
              {page.isComparison
                ? `Offered by ${page.courses.length} universities on this site — compared below`
                : `Currently offered by ${page.courses[0].university.name} among the universities on this site`}
            </div>
          </div>
        </div>

        <div className="container detail-layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <section className="detail-section">
              <h2>{page.isComparison ? "Fee and duration by university" : "Fee and duration"}</h2>
              <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.9fr 1fr", background: "#F5F5F5", fontSize: 12, fontWeight: 700, color: "#696868", padding: "12px 18px", letterSpacing: 0.3 }}>
                  <span>UNIVERSITY</span><span>TOTAL FEE</span><span>EMI FROM</span><span>DURATION</span><span></span>
                </div>
                {page.courses.map((course) => (
                  <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.9fr 1fr", padding: "14px 18px", borderTop: "1px solid #EAEAEA", fontSize: 14, alignItems: "center" }} key={course.id}>
                    <span style={{ fontWeight: 600, color: "#363634" }}>{course.university.name}</span>
                    <span style={{ fontWeight: 700, color: course.fee === page.courses[0].fee ? "#2E7D32" : "#363634" }}>{formatFee(course.fee)}</span>
                    <span>{course.emi}</span>
                    <span>{course.duration}</span>
                    <Link href={`/courses/${course.slug}`} style={{ color: "#544CC8", fontWeight: 700, fontSize: 13 }}>View program</Link>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>
                Fee, EMI, and duration shown are for the base {page.courseLabel} program at each university — the specialization is an elective track within it, not a separately priced program. Confirm the current admission-cycle fee with a counsellor before you pay.
              </div>
            </section>

            <section className="detail-section">
              <h2>Career paths</h2>
              <p style={{ margin: 0, color: "#555", fontSize: 15, lineHeight: 1.65 }}>
                Specialization-specific career outcomes aren&apos;t independently published by these universities — the career paths below are for {page.courseLabel} graduates generally, not verified as specific to the {page.specialization} track.
                {careerScopeGuide ? (
                  <> See the full <Link href={`/online-degree-guides/${careerScopeGuide.slug}`} style={{ color: "#544CC8" }}>{page.courseLabel} career scope guide</Link> for real, source-attributed detail.</>
                ) : null}
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
                {[...new Set(page.courses.flatMap((course) => course.careerRoles))].map((role) => (
                  <span key={role} style={{ fontSize: 12, color: "#363634", background: "#F5F5F5", borderRadius: 999, padding: "4px 10px" }}>{role}</span>
                ))}
              </div>
            </section>

            <section className="detail-section">
              <h2>Related guides</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Link href={`/online-degree-guides/${page.courseKeyPart}-fees`} style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>{page.courseLabel} fees →</Link>
                {eligibilityGuide ? (
                  <Link href={`/online-degree-guides/${eligibilityGuide.slug}`} style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>{page.courseLabel} eligibility →</Link>
                ) : null}
              </div>
            </section>

            <section className="detail-section">
              <h2>Frequently asked questions</h2>
              <div className="faq-list">
                {faqs.map(([question, answer]) => (
                  <details className="faq-item" name="specialization-faq" key={question}>
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>

          <aside className="right-rail">
            <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Not sure this specialization is right for you?</div>
              <div style={{ fontSize: 13, color: "#696868", margin: "6px 0 14px", lineHeight: 1.5 }}>A counsellor can walk you through the {page.specialization} track against your career goals.</div>
              <Link href={`/lead?intent=specialization&course=${page.courseKeyPart}`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>Ask a counsellor</Link>
              <div style={{ fontSize: 11, color: "#707070", marginTop: 10 }}>Free service · no spam · unbiased advice</div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
