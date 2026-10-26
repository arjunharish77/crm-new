export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import Link from "next/link";
import { Mail, ReceiptIndianRupee, ShieldCheck, LifeBuoy } from "lucide-react";
import { withSocial } from "@/lib/page-metadata";
import { SocialLinks } from "@/components/social-links";

export const metadata: Metadata = withSocial({
  title: "About Unnati Vidya",
  description: "Learn how Unnati Vidya helps you explore online degrees, compare course options and send an application enquiry.",
  alternates: { canonical: "/about" },
});

// Owner-confirmed wording only (claims register; UI redesign Q8 and Q12). No phone, no "unbiased by
// design", no Jobs/Community/30+/"till graduation".
const VALUES = [
  { icon: ReceiptIndianRupee, title: "No hidden charges", copy: "Counselling is free for learners, and Unnati Vidya adds no charge on top of the university fee." },
  { icon: ShieldCheck, title: "Approvals you can check", copy: "We link each program to the official UGC-DEB list and show when we last checked it." },
  { icon: LifeBuoy, title: "Support till enrolment", copy: "Documents, loans and follow-ups handled until your LMS login arrives." },
];

const STEPS: Array<[string, string]> = [
  ["Compare side by side", "Fees, EMIs, eligibility, recognition and curriculum, with links to the university's own sources."],
  ["Talk to a counsellor", "Free guidance to sanity-check your shortlist against your career plan."],
  ["Enrol with support", "We help with documents, loans and admission follow-ups until your LMS login arrives."],
];

const STATS: Array<[string, string]> = [
  ["10k+", "learners guided"],
  ["₹0 extra", "lowest-fee guarantee"],
  ["No hidden charges", "nothing added to the university fee"],
  ["Support", "till enrolment: documents and follow-ups"],
  ["Approvals", "you can check on the official UGC-DEB list"],
  ["Loans", "help with education-loan options"],
];

export default function AboutPage() {
  return <PublishedCatalogBoundary>
    <div className="uv-about">
      <section className="uv-page-hero" aria-labelledby="about-title">
        <div className="uv-page-hero-inner uv-company-hero">
          <nav aria-label="Breadcrumb"><ol className="uv-breadcrumb"><li><Link href="/">Home</Link></li><li aria-current="page">About</li></ol></nav>
          <p className="uv-eyebrow">About Unnati Vidya</p>
          <h1 id="about-title" className="uv-about-title">India&apos;s unbiased marketplace for online degrees from <span>UGC-entitled universities.</span></h1>
          <p className="uv-about-lede">Compare, get counselled, enrol — all free. Unnati Vidya helps learners explore online degrees, understand course options and send an application enquiry. We are an information and enquiry platform; the university decides admission and awards the degree.</p>
        </div>
      </section>

      <div className="uv-shell uv-about-main">
        <section aria-labelledby="about-values-title">
          <h2 id="about-values-title" className="sr-only">What we offer</h2>
          <ul className="uv-about-values">
            {VALUES.map(({ icon: Icon, title, copy }) => <li key={title}>
              <Icon size={32} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </li>)}
          </ul>
        </section>

        <section className="uv-about-how" aria-labelledby="about-how-title">
          <div>
            <h2 id="about-how-title" className="uv-h2 is-inner">How Unnati Vidya works</h2>
            <ol className="uv-about-steps">
              {STEPS.map(([title, copy]) => <li key={title}><strong>{title}</strong><span>{copy}</span></li>)}
            </ol>
          </div>
          <dl className="uv-about-stats">
            {STATS.map(([value, label]) => <div key={value}><dt>{value}</dt><dd>{label}</dd></div>)}
          </dl>
        </section>

        <div className="uv-about-reading uv-company-prose">
          <section aria-labelledby="explore-options">
            <h2 id="explore-options" tabIndex={-1}>Explore your options</h2>
            <ul>
              <li><Link href="/courses">Browse courses</Link> by degree level, subject, university and listed tuition.</li>
              <li><Link href="/shortlist">Save a shortlist</Link> in this browser and choose courses to compare.</li>
              <li><Link href="/recommender">Find my course</Link> uses your level, subject and budget preferences to filter the catalog. Recommendations are free.</li>
              <li><Link href="/tools/emi-calculator">Estimate payments</Link> using your own deposit, interest rate and repayment term.</li>
            </ul>
          </section>
          <section aria-labelledby="application-enquiry">
            <h2 id="application-enquiry" tabIndex={-1}>How an enquiry works</h2>
            <ol>
              <li>Select <strong>Apply now</strong>, enter your name, email and phone, and review the consent statement.</li>
              <li>Continue to save your contact details, then choose a course and optionally a university. Our team may contact you about your enquiry.</li>
              <li>Verify your email to unlock interactive course comparison.</li>
            </ol>
            <p>An enquiry is not a university application or an admission confirmation. Confirm the university’s application requirements before submitting documents or paying fees.</p>
          </section>
          <section aria-labelledby="check-information">
            <h2 id="check-information" tabIndex={-1}>Before making a decision</h2>
            <p>Check the linked official university sources for current eligibility, fees, intake dates and refund terms. Recognition must be checked for the specific program and academic session. A listing or comparison is not an admission or career-outcome guarantee.</p>
            <p>Catalog verification is ongoing. Ratings, reviews and salary or placement figures should not be treated as independently verified outcomes. <Link href="/how-we-verify">How we verify our data</Link></p>
            <p>Our articles use the shared byline <Link href="/authors/content-team">Content Team, Unnati Vidya</Link>. Read our <Link href="/online-degree-guides">degree guides</Link> to prepare questions for the university.</p>
          </section>
          <section aria-labelledby="your-information">
            <h2 id="your-information" tabIndex={-1}>Your information and policies</h2>
            <p>Read the <Link href="/privacy">Privacy Policy</Link> for how enquiry details are handled, the <Link href="/terms">Terms of Use</Link> for using the site, and the <Link href="/refund-policy">Refund and Cancellation Policy</Link> before making a payment decision.</p>
          </section>
        </div>

        <div className="uv-about-contact">
          <section className="uv-navy-panel uv-about-talk" aria-labelledby="about-talk-title">
            <div>
              <h2 id="about-talk-title">Talk to us</h2>
              <p>Counselling is free. Apply now and our team will contact you about your enquiry, or email <a href="mailto:admin@unnatividya.com">admin@unnatividya.com</a>.</p>
            </div>
            <div className="uv-about-talk-actions">
              <Link className="btn on-navy large" href="/lead?intent=about" rel="nofollow" data-open-lead>Apply now</Link>
              <a className="btn outline-on-navy large" href="mailto:admin@unnatividya.com"><Mail size={18} aria-hidden="true" />Email us</a>
            </div>
          </section>
          <section className="uv-about-address" aria-labelledby="contact">
            <h2 id="contact" tabIndex={-1}>Contact us</h2>
            {/* Owner-provided details (5 October 2026). No phone number (owner decision). */}
            <address>
              <strong>Unnati Vidya</strong><br />
              A-116, URBTECH Trade Centre<br />
              Noida, Uttar Pradesh 201304<br />
              Email: <a href="mailto:admin@unnatividya.com">admin@unnatividya.com</a>
            </address>
            <h3 className="uv-about-follow">Follow Unnati Vidya</h3>
            <SocialLinks variant="labelled" />
          </section>
        </div>
        <p className="uv-company-updated">Last updated 5 October 2026 · Unnati Vidya</p>
      </div>
    </div>
  </PublishedCatalogBoundary>;
}
