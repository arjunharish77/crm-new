export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout } from "@/components/legal-page-layout";

export const metadata: Metadata = {
  title: "About Unnati Vidya",
  description: "Learn how Unnati Vidya helps you explore online degrees, compare course options and send an application enquiry.",
  alternates: { canonical: "/about" },
};
const sections = [
  { id: "explore-options", title: "Explore your options" },
  { id: "application-enquiry", title: "How an enquiry works" },
  { id: "check-information", title: "Before making a decision" },
  { id: "your-information", title: "Your information and policies" },
];

export default function AboutPage() {
  return <PublishedCatalogBoundary>
    <LegalPageLayout crumb="About" title="About Unnati Vidya" lastUpdated="3 October 2026" sections={sections}>
      <div className="information-reading">
        <p>Unnati Vidya helps learners explore online degrees, understand course options and send an application enquiry. We are an information and enquiry platform; the university decides admission and awards the degree.</p>
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
            <li>Continue to save your contact details, then choose a course and optionally a university. We may follow up even if you leave before finishing.</li>
            <li>Verify your email to unlock interactive course comparison.</li>
          </ol>
          <p>An enquiry is not a university application or an admission confirmation. Confirm the university’s application requirements before submitting documents or paying fees.</p>
          <Link className="information-action btn primary" href="/lead?intent=about" data-open-lead>Apply now</Link>
        </section>
        <section aria-labelledby="check-information">
          <h2 id="check-information" tabIndex={-1}>Before making a decision</h2>
          <p>Check the linked official university sources for current eligibility, fees, intake dates and refund terms. Recognition must be checked for the specific program and academic session. A listing or comparison is not an admission or career-outcome guarantee.</p>
          <p>Catalog verification is ongoing. Ratings, reviews and salary or placement figures should not be treated as independently verified outcomes.</p>
          <p>Our articles use the shared byline <Link href="/authors/content-team">Content Team, Unnati Vidya</Link>. Read our <Link href="/online-degree-guides">degree guides</Link> to prepare questions for the university.</p>
        </section>
        <section aria-labelledby="your-information">
          <h2 id="your-information" tabIndex={-1}>Your information and policies</h2>
          <p>Read the <Link href="/privacy">Privacy Policy</Link> for how enquiry details are handled, the <Link href="/terms">Terms of Use</Link> for using the site, and the <Link href="/refund-policy">Refund and Cancellation Policy</Link> before making a payment decision.</p>
        </section>
      </div>
    </LegalPageLayout>
  </PublishedCatalogBoundary>;
}
