import Link from "next/link";
import Image from "next/image";
import { approvalIconWidth } from "@/lib/approval-icons";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { SocialLinks } from "@/components/social-links";

// Footer from the design handoff (UVFooter) with the owner's required items: newsletter sign-up,
// all tools, Articles at /blog, email instead of a phone (§11 #16) and "How we verify" beside
// the institution badges (UI redesign Q12).
const columns: Array<{ title: string; label: string; links: Array<[string, string]> }> = [
  { title: "Explore", label: "Explore the website", links: [
    ["/courses", "All courses"], ["/universities", "Universities"], ["/compare", "Compare programs"],
    ["/recommender", "Find my course"], ["/specializations", "Specializations"], ["/shortlist", "Saved courses"],
  ] },
  { title: "Popular degrees", label: "Popular degrees", links: [
    ["/courses/online-mba-manipal-university-jaipur", "Online MBA"], ["/courses/online-bca-manipal-university-jaipur", "Online BCA"],
    ["/courses/online-mca-manipal-university-jaipur", "Online MCA"], ["/courses/online-bcom-manipal-university-jaipur", "Online B.Com"],
    ["/courses/online-msc-data-science-amity-online", "Online MSc Data Science"],
  ] },
  // Tools in the header menu's order: choose, afford, apply, study.
  { title: "Tools", label: "Learner tools", links: [
    ["/tools/mode-helper", "Mode helper"], ["/tools/specialization-finder", "Specialization finder"], ["/tools/eligibility-checker", "Eligibility checker"],
    ["/tools/emi-calculator", "EMI calculator"], ["/tools/total-cost", "Total cost planner"],
    ["/tools/recognition-check", "Recognition check"], ["/tools/document-checklist", "Document checklist"],
    ["/tools/study-planner", "Study-time planner"], ["/tools/exam-check", "Exams and device check"],
  ] },
  { title: "Resources", label: "Guides and articles", links: [
    ["/online-degree-guides", "Degree guides"], ["/online-degree-guides/fees", "Fees and EMI"], ["/online-degree-guides/admissions", "Admissions"],
    ["/online-degree-guides/international", "Applying from outside India"], ["/blog", "Articles"],
  ] },
  { title: "Company", label: "About and support", links: [
    ["/about", "About us"], ["/how-we-verify", "How we verify our data"],
  ] },
];

export function SiteFooter() {
  return <footer className="uvf">
    <div className="uvf-grid">
      <div className="uvf-brand">
        <Image src="/brand/unnatividya-logo-white.svg" alt="Unnati Vidya" width={197} height={32} className="uvf-logo" />
        <p>India&apos;s unbiased marketplace for online degrees from UGC-entitled universities. Compare, get counselled, enrol — all free.</p>
        <div className="uvf-badges">
          {[["ugc", "UGC"], ["naac", "NAAC"], ["aicte", "AICTE"]].map(([slug, label]) => (
            <span key={slug} className="uvf-badge"><Image src={`/approvals/${slug}.svg`} alt={label} width={approvalIconWidth(`/approvals/${slug}.svg`, 26)} height={26} /></span>
          ))}
          <Link href="/how-we-verify" className="uvf-verify">How we verify →</Link>
        </div>
        <SocialLinks />
      </div>
      {columns.map(column => <nav key={column.title} className="uvf-col" aria-label={column.label}>
        <h2>{column.title}</h2>
        {column.links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        {column.title === "Company" ? <>
          <Link href="/lead?intent=footer" rel="nofollow" data-open-lead>Apply now</Link>
          <a href="mailto:admin@unnatividya.com" className="uvf-contact">admin@unnatividya.com</a>
        </> : null}
      </nav>)}
    </div>
    <div className="uvf-news"><NewsletterSignup /></div>
    <div className="uvf-bottom">
      <span>© 2026 Unnati Vidya. All rights reserved.</span>
      <nav aria-label="Legal policies">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/refund-policy">Refund policy</Link>
      </nav>
    </div>
  </footer>;
}
