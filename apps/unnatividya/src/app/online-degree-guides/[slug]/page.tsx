import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { feeGuideFaqs, feeGuideIntro, feeGuides, formatFee, getFeeGuideBySlug } from "@/lib/fee-guides";
import {
  allCareerScopeGuides,
  allEligibilityGuides,
  allUgcApprovalGuides,
  getCareerScopeGuideBySlug,
  getEligibilityGuideBySlug,
  getUgcApprovalGuideBySlug,
} from "@/data/guide-content";
import { universityById } from "@/data/catalog";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export function generateStaticParams() {
  return [
    ...feeGuides().map((guide) => ({ slug: guide.slug })),
    ...allEligibilityGuides().map((guide) => ({ slug: guide.slug })),
    ...allCareerScopeGuides().map((guide) => ({ slug: guide.slug })),
    ...allUgcApprovalGuides().map((guide) => ({ slug: guide.slug })),
  ];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;

  if (slug.endsWith("-fees")) {
    const guide = getFeeGuideBySlug(slug);
    if (!guide) return {};
    const title = guide.isComparison ? `${guide.label} Fees Compared Across Universities` : `${guide.label} Fees Explained`;
    const description = guide.isComparison
      ? `${guide.label} fees across ${guide.courses.length} UGC-entitled universities: ${formatFee(guide.lowestFee)} to ${formatFee(guide.highestFee)}, with EMI and duration for each.`
      : `${guide.label} fee breakdown at ${guide.courses[0].university.name}: total fee ${formatFee(guide.courses[0].fee)}, EMI, and scholarship options.`;
    return { title, description, alternates: { canonical: `/online-degree-guides/${slug}` } };
  }

  if (slug.endsWith("-eligibility")) {
    const guide = getEligibilityGuideBySlug(slug);
    if (!guide) return {};
    return {
      title: `${guide.label} Eligibility Criteria and Admission Process`,
      description: `${guide.label} eligibility requirements at MUJ, SMU, and Amity — minimum marks, work experience, and entrance test rules compared, verified against each university's own admission page.`,
      alternates: { canonical: `/online-degree-guides/${slug}` },
    };
  }

  if (slug.endsWith("-career-scope")) {
    const guide = getCareerScopeGuideBySlug(slug);
    if (!guide) return {};
    return {
      title: `${guide.label} Career Scope, Roles, and Salary`,
      description: `${guide.label} career outcomes — real roles and industries named by each university, with unverified salary claims explicitly flagged, not presented as guaranteed figures.`,
      alternates: { canonical: `/online-degree-guides/${slug}` },
    };
  }

  if (slug.endsWith("-ugc-approval")) {
    const guide = getUgcApprovalGuideBySlug(slug);
    if (!guide) return {};
    return {
      title: `Is ${guide.label} UGC Approved? Validity Explained`,
      description: `${guide.label} UGC-DEB entitlement, NAAC, and AICTE status at MUJ, SMU, and Amity — verified against the official UGC-DEB entitlement list, not just university marketing claims.`,
      alternates: { canonical: `/online-degree-guides/${slug}` },
    };
  }

  return {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (slug.endsWith("-fees")) return <FeeGuideContent slug={slug} />;
  if (slug.endsWith("-eligibility")) return <EligibilityGuideContent slug={slug} />;
  if (slug.endsWith("-career-scope")) return <CareerScopeGuideContent slug={slug} />;
  if (slug.endsWith("-ugc-approval")) return <UgcApprovalGuideContent slug={slug} />;
  notFound();
}

function GuideCrossLinks({ courseKey, label, current }: { courseKey: string; label: string; current: "fees" | "eligibility" | "career-scope" | "ugc-approval" }) {
  const links = [
    { type: "fees" as const, href: `/online-degree-guides/${courseKey}-fees`, text: `${label} fees`, guard: null as (() => unknown) | null },
    { type: "eligibility" as const, href: `/online-degree-guides/${courseKey}-eligibility`, text: `${label} eligibility`, guard: () => getEligibilityGuideBySlug(`${courseKey}-eligibility`) },
    { type: "career-scope" as const, href: `/online-degree-guides/${courseKey}-career-scope`, text: `${label} career scope`, guard: () => getCareerScopeGuideBySlug(`${courseKey}-career-scope`) },
    { type: "ugc-approval" as const, href: `/online-degree-guides/${courseKey}-ugc-approval`, text: `Is ${label} UGC approved?`, guard: () => getUgcApprovalGuideBySlug(`${courseKey}-ugc-approval`) },
  ].filter((link) => link.type !== current && (!link.guard || link.guard()));

  if (!links.length) return null;

  return (
    <section className="detail-section">
      <h2>Related guides</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {links.map((link) => (
          <Link key={link.href} href={link.href} style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>
            {link.text} →
          </Link>
        ))}
      </div>
    </section>
  );
}

function LastReviewed({ date }: { date: string }) {
  return <div style={{ color: "#696868", fontSize: 13, marginTop: 8 }}>Last reviewed: {date}</div>;
}

function SourceList({ urls, guideSlug }: { urls: string[]; guideSlug: string }) {
  return (
    <div style={{ fontSize: 12, color: "#707070" }}>
      Sources:{" "}
      {urls.map((url, index) => {
        const hostname = new URL(url).hostname;
        return (
          <span key={url}>
            {index > 0 ? ", " : ""}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              data-track-event="source_link_click"
              data-track-params={JSON.stringify({ source_hostname: hostname, guide_slug: guideSlug })}
              style={{ color: "#707070" }}
            >
              {hostname}
            </a>
          </span>
        );
      })}
    </div>
  );
}

function FeeGuideContent({ slug }: { slug: string }) {
  const guide = getFeeGuideBySlug(slug);
  if (!guide) notFound();
  const faqs = feeGuideFaqs(guide);
  const intro = feeGuideIntro(guide);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${SITE_URL}/online-degree-guides` },
      { "@type": "ListItem", position: 3, name: `${guide.label} Fees`, item: `${SITE_URL}/online-degree-guides/${guide.slug}` },
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
              <Link href="/">Home</Link> &gt; <Link href="/online-degree-guides">Online Degree Guides</Link> &gt; {guide.label} Fees
            </div>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>
              {guide.isComparison ? `${guide.label} fees compared across universities` : `${guide.label} fees explained`}
            </h1>
            <div style={{ color: "#696868", fontSize: 13, marginTop: 8 }}>Fees last reviewed: July 2026 admission cycle</div>
          </div>
        </div>

        <div className="container detail-layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <section className="detail-section">
              <p style={{ margin: 0, color: "#555", fontSize: 15, lineHeight: 1.65 }}>{intro}</p>
            </section>

            <section className="detail-section">
              <h2>{guide.isComparison ? "Fee, EMI, and duration by university" : "Fee and EMI breakdown"}</h2>
              <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.9fr 1fr", background: "#F5F5F5", fontSize: 12, fontWeight: 700, color: "#696868", padding: "12px 18px", letterSpacing: 0.3 }}>
                  <span>UNIVERSITY</span><span>TOTAL FEE</span><span>EMI FROM</span><span>DURATION</span><span></span>
                </div>
                {guide.courses.map((course) => (
                  <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.9fr 1fr", padding: "14px 18px", borderTop: "1px solid #EAEAEA", fontSize: 14, alignItems: "center" }} key={course.id}>
                    <span style={{ fontWeight: 600, color: "#363634" }}>{course.university.name}</span>
                    <span style={{ fontWeight: 700, color: course.fee === guide.lowestFee ? "#2E7D32" : "#363634" }}>{formatFee(course.fee)}</span>
                    <span>{course.emi}</span>
                    <span>{course.duration}</span>
                    <Link href={`/courses/${course.slug}`} style={{ color: "#544CC8", fontWeight: 700, fontSize: 13 }}>View program</Link>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>
                All programs listed above are UGC-entitled online degrees. Confirm the current admission-cycle fee with a counsellor before you pay.
              </div>
            </section>

            {!guide.isComparison && guide.courses[0].scholarships?.length ? (
              <section className="detail-section">
                <h2>Scholarships available</h2>
                <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr", background: "#F5F5F5", fontSize: 12, fontWeight: 700, color: "#696868", padding: "12px 18px", letterSpacing: 0.3 }}>
                    <span>CATEGORY</span><span>DISCOUNT</span><span>PROOF REQUIRED</span>
                  </div>
                  {guide.courses[0].scholarships.map((row) => (
                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr", padding: "14px 18px", borderTop: "1px solid #EAEAEA", fontSize: 14, alignItems: "center" }} key={row[0]}>
                      <span style={{ fontWeight: 600, color: "#363634" }}>{row[0]}</span>
                      <span>{row[1]}</span>
                      <span style={{ color: "#707070", fontSize: 13 }}>{row[2]}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>
                  Scholarship eligibility and proof requirements can change by admission cycle. See our <Link href="/refund-policy" style={{ color: "#544CC8" }}>refund policy</Link> for what happens if you discontinue after admission.
                </div>
              </section>
            ) : null}

            <GuideCrossLinks courseKey={guide.key} label={guide.label} current="fees" />

            <section className="detail-section">
              <h2>Frequently asked questions</h2>
              <div className="faq-list">
                {faqs.map(([question, answer]) => (
                  <details className="faq-item" name="fee-guide-faq" key={question}>
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>

          <aside className="right-rail">
            <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Get the exact fee breakup</div>
              <div style={{ fontSize: 13, color: "#696868", margin: "6px 0 14px", lineHeight: 1.5 }}>A counsellor will confirm the current fee, EMI plan, and scholarship eligibility for {guide.label}.</div>
              <Link href={`/lead?intent=fee-guide&course=${guide.key}`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>Ask a counsellor</Link>
              <div style={{ fontSize: 11, color: "#707070", marginTop: 10 }}>Free service · no spam · unbiased advice</div>
            </div>
            {guide.isComparison ? (
              <Link href={`/compare?add=${guide.courses[0].id}`} style={{ display: "block", textAlign: "center", border: "1.5px solid #555", borderRadius: 4, height: 44, lineHeight: "44px", fontSize: 14, fontWeight: 700, color: "#555", background: "#fff", marginTop: 12 }}>
                Compare {guide.label} side by side
              </Link>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}

function EligibilityGuideContent({ slug }: { slug: string }) {
  const guide = getEligibilityGuideBySlug(slug);
  if (!guide) notFound();

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${SITE_URL}/online-degree-guides` },
      { "@type": "ListItem", position: 3, name: `${guide.label} Eligibility`, item: `${SITE_URL}/online-degree-guides/${guide.slug}` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, faqJsonLd]} />
      <div style={{ background: "#F7F8F9" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div className="container" style={{ paddingTop: 28, paddingBottom: 28 }}>
            <div className="breadcrumb" style={{ marginBottom: 8 }}>
              <Link href="/">Home</Link> &gt; <Link href="/online-degree-guides">Online Degree Guides</Link> &gt; {guide.label} Eligibility
            </div>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>{guide.label} eligibility and admission process</h1>
            <LastReviewed date={guide.lastReviewed} />
          </div>
        </div>

        <div className="container detail-layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <section className="detail-section">
              <h2>Eligibility by university</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {guide.facts.map((row) => (
                  <div key={row.universityId} style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 18 }}>
                    <div style={{ fontWeight: 700, color: "#363634", marginBottom: 6 }}>{universityById[row.universityId].name}</div>
                    <div style={{ fontSize: 14, color: "#555", lineHeight: 1.6 }}>{row.fact}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section">
              <h2>What&apos;s actually different between universities</h2>
              <p style={{ margin: 0, color: "#555", fontSize: 15, lineHeight: 1.65 }}>{guide.differentiatorNote}</p>
            </section>

            <GuideCrossLinks courseKey={guide.key} label={guide.label} current="eligibility" />

            <section className="detail-section">
              <h2>Frequently asked questions</h2>
              <div className="faq-list">
                {guide.faqs.map(([question, answer]) => (
                  <details className="faq-item" name="eligibility-guide-faq" key={question}>
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
            </section>

            <SourceList urls={guide.sourceUrls} guideSlug={slug} />
          </div>

          <aside className="right-rail">
            <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Not sure you qualify?</div>
              <div style={{ fontSize: 13, color: "#696868", margin: "6px 0 14px", lineHeight: 1.5 }}>A counsellor will check your specific background against {guide.label}&apos;s current eligibility rules at each university.</div>
              <Link href={`/lead?intent=eligibility-guide&course=${guide.key}`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>Ask a counsellor</Link>
              <div style={{ fontSize: 11, color: "#707070", marginTop: 10 }}>Free service · no spam · unbiased advice</div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function CareerScopeGuideContent({ slug }: { slug: string }) {
  const guide = getCareerScopeGuideBySlug(slug);
  if (!guide) notFound();

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${SITE_URL}/online-degree-guides` },
      { "@type": "ListItem", position: 3, name: `${guide.label} Career Scope`, item: `${SITE_URL}/online-degree-guides/${guide.slug}` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, faqJsonLd]} />
      <div style={{ background: "#F7F8F9" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div className="container" style={{ paddingTop: 28, paddingBottom: 28 }}>
            <div className="breadcrumb" style={{ marginBottom: 8 }}>
              <Link href="/">Home</Link> &gt; <Link href="/online-degree-guides">Online Degree Guides</Link> &gt; {guide.label} Career Scope
            </div>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>{guide.label} career scope, roles, and salary</h1>
            <LastReviewed date={guide.lastReviewed} />
          </div>
        </div>

        <div className="container detail-layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <section className="detail-section">
              <h2>Roles and industries, by university</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {guide.universityHighlights.map((row) => (
                  <div key={row.universityId} style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 18 }}>
                    <div style={{ fontWeight: 700, color: "#363634", marginBottom: 10 }}>{universityById[row.universityId].name}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: row.industries ? 10 : 0 }}>
                      {row.roles.map((role) => (
                        <span key={role} style={{ fontSize: 12, color: "#363634", background: "#F5F5F5", borderRadius: 999, padding: "4px 10px" }}>{role}</span>
                      ))}
                    </div>
                    {row.industries ? (
                      <div style={{ fontSize: 13, color: "#707070" }}>Industries: {row.industries.join(", ")}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section">
              <h2 style={{ color: "#B45309" }}>What we could and couldn&apos;t verify</h2>
              <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: 16, fontSize: 14, color: "#555", lineHeight: 1.6 }}>
                {guide.unverifiedClaimsNote}
              </div>
            </section>

            <GuideCrossLinks courseKey={guide.key} label={guide.label} current="career-scope" />

            <section className="detail-section">
              <h2>Frequently asked questions</h2>
              <div className="faq-list">
                {guide.faqs.map(([question, answer]) => (
                  <details className="faq-item" name="career-scope-guide-faq" key={question}>
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
            </section>

            <SourceList urls={guide.sourceUrls} guideSlug={slug} />
          </div>

          <aside className="right-rail">
            <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Want a realistic outcome estimate?</div>
              <div style={{ fontSize: 13, color: "#696868", margin: "6px 0 14px", lineHeight: 1.5 }}>A counsellor can give you role- and experience-specific guidance instead of an unverified average.</div>
              <Link href={`/lead?intent=career-scope-guide&course=${guide.key}`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>Ask a counsellor</Link>
              <div style={{ fontSize: 11, color: "#707070", marginTop: 10 }}>Free service · no spam · unbiased advice</div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function UgcApprovalGuideContent({ slug }: { slug: string }) {
  const guide = getUgcApprovalGuideBySlug(slug);
  if (!guide) notFound();
  const allEntitled = guide.approvals.every((row) => row.ugcDebEntitled);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${SITE_URL}/online-degree-guides` },
      { "@type": "ListItem", position: 3, name: `Is ${guide.label} UGC Approved`, item: `${SITE_URL}/online-degree-guides/${guide.slug}` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, faqJsonLd]} />
      <div style={{ background: "#F7F8F9" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div className="container" style={{ paddingTop: 28, paddingBottom: 28 }}>
            <div className="breadcrumb" style={{ marginBottom: 8 }}>
              <Link href="/">Home</Link> &gt; <Link href="/online-degree-guides">Online Degree Guides</Link> &gt; Is {guide.label} UGC Approved
            </div>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>Is {guide.label} UGC approved? Validity explained</h1>
            <LastReviewed date={guide.lastReviewed} />
          </div>
        </div>

        <div className="container detail-layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <section className="detail-section">
              {allEntitled ? (
                <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: 16, fontSize: 14, color: "#065F46", lineHeight: 1.6, marginBottom: 20 }}>
                  Verified directly against the official <strong>UGC-DEB &quot;Entitled Online&quot; list</strong> (deb.ugc.ac.in) — a primary government source, not a university marketing claim.
                </div>
              ) : (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: 16, fontSize: 14, color: "#92400E", lineHeight: 1.6, marginBottom: 20 }}>
                  Checked directly against the official <strong>UGC-DEB &quot;Entitled Online&quot; list</strong> (deb.ugc.ac.in) — for at least one university below, this specific program could not be confirmed by exact name against that primary source, despite the university&apos;s own marketing claim. See the detail below before relying on this.
                </div>
              )}
              <h2>Approval status by university</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {guide.approvals.map((row) => (
                  <div key={row.universityId} style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, color: "#363634" }}>{universityById[row.universityId].name}</span>
                      {row.ugcDebEntitled ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#2E7D32", background: "rgba(46,125,50,0.10)", borderRadius: 999, padding: "3px 9px" }}>UGC-DEB ENTITLED</span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#92400E", background: "rgba(253,230,138,0.35)", borderRadius: 999, padding: "3px 9px" }}>NOT CONFIRMED BY NAME</span>
                      )}
                    </div>
                    {row.naac ? <div style={{ fontSize: 14, color: "#555", marginBottom: 4 }}><strong>NAAC:</strong> {row.naac}</div> : null}
                    {row.aicte ? <div style={{ fontSize: 14, color: "#555", marginBottom: 4 }}><strong>AICTE:</strong> {row.aicte}</div> : null}
                    {row.note ? <div style={{ fontSize: 13, color: "#707070", marginTop: 6 }}>{row.note}</div> : null}
                  </div>
                ))}
              </div>
            </section>

            <GuideCrossLinks courseKey={guide.key} label={guide.label} current="ugc-approval" />

            <section className="detail-section">
              <h2>Frequently asked questions</h2>
              <div className="faq-list">
                {guide.faqs.map(([question, answer]) => (
                  <details className="faq-item" name="ugc-approval-guide-faq" key={question}>
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
            </section>

            <SourceList urls={guide.sourceUrls} guideSlug={slug} />
          </div>

          <aside className="right-rail">
            <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Still unsure about validity?</div>
              <div style={{ fontSize: 13, color: "#696868", margin: "6px 0 14px", lineHeight: 1.5 }}>A counsellor can walk you through the exact entitlement documentation for {guide.label}.</div>
              <Link href={`/lead?intent=ugc-approval-guide&course=${guide.key}`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>Ask a counsellor</Link>
              <div style={{ fontSize: 11, color: "#707070", marginTop: 10 }}>Free service · no spam · unbiased advice</div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
