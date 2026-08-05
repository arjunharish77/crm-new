import type { Metadata } from "next";
import Link from "next/link";
import { AdminLogoutButton } from "@/components/admin-logout-button";

export const metadata: Metadata = {
  title: "CMS",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminPage() {
  const cards = [
    ["Leads", "/admin/leads", "View captured leads, verification state, and CRM sync status.", "Inbox"],
    ["Universities", "/admin/universities", "Manage university source data and public visibility.", "Catalog"],
    ["Courses", "/admin/courses", "Review imported course data before publishing.", "Review"],
    ["Content Quality", "/admin/content-quality", "Find missing source facts, thin content, and publish conflicts before indexing.", "SEO"],
    ["Programmatic SEO", "/admin/programmatic-seo", "Generate safe route candidates for fees, eligibility, UGC, career, and comparison intent.", "SEO"],
    ["Redirects", "/admin/redirects", "Manage SEO-safe 301/302 redirects for changed slugs and retired campaign URLs.", "SEO"],
    ["Source Imports", "/admin/source-imports", "Review fetched source pages before applying catalog changes.", "Import"],
    ["CRM Sync", "/admin/crm-sync", "Configure external API push and mappings.", "Integration"],
  ];

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-hero">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>Unnati Vidya CMS</h1>
            <p>Manage captured leads, source-reviewed course content, and external CRM/API handoff.</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/admin/leads" className="btn primary">Open lead inbox</Link>
            <AdminLogoutButton />
          </div>
        </div>

        <div className="admin-grid">
          {cards.map(([label, href, copy, tag]) => (
            <article className="card admin-tile" key={href}>
              <span className="admin-tag">{tag}</span>
              <h2>{label}</h2>
              <p>{copy}</p>
              <Link href={href} className="text-link">
                Open
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
