import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

// Reading-page building blocks (UI redesign 2026-10, appendix C §6, Article.dc.html) shared by blog
// articles (ArticleView, also used by the CMS preview), the four programmatic guide types and the
// author page. Server-safe: no hooks, so client explorers can import the topic map too.

export type Crumb = { label: string; href?: string };

// Guide topics as stored in the URL (`?topic=`) and listings, with the design's short pill labels.
export const GUIDE_TOPICS = [
  { topic: "Fees & payments", short: "Fees", type: "fees" },
  { topic: "Eligibility & admission", short: "Eligibility", type: "eligibility" },
  { topic: "Career scope", short: "Careers", type: "career-scope" },
  { topic: "Recognition & validity", short: "Approvals", type: "ugc-approval" },
] as const;

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return <nav aria-label="Breadcrumb">
    <ol className="uv-breadcrumb">
      {items.map((item, index) => <li key={`${item.label}-${index}`}>
        {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
      </li>)}
    </ol>
  </nav>;
}

// Byline exactly "Content Team, Unnati Vidya" (owner rule), linked to the truthful profile.
export function Byline() {
  return <span className="uv-read-byline">
    <span className="uv-read-avatar" aria-hidden="true">UV</span>
    <Link href="/authors/content-team">Content Team, Unnati Vidya</Link>
  </span>;
}

export function ReadingHero({ crumbs, tag, title, deck, meta }: { crumbs: Crumb[]; tag?: string; title: string; deck?: ReactNode; meta: ReactNode }) {
  return <header className="uv-read-hero">
    <div className="uv-read-hero-inner">
      <Breadcrumb items={crumbs} />
      {tag ? <span className="uv-read-tag">{tag}</span> : null}
      <h1 className="uv-read-title">{title}</h1>
      {deck ? <p className="uv-read-deck">{deck}</p> : null}
      <div className="uv-read-meta">{meta}</div>
    </div>
  </header>;
}

// The design's "In this guide" box as real, keyboard-reachable links (C-A8).
export function ReadingToc({ label, navLabel, items }: { label: string; navLabel: string; items: Array<{ href: string; label: string }> }) {
  if (!items.length) return null;
  return <nav className="uv-read-toc" aria-label={navLabel}>
    <p className="uv-read-toc-label">{label}</p>
    <ol>{items.map(item => <li key={item.href}><a href={item.href}>{item.label}</a></li>)}</ol>
  </nav>;
}

export type RelatedItem = { href: string; label: string; thumb?: ReactNode };

export function RelatedRows({ id, title, items }: { id: string; title: string; items: RelatedItem[] }) {
  if (!items.length) return null;
  return <section className="uv-read-section uv-read-related" id={id} tabIndex={-1} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="uv-read-h2 is-small">{title}</h2>
    <ul className="uv-read-rows">
      {items.map(item => <li key={item.href}>
        <Link href={item.href} className="uv-read-row">
          {item.thumb ? <span className="uv-read-row-thumb">{item.thumb}</span> : null}
          <span className="uv-read-row-label">{item.label}</span>
          <ArrowRight size={18} aria-hidden="true" className="uv-read-row-arrow" />
        </Link>
      </li>)}
    </ul>
  </section>;
}

// One consistent in-flow Apply now card (spec §6.3 #9), replacing the old desktop rail.
export function ReadingApplyCta({ title, copy, href, secondary, note }: { title: string; copy: ReactNode; href: string; secondary?: ReactNode; note?: string }) {
  return <section className="uv-read-cta">
    <div>
      <h2 className="uv-read-cta-title">{title}</h2>
      <p className="uv-read-cta-copy">{copy}</p>
      {note ? <p className="uv-read-cta-note">{note}</p> : null}
    </div>
    <div className="uv-read-cta-actions">
      {secondary}
      <Link href={href} rel="nofollow" data-open-lead className="btn primary">Apply now</Link>
    </div>
  </section>;
}
