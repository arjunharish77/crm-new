import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Search, SearchX } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
  description: "This page may have moved, or the link may be incorrect. Search Unnati Vidya for an online degree course.",
};

// 404 in the redesign's centred empty-state style (two tilted cards, icon, dots).
export default function NotFound() {
  return (
    <section className="uv-status-page" aria-labelledby="missing-page-title">
      <div className="uv-status-card is-wide">
        <div className="uv-empty-art" aria-hidden="true"><span><SearchX size={26} /></span><i /><i /></div>
        <p className="uv-status-code">404 · Page not found</p>
        <h1 id="missing-page-title">Let’s get you back to exploring</h1>
        <p>The page may have moved, or the link may be incorrect. Search for a course or choose where to go next.</p>
        <form action="/courses" method="get" role="search" aria-label="Find a course" className="uv-status-search">
          <label htmlFor="missing-course-search">Search courses</label>
          <div>
            <Search size={20} aria-hidden="true" />
            <input id="missing-course-search" name="q" type="search" placeholder="Try MBA, commerce or data science" maxLength={160} />
            <button type="submit" className="btn primary">Search courses</button>
          </div>
        </form>
        <nav aria-label="Explore from here" className="uv-status-links">
          <Link href="/courses">Browse all courses <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/universities">Explore universities <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/online-degree-guides">Read degree guides <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/">Go to homepage <ArrowRight size={16} aria-hidden="true" /></Link>
        </nav>
      </div>
    </section>
  );
}
