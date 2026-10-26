export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Compass } from "lucide-react";
import { Breadcrumb, ReadingApplyCta, ReadingToc } from "@/components/reading-page";
import { withSocial } from "@/lib/page-metadata";
import { SocialLinks } from "@/components/social-links";

export const metadata: Metadata = withSocial({
  title: "Content Team, Unnati Vidya",
  description: "Meet the shared editorial byline behind Unnati Vidya articles and learn how to use our online-degree guides and source links.",
  alternates: { canonical: "/authors/content-team" },
});
const sections = [
  { id: "what-we-cover", title: "What we cover" },
  { id: "reading-sources", title: "How to use our content" },
  { id: "content-review", title: "Review and corrections" },
  { id: "follow", title: "Follow Unnati Vidya" },
];
const RELATED_LINKS: Array<[string, string]> = [
  ["/how-we-verify", "How we verify our data"],
  ["/online-degree-guides", "Online degree guides"],
  ["/blog", "Online learning articles"],
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Use"],
  ["/refund-policy", "Refund and Cancellation Policy"],
];

// Author profile in the inner-page reading language (UI redesign 2026-10, scope note in plan §10).
export default function ContentTeamPage() {
  return <PublishedCatalogBoundary>
    <div className="uv-author">
      <section className="uv-page-hero" aria-labelledby="author-start">
        <div className="uv-page-hero-inner uv-author-hero">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Content Team" }]} />
          <div className="uv-author-id">
            <span className="uv-author-avatar" aria-hidden="true">UV</span>
            <div>
              <p className="uv-eyebrow">Editorial byline</p>
              <h1 id="author-start" className="uv-h1" tabIndex={-1}>Content Team, Unnati Vidya</h1>
            </div>
          </div>
          <p className="uv-lede">This is the shared editorial byline for Unnati Vidya articles and guides. Our content helps learners explore online degrees, compare options and prepare for the application process.</p>
          <p className="uv-author-updated">Last updated 3 October 2026 · Unnati Vidya</p>
        </div>
      </section>

      <div className="uv-read-body">
        <ReadingToc label="On this page" navLabel="On this page" items={sections.map(section => ({ href: `#${section.id}`, label: section.title }))} />

        <div className="uv-read-prose">
          <section aria-labelledby="what-we-cover">
            <h2 id="what-we-cover" className="uv-read-h2" tabIndex={-1}>What we cover</h2>
            <ul>
              <li>Degree choices, subjects and learning formats.</li>
              <li>Listed tuition, eligibility and questions to ask before applying.</li>
              <li>Program comparisons and practical online-learning guidance.</li>
            </ul>
            <nav className="uv-author-actions" aria-label="Read our content">
              <Link href="/blog" className="uv-g-tool"><BookOpen size={28} aria-hidden="true" /><span><strong>Browse articles</strong><small>Online learning, admissions and careers</small></span></Link>
              <Link href="/online-degree-guides" className="uv-g-tool"><Compass size={28} aria-hidden="true" /><span><strong>Explore degree guides</strong><small>Fees, eligibility, careers and recognition</small></span></Link>
            </nav>
          </section>
          <section aria-labelledby="reading-sources">
            <h2 id="reading-sources" className="uv-read-h2" tabIndex={-1}>How to use our content</h2>
            <p>Start with the sources linked on the page. Check the specific program, intake and fee category, including whether a fee applies to domestic, international or NRI learners.</p>
            <p>A publication or update date does not establish that every statement has been checked for the current admission cycle. Confirm time-sensitive details with the university before relying on them.</p>
            <p>Career examples are guidance, not promises of a job or salary. Ratings and placement figures are not a substitute for checking their source and methodology.</p>
          </section>
          <section aria-labelledby="content-review">
            <h2 id="content-review" className="uv-read-h2" tabIndex={-1}>Review and corrections</h2>
            <p>Verification across the listed universities is ongoing. Proposed catalog corrections require administrator review before publication; a prepared correction is not yet a published fact.</p>
            <p>If you notice an error, email <a href="mailto:admin@unnatividya.com">admin@unnatividya.com</a> with the page link, the detail in question and an official source where available. Please leave out personal application documents.</p>
            <p><Link href="/about">Learn how Unnati Vidya works</Link> and how to send an application enquiry.</p>
          </section>
          <section aria-labelledby="follow">
            <h2 id="follow" className="uv-read-h2" tabIndex={-1}>Follow Unnati Vidya</h2>
            <p>Unnati Vidya is also on YouTube, Instagram and Facebook.</p>
            <SocialLinks variant="labelled" />
          </section>
        </div>

        <ReadingApplyCta
          title="Questions about any of this?"
          copy={<>Email <a href="mailto:admin@unnatividya.com">admin@unnatividya.com</a>, or apply and our team will contact you.</>}
          href="/lead?intent=request-callback"
        />

        <section className="uv-read-section uv-read-related" aria-labelledby="author-related-title">
          <h2 id="author-related-title" className="uv-read-h2 is-small">Related</h2>
          <nav aria-label="Policies and resources">
            <ul className="uv-read-rows">
              {RELATED_LINKS.map(([href, label]) => <li key={href}><Link href={href} className="uv-read-row"><span className="uv-read-row-label">{label}</span><ArrowRight size={18} aria-hidden="true" className="uv-read-row-arrow" /></Link></li>)}
            </ul>
          </nav>
        </section>

        <a href="#author-start" className="uv-read-back">Back to top</a>
      </div>
    </div>
  </PublishedCatalogBoundary>;
}
