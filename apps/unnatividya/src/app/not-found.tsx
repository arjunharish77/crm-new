import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container missing-page" aria-labelledby="missing-page-title">
      <p className="missing-page-code">404 · Page not found</p>
      <h1 id="missing-page-title">Let’s get you back to exploring</h1>
      <p>The page may have moved, or the link may be incorrect. Search for a course or choose where to go next.</p>
      <form action="/courses" method="get" role="search" aria-label="Find a course" className="missing-page-search">
        <label htmlFor="missing-course-search">Search courses</label>
        <div>
          <input id="missing-course-search" name="q" type="search" placeholder="Try MBA, commerce or data science" maxLength={160} />
          <button type="submit" className="btn primary">Search courses</button>
        </div>
      </form>
      <nav aria-label="Explore from here" className="missing-page-links">
        <Link href="/courses">Browse all courses</Link>
        <Link href="/universities">Explore universities</Link>
        <Link href="/online-degree-guides">Read degree guides</Link>
        <Link href="/">Go to homepage</Link>
      </nav>
    </section>
  );
}
