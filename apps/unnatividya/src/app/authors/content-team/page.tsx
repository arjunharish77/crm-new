export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout } from "@/components/legal-page-layout";

export const metadata: Metadata = {
  title: "Content Team, Unnati Vidya",
  description: "Meet the shared editorial byline behind Unnati Vidya articles and learn how to use our online-degree guides and source links.",
  alternates: { canonical: "/authors/content-team" },
};
const sections = [
  { id: "what-we-cover", title: "What we cover" },
  { id: "reading-sources", title: "How to use our content" },
  { id: "content-review", title: "Review and corrections" },
];
export default function ContentTeamPage() {
  return <PublishedCatalogBoundary>
    <LegalPageLayout crumb="Content Team" title="Content Team, Unnati Vidya" lastUpdated="3 October 2026" sections={sections}>
      <div className="information-reading">
        <p>This is the shared editorial byline for Unnati Vidya articles and guides. Our content helps learners explore online degrees, compare options and prepare for the application process.</p>
        <section aria-labelledby="what-we-cover">
          <h2 id="what-we-cover" tabIndex={-1}>What we cover</h2>
          <ul>
            <li>Degree choices, subjects and learning formats.</li>
            <li>Listed tuition, eligibility and questions to ask before applying.</li>
            <li>Program comparisons and practical online-learning guidance.</li>
          </ul>
          <nav className="information-actions" aria-label="Read our content">
            <Link href="/blog" className="information-action">Browse articles</Link>
            <Link href="/online-degree-guides" className="information-action">Explore degree guides</Link>
          </nav>
        </section>
        <section aria-labelledby="reading-sources">
          <h2 id="reading-sources" tabIndex={-1}>How to use our content</h2>
          <p>Start with the sources linked on the page. Check the specific program, intake and fee category, including whether a fee applies to domestic, international or NRI learners.</p>
          <p>A publication or update date does not establish that every statement has been checked for the current admission cycle. Confirm time-sensitive details with the university before relying on them.</p>
          <p>Career examples are guidance, not promises of a job or salary. Ratings and placement figures are not a substitute for checking their source and methodology.</p>
        </section>
        <section aria-labelledby="content-review">
          <h2 id="content-review" tabIndex={-1}>Review and corrections</h2>
          <p>Verification across the listed universities is ongoing. Proposed catalog corrections require administrator review before publication; a prepared correction is not yet a published fact.</p>
          <p>If you notice an error, email <a href="mailto:admin@unnatividya.com">admin@unnatividya.com</a> with the page link, the detail in question and an official source where available. Please leave out personal application documents.</p>
          <p><Link href="/about">Learn how Unnati Vidya works</Link> and how to send an application enquiry.</p>
        </section>
      </div>
    </LegalPageLayout>
  </PublishedCatalogBoundary>;
}
