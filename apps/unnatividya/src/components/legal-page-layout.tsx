import Link from "next/link";
import type { ReactNode } from "react";
import { Mail } from "lucide-react";

// The three policies keep their own SEO URLs (UI redesign D §8); the design's tabs are links.
const POLICY_TABS = [
  { key: "privacy", href: "/privacy", label: "Privacy" },
  { key: "terms", href: "/terms", label: "Terms" },
  { key: "refund", href: "/refund-policy", label: "Refund policy" },
] as const;

export type PolicyKey = (typeof POLICY_TABS)[number]["key"];

// Text-page shell (Legal.dc.html): hero band with breadcrumb, title, date and, for the policies, an
// underline tab bar; then a section nav (sticky beside the text on wide screens, a collapsible
// list on phones) and the reading column with a contact footer box.
export function LegalPageLayout({ crumb, title, lastUpdated, sections = [], policy, children }: { crumb: string; title: string; lastUpdated: string; sections?: Array<{ id: string; title: string }>; policy?: PolicyKey; children: ReactNode }) {
  const links = <ol>{sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol>;
  return (
    <div className="uv-legal">
      <header className="uv-legal-hero">
        <div className="uv-legal-hero-inner">
          <nav aria-label="Breadcrumb"><ol className="uv-breadcrumb"><li><Link href="/">Home</Link></li><li aria-current="page">{crumb}</li></ol></nav>
          <h1 id="policy-start" tabIndex={-1} className="uv-legal-title">{title}</h1>
          <p className="uv-legal-updated">Last updated {lastUpdated} · Unnati Vidya</p>
          {policy ? <nav aria-label="Policies" className="uv-legal-tabs">
            {POLICY_TABS.map(tab => <Link key={tab.key} href={tab.href} aria-current={tab.key === policy ? "page" : undefined}>{tab.label}</Link>)}
          </nav> : null}
        </div>
      </header>

      <div className={`uv-legal-body${sections.length ? "" : " is-single"}`}>
        {sections.length > 0 && <>
          <nav aria-label="On this page" className="uv-legal-toc">
            <p className="uv-legal-toc-title">On this page</p>
            {links}
          </nav>
          <nav aria-label="On this page" className="uv-legal-toc-mobile">
            <details>
              <summary>On this page</summary>
              {links}
            </details>
          </nav>
        </>}
        <article className="uv-legal-content uv-company-prose">
          {children}
          <aside className="uv-legal-help" aria-label="Contact">
            <Mail size={18} aria-hidden="true" />
            {/* No phone number (owner decision); contact is email. */}
            <p>Questions about {policy ? "this policy" : "this page"}? Email <a href="mailto:admin@unnatividya.com">admin@unnatividya.com</a>.</p>
          </aside>
          {sections.length > 0 && <a href="#policy-start" className="uv-legal-back">Back to top</a>}
        </article>
      </div>
    </div>
  );
}
