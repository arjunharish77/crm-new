import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalBadge } from "@/components/approval-badge";
import { JsonLd } from "@/components/json-ld";
import { SaveButton } from "@/components/save-button";
import { SectionPillNav } from "@/components/section-pill-nav";
import { StickyMobileBar } from "@/components/sticky-mobile-bar";
import { CourseEnquiryCard } from "@/components/course-enquiry-card";
import { careerRoleSalary, courseWithUniversity, courses, formatFee, getCourseBySlug, universityEnrichmentById } from "@/data/catalog";
import { certificateImagePath, learningMedia, universityMedia } from "@/data/media";
import { publicAssetExists } from "@/lib/asset-exists";
import { buildCourseFaqs } from "@/lib/course-faqs";
import { feeGuideSlugForCourseName, getFeeGuideBySlug } from "@/lib/fee-guides";
import { courseKey } from "@/lib/programmatic-seo";
import { allComparisonPairs } from "@/lib/comparisons";
import { specializationKey } from "@/lib/specializations";
import { getCareerScopeGuideBySlug, getEligibilityGuideBySlug, getUgcApprovalGuideBySlug } from "@/data/guide-content";

export function generateStaticParams() {
  return courses.map((course) => ({ slug: course.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const course = getCourseBySlug(slug);
  if (!course) return {};
  const title = `${course.name} from ${course.university.name}`;
  const description = `${course.name} from ${course.university.name}: fees ${formatFee(course.fee)}, duration ${course.duration}, eligibility, specialisations, and career roles.`;
  return {
    title,
    description,
    alternates: { canonical: `/courses/${course.slug}` },
    openGraph: { title, description, images: [universityMedia[course.universityId].src] },
  };
}

export default async function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = getCourseBySlug(slug);
  if (!course) notFound();
  const similarCourses = courses
    .filter((candidate) => candidate.id !== course.id && candidate.shortName === course.shortName)
    .map(courseWithUniversity)
    .slice(0, 3);
  const feeGuide = getFeeGuideBySlug(feeGuideSlugForCourseName(course.name));
  const key = courseKey(course.name);
  const eligibilityGuide = getEligibilityGuideBySlug(`${key}-eligibility`);
  const careerScopeGuide = getCareerScopeGuideBySlug(`${key}-career-scope`);
  const ugcApprovalGuide = getUgcApprovalGuideBySlug(`${key}-ugc-approval`);
  const comparisonPairs = allComparisonPairs().filter((pair) => pair.left.id === course.id || pair.right.id === course.id);
  const certificatePath = certificateImagePath(course.id);
  const hasCertificateImage = publicAssetExists(certificatePath);
  const universityEnrichment = universityEnrichmentById[course.universityId];
  const semesters = course.duration.startsWith("36") ? 6 : 4;
  const batches = universityEnrichment?.factTiles?.find(([label]) => label === "Batches")?.[1] || "January & July";
  const isEligibilityVerified = course.dataQuality?.eligibility === "verified";
  const siteUrl = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
  const courseJsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: `${course.name} - ${course.university.name}`,
    description: `${course.name} from ${course.university.name}. Duration ${course.duration}, total fee ${formatFee(course.fee)}, UGC-entitled online degree.`,
    url: `${siteUrl}/courses/${course.slug}`,
    provider: {
      "@type": "CollegeOrUniversity",
      name: course.university.name,
      url: `${siteUrl}/universities/${course.university.slug}`,
      address: course.university.city,
    },
    educationalCredentialAwarded: course.name,
    timeRequired: course.duration,
    offers: {
      "@type": "Offer",
      price: course.fee,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: `${siteUrl}/lead?course=${course.id}`,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: course.rating,
      reviewCount: course.reviews,
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Courses", item: `${siteUrl}/courses` },
      { "@type": "ListItem", position: 3, name: course.name, item: `${siteUrl}/courses/${course.slug}` },
    ],
  };
  const courseFaqs = buildCourseFaqs(course);
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: courseFaqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <>
      <JsonLd data={[courseJsonLd, breadcrumbJsonLd, faqJsonLd].filter((item): item is NonNullable<typeof item> => item !== null)} />
      <section className="detail-hero">
        <div className="container" style={{ paddingTop: 36, paddingBottom: 32 }}>
          <div>
            <div className="breadcrumb" style={{ marginBottom: 12, color: "#B8C4CA" }}>
              <Link href="/">Home</Link> &gt; <Link href="/courses">Courses</Link> &gt; {course.name}
            </div>
            <div className="gold-badges" style={{ marginTop: 0, marginBottom: 12 }}>
              {course.university.approvals.slice(0, 4).map((approval) => (
                <ApprovalBadge label={approval} className="gold-badge" key={approval} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 60, height: 60, background: "#fff", borderRadius: 8, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <Image src={universityMedia[course.universityId].logo} alt={`${course.university.shortName} logo`} width={48} height={48} style={{ objectFit: "contain" }} />
                </div>
                <div>
                  <h1>{course.name}</h1>
                  <div className="detail-sub" style={{ fontSize: 16 }}>
                    <Link href={`/universities/${course.university.slug}`} style={{ color: "#fff", textDecoration: "underline" }}>
                      {course.university.name}
                    </Link>{" "}
                    · {course.university.city}
                  </div>
                </div>
              </div>
              <SaveButton courseId={course.id} />
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14, fontSize: 14 }}>
              <span><span style={{ color: "#FDB515" }}>★</span> <b>{course.rating}</b> ({course.reviews} reviews)</span>
              <span style={{ color: "#546E7A" }}>|</span>
              <span>{course.university.learners} learners across {course.university.shortName} online programs</span>
            </div>
          </div>
        </div>
      </section>

      <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
        <div className="container">
          <div className="stats-band-grid">
            {[
              ["Duration", course.duration],
              ["Total fee", formatFee(course.fee)],
              ["EMI from", course.emi],
              ["Level", `${course.level} degree`],
              ["Weekly effort", course.weeklyHours],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ color: "#707070", fontSize: 12 }}>{label}</div>
                <div style={{ color: "#363634", fontSize: 16, fontWeight: 700, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SectionPillNav
        label="Course sections"
        items={[
          { label: "Overview", href: "#sec-overview" },
          { label: "Eligibility", href: "#sec-eligibility" },
          { label: "Admission", href: "#sec-admission" },
          { label: "Specialisations", href: "#sec-specialisations" },
          { label: "Curriculum", href: "#sec-curriculum" },
          { label: "Fees & EMI", href: "#sec-fees" },
          { label: "Careers", href: "#sec-careers" },
          { label: "Certificate", href: "#sec-certificate" },
          { label: "Reviews", href: "#sec-reviews" },
          { label: "FAQ", href: "#sec-faq" },
        ]}
      />

      <div className="container detail-layout">
        <div className="detail-stack">
          <section className="detail-section" id="sec-overview">
            <h2>About this program</h2>
            <div className="overview-grid">
              <p style={{ margin: 0, color: "#555", fontSize: 15, lineHeight: 1.65 }}>
                {course.overview}
              </p>
              <div className="overview-media">
                <Image
                  src={learningMedia.src}
                  alt={learningMedia.alt}
                  width={420}
                  height={260}
                  sizes="(max-width: 760px) 100vw, 260px"
                />
              </div>
            </div>
            <div className="fact-grid" style={{ marginTop: 18 }}>
              {[
                ["Mode", "100% online"],
                ["Semesters", `${semesters} semesters`],
                ["Credits", course.credits],
                ["Exams", "Online proctored"],
                ["Application fee", course.applicationFee],
                ["Batches", batches],
              ].map(([label, value]) => <div className="fact" key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
          </section>

          <section className="detail-section" id="sec-eligibility">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Eligibility</h2>
              {isEligibilityVerified ? (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#2E7D32", background: "rgba(46,125,50,0.10)", borderRadius: 999, padding: "3px 9px" }}>SOURCE VERIFIED</span>
              ) : null}
            </div>
            <p style={{ margin: 0, color: "#555", fontSize: 15, lineHeight: 1.65 }}>{course.eligibility}</p>
          </section>

          <section className="detail-section" id="sec-admission">
            <h2>Admission process</h2>
            <div className="grid four">
              {(universityEnrichment?.admissionSteps || [
                { title: "Apply online", copy: "Fill the application on the university portal — 10 minutes." },
                { title: "Upload documents", copy: "Mark sheets, ID proof and a photo. We check them first." },
                { title: "Pay first semester", copy: "Card, net-banking or no-cost EMI after loan approval." },
                { title: "Start learning", copy: "LMS login within 72 hours of approval." },
              ]).map((step, index) => (
                <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 16 }} key={step.title}>
                  <div style={{ width: 32, height: 32, borderRadius: 4, background: "rgba(84,76,200,0.10)", color: "#544CC8", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{index + 1}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#363634", margin: "10px 0 4px" }}>{step.title}</div>
                  <div style={{ fontSize: 13, color: "#696868", lineHeight: 1.5 }}>{step.copy}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="detail-section" id="sec-specialisations">
            <h2>{course.specializations.length} specialisations</h2>
            <div style={{ fontSize: 13, color: "#707070", marginBottom: 14 }}>Chosen in semester 3 — same fee, same duration</div>
            <div className="grid three">
              {course.specializations.map((spec) => {
                const isGeneral = spec.toLowerCase() === "general";
                const specSlug = `${key}-${specializationKey(spec)}`;
                const card = (
                  <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 14, height: "100%" }}>
                    <div style={{ color: "#363634", fontSize: 14, fontWeight: 700 }}>{spec}</div>
                    <div style={{ color: "#707070", fontSize: 12, marginTop: 4 }}>Elective track · semesters 3–4</div>
                  </div>
                );
                return isGeneral ? (
                  <div key={spec}>{card}</div>
                ) : (
                  <Link key={spec} href={`/specializations/${specSlug}`} style={{ color: "inherit" }}>
                    {card}
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="detail-section" id="sec-curriculum" data-acc-group>
            <h2>Curriculum</h2>
            <div style={{ fontSize: 13, color: "#707070", marginBottom: 14 }}>{semesters} semesters, {course.credits}.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(course.curriculum || []).map((term, index) => (
                <details className="curriculum-item" key={term.term} name="course-curriculum" open={index === 0} style={{ border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden" }}>
                  <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", cursor: "pointer", color: "#363634", fontSize: 15, fontWeight: 700 }}>{term.term}</summary>
                  <div style={{ padding: "4px 18px 16px" }}>
                    {term.subjects.map((subject) => (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#555", padding: "4px 0" }} key={subject}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#544CC8", flex: "none" }} />
                        {subject}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="detail-section" id="sec-fees">
            <h2>Fees & EMI options</h2>
            <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", background: "#F5F5F5", fontSize: 12, fontWeight: 700, color: "#696868", padding: "12px 18px", letterSpacing: 0.3, minWidth: 420 }}>
                <span>PLAN</span><span>YOU PAY</span><span>PER MONTH</span>
              </div>
              {(course.feePlans || []).map((row, index) => (
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", padding: "14px 18px", borderTop: "1px solid #EAEAEA", fontSize: 14, alignItems: "center", minWidth: 420 }} key={row[0]}>
                  <span style={{ fontWeight: 600, color: "#363634" }}>{row[0]}</span>
                  <span>{row[1]}</span>
                  <span style={{ fontWeight: 700, color: index === 2 ? "#544CC8" : "#363634" }}>{row[2]}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>No-cost EMI via education loan partners. Scholarships up to 20% for merit, defence and differently-abled learners.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
              <Link href="/tools/emi-calculator" style={{ display: "inline-block", color: "#544CC8", fontWeight: 700, fontSize: 13 }}>
                Open EMI calculator →
              </Link>
              {feeGuide ? (
                <Link href={`/online-degree-guides/${feeGuide.slug}`} style={{ display: "inline-block", color: "#544CC8", fontWeight: 700, fontSize: 13 }}>
                  {feeGuide.isComparison
                    ? `See ${course.name} fees compared across ${feeGuide.courses.length} universities →`
                    : `See the full ${course.name} fee & scholarship guide →`}
                </Link>
              ) : null}
              {eligibilityGuide ? (
                <Link href={`/online-degree-guides/${eligibilityGuide.slug}`} style={{ display: "inline-block", color: "#544CC8", fontWeight: 700, fontSize: 13 }}>
                  {course.name} eligibility across universities →
                </Link>
              ) : null}
            </div>
          </section>

          <section className="detail-section" id="sec-careers">
            <h2>Career outcomes</h2>
            <div className="grid four">
              {course.careerRoles.map((role) => (
                <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 16 }} key={role}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#363634" }}>{role}</div>
                  <div style={{ fontSize: 13, color: "#2E7D32", fontWeight: 700, marginTop: 4 }}>{careerRoleSalary[role] || "Role-fit varies"}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>{course.university.placement}% placement assistance rate at {course.university.shortName} · average package {course.university.avgPackage} · {course.university.partners}+ hiring partners</div>
            {careerScopeGuide ? (
              <Link href={`/online-degree-guides/${careerScopeGuide.slug}`} style={{ display: "inline-block", marginTop: 12, color: "#544CC8", fontWeight: 700, fontSize: 13 }}>
                Full {course.name} career scope, by university →
              </Link>
            ) : null}
          </section>

          {ugcApprovalGuide || comparisonPairs.length ? (
            <section className="detail-section" id="sec-related-guides">
              <h2>Related guides</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ugcApprovalGuide ? (
                  <Link href={`/online-degree-guides/${ugcApprovalGuide.slug}`} style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>
                    Is {course.name} UGC approved? →
                  </Link>
                ) : null}
                {comparisonPairs.map((pair) => {
                  const other = pair.left.id === course.id ? pair.right : pair.left;
                  return (
                    <Link key={`${pair.key}/${pair.slug}`} href={`/compare/${pair.key}/${pair.slug}`} style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>
                      {course.name}: {course.university.shortName} vs {other.university.shortName} →
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="detail-section" id="sec-certificate">
            <h2>Sample degree certificate</h2>
            <div className="grid-mobile-stack" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, alignItems: "center" }}>
              {hasCertificateImage ? (
                <div style={{ height: 210, borderRadius: 8, overflow: "hidden", position: "relative" }}>
                  <Image src={certificatePath} alt={`${course.name} sample degree certificate`} fill sizes="300px" style={{ objectFit: "cover" }} />
                </div>
              ) : (
                <div style={{ height: 210, border: "1px dashed #CFDAE6", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#707070", fontFamily: "monospace", background: "repeating-linear-gradient(45deg,#FAFAFA,#FAFAFA 12px,#F4F3FC 12px,#F4F3FC 24px)" }}>
                  Sample certificate scan
                </div>
              )}
              <div style={{ fontSize: 14, lineHeight: 1.65, color: "#555" }}>
                The degree certificate is identical to the on-campus award — it does not mention &quot;online&quot; as a mode. It is UGC-entitled, valid for government jobs, higher studies (including abroad via WES), and PSU recruitment.
              </div>
            </div>
          </section>

          <section className="detail-section" id="sec-reviews">
            <h2>Student reviews</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["Sneha Iyer", "Classes are genuinely live, not just recordings. Faculty responds on the forum within a day. Exams were smooth with online proctoring.", 5],
                ["Rohit Verma", "Good curriculum and the EMI made it affordable. Placement cell is helpful but you must be proactive with applications.", 4],
              ].map(([name, quote, stars]) => (
                <article style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 18 }} key={name}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#EBF2F6", color: "#555", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {(name as string).split(" ").map((part) => part[0]).join("")}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#363634" }}>{name}</span>
                    </div>
                    <span style={{ color: "#FDB515", fontSize: 13, letterSpacing: 1 }}>{"★".repeat(stars as number)}</span>
                  </div>
                  <div style={{ fontSize: 14, color: "#555", lineHeight: 1.6 }}>{quote}</div>
                </article>
              ))}
            </div>
          </section>

          {similarCourses.length ? (
            <section className="detail-section">
              <h2>Similar programs to consider</h2>
              <div className="grid three">
                {similarCourses.map((candidate) => (
                  <Link href={`/courses/${candidate.slug}`} className="uv-card" style={{ display: "block", border: "1px solid #CFDAE6", borderRadius: 8, padding: 16, color: "inherit" }} key={candidate.id}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#363634" }}>{candidate.name} — {candidate.university.shortName}</div>
                    <div style={{ fontSize: 13, color: "#555", marginTop: 6 }}>{candidate.duration} · {formatFee(candidate.fee)} · <span style={{ color: "#FDB515" }}>★</span> {candidate.rating}</div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="detail-section" id="sec-faq">
            <h2>Frequently asked questions</h2>
            <div className="faq-list">
              {courseFaqs.map(([question, answer]) => (
                <details className="faq-item" name="course-faq" key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>

        <aside className="right-rail">
          <CourseEnquiryCard courseId={course.id} />
          <Link href={`/compare?add=${course.id}`} style={{ display: "block", textAlign: "center", border: "1.5px solid #555", borderRadius: 4, height: 44, lineHeight: "44px", fontSize: 14, fontWeight: 700, color: "#555", background: "#fff" }}>Compare with similar programs</Link>
          <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 18, background: "#F4F3FC" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#363634", marginBottom: 8 }}>Why learners pick {course.university.shortName}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#555" }}>
              <span>{course.university.approvals[0]}, {course.university.approvals[1]}</span>
              <span>{course.university.placement}% placement assistance rate</span>
              <span>Weekend live classes suit working learners</span>
              <span>No-cost EMI from {course.emi}</span>
            </div>
          </div>
          <div style={{ borderRadius: 8, padding: 18, background: "linear-gradient(135deg,#4F46E5,#7C3AED)", color: "#fff" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Not sure this is the one?</div>
            <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5, marginBottom: 12 }}>Answer 5 questions and UnnatiAI ranks every program against your goal and budget.</div>
            <Link href="/recommender" style={{ display: "block", textAlign: "center", height: 40, lineHeight: "40px", background: "#fff", color: "#4F46E5", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>
              Get my shortlist
            </Link>
          </div>
        </aside>
      </div>
      <StickyMobileBar
        primary={{ label: "Enquire now", href: `/lead?course=${course.id}&intent=enquire`, openLead: true }}
        secondary={{ label: "Compare", href: `/compare?add=${course.id}` }}
      />
    </>
  );
}
