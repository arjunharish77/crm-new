"use client";

import Image from "next/image";
import Link from "next/link";
import { useLiveSearchParams, useUrlSearchText, writeUrl } from "@/lib/use-live-search-params";
import { Search } from "lucide-react";
import type { BlogPost } from "@/data/blog";

// URL state (q, category, sort) shared by the hero pills and the explorer; both read
// useLiveSearchParams (writeUrl updates them immediately).
function useArticleFilters(posts: BlogPost[]) {
  const params = useLiveSearchParams();
  const categories = [...new Set(posts.map(post => post.category))].sort();
  const category = categories.find(value => value === params.get("category")) || "";
  const query = (params.get("q") || "").slice(0, 200);
  const sort = params.get("sort") === "title" ? "title" : "newest";
  return { categories, category, query, sort };
}

function update(key: string, value: string, replace = false) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  writeUrl(url, replace);
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const newestFirst = (a: BlogPost, b: BlogPost) => b.publishedDate.localeCompare(a.publishedDate) || a.title.localeCompare(b.title);

export function BlogCategoryPills({ posts }: { posts: BlogPost[] }) {
  const { categories, category } = useArticleFilters(posts);
  return <div className="uv-g-pills" role="group" aria-label="Article categories">
    {["", ...categories].map(value => <button type="button" className="uv-g-pill" key={value || "all"} aria-pressed={value === category} onClick={() => update("category", value)}>{value || "All"}</button>)}
  </div>;
}

export function BlogExplorer({ posts }: { posts: BlogPost[] }) {
  const { category, query, sort } = useArticleFilters(posts);
  const [searchText, setSearchText] = useUrlSearchText(query, value => update("q", value, true));
  const text = query.trim().toLowerCase();
  const filtered = posts.filter(post => (!category || post.category === category) && (!text || `${post.title} ${post.excerpt} ${post.category}`.toLowerCase().includes(text)))
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : newestFirst(a, b));
  // The featured card is the newest article, shown on the unfiltered view only.
  const featured = !query && !category ? [...posts].sort(newestFirst)[0] : undefined;
  function reset() {
    const url = new URL(window.location.href);
    ["q", "category", "sort"].forEach(key => url.searchParams.delete(key));
    writeUrl(url);
  }
  return <section className="uv-g-explorer" aria-label="Find articles">
    <div className="uv-g-filters">
      <div className="uv-g-field is-search">
        <label htmlFor="article-search">Search articles</label>
        <span className="uv-g-input">
          <Search size={18} aria-hidden="true" />
          <input type="search" id="article-search" value={searchText} maxLength={200} onChange={event => setSearchText(event.target.value)} placeholder="Topic, course or keyword" />
        </span>
      </div>
      <div className="uv-g-field">
        <label htmlFor="article-sort">Sort articles</label>
        <select id="article-sort" value={sort} onChange={event => update("sort", event.target.value === "newest" ? "" : event.target.value)}><option value="newest">Newest first</option><option value="title">Title A–Z</option></select>
      </div>
    </div>
    <div className="uv-g-toolbar"><p role="status">{filtered.length} of {posts.length} articles</p>{(query || category || sort !== "newest") && <button type="button" className="btn secondary" onClick={reset}>Reset search and filters</button>}</div>

    {featured ? <Link href={`/blog/${featured.slug}`} className="uv-g-featured is-article" aria-labelledby="article-featured-title">
      <span className="uv-g-featured-cover">
        <Image src={featured.cover} alt="" fill sizes="(max-width: 760px) calc(100vw - 32px), 600px" />
        <span className="uv-g-featured-label">Featured article</span>
      </span>
      <span className="uv-g-featured-body">
        <span className="uv-g-featured-tag">{featured.category}</span>
        <h2 id="article-featured-title" className="uv-g-featured-title">{featured.title}</h2>
        <span className="uv-g-featured-desc">{featured.excerpt}</span>
        <span className="uv-g-featured-meta">Content Team, Unnati Vidya · <time dateTime={featured.publishedDate}>{shortDate(featured.publishedDate)}</time>{featured.updatedDate ? <> · Updated <time dateTime={featured.updatedDate}>{shortDate(featured.updatedDate)}</time></> : null} · {featured.read}</span>
      </span>
    </Link> : null}

    {filtered.length ? <section className="uv-g-group" aria-labelledby="article-list-title">
      <h2 id="article-list-title" className="uv-h2 is-inner">{category ? `${category} articles` : "All articles"}</h2>
      <div className="uv-g-grid">{filtered.map(post => <article className="uv-g-card is-article" key={post.slug}>
        <div className="uv-g-card-cover"><Image src={post.cover} alt="" fill sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1000px) 45vw, 400px" /></div>
        <div className="uv-g-card-body">
          <p className="uv-g-card-meta"><span className="uv-g-card-tag">{post.category}</span><span>{post.read}</span></p>
          <h3 className="uv-g-card-title"><Link href={`/blog/${post.slug}`}>{post.title}</Link></h3>
          <p className="uv-g-card-desc">{post.excerpt}</p>
          <p className="uv-g-card-byline">Content Team, Unnati Vidya · <time dateTime={post.publishedDate}>{shortDate(post.publishedDate)}</time></p>
          <Link className="uv-g-card-read" href={`/blog/${post.slug}`} aria-label={`Read article: ${post.title}`}>Read article →</Link>
        </div>
      </article>)}</div>
    </section> : <div className="uv-empty">
      <div className="uv-empty-art" aria-hidden="true"><span><Search size={26} /></span><i /><i /></div>
      <h2>No articles match</h2>
      <p>Try a broader keyword or reset your search and topic filters.</p>
      <div className="uv-empty-actions"><Link href="/online-degree-guides" className="btn secondary">Browse degree guides</Link></div>
    </div>}
  </section>;
}
