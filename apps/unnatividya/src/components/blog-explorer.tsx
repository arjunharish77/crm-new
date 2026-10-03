"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BlogPost } from "@/data/blog";

export function BlogExplorer({ posts }: { posts: BlogPost[] }) {
  const params = useSearchParams();
  const categories = [...new Set(posts.map(post => post.category))].sort();
  const category = categories.find(value => value === params.get("category")) || "";
  const query = (params.get("q") || "").slice(0,200);
  const sort = params.get("sort") === "title" ? "title" : "newest";
  const text = query.trim().toLowerCase();
  const filtered = posts.filter(post => (!category || post.category === category) && (!text || `${post.title} ${post.excerpt} ${post.category}`.toLowerCase().includes(text)))
    .sort((a,b) => sort === "title" ? a.title.localeCompare(b.title) : b.publishedDate.localeCompare(a.publishedDate) || a.title.localeCompare(b.title));
  function update(key: string, value: string, replace = false) {
    const url = new URL(window.location.href);
    if(value) url.searchParams.set(key,value); else url.searchParams.delete(key);
    if(replace) window.history.replaceState(null,"",url); else window.history.pushState(null,"",url);
  }
  function reset() {
    const url = new URL(window.location.href);
    ["q","category","sort"].forEach(key => url.searchParams.delete(key));
    window.history.pushState(null,"",url);
  }
  return <section className="article-explorer" aria-label="Find articles">
    <div className="article-discovery-controls">
      <div><label htmlFor="article-search">Search articles</label><input type="search" id="article-search" value={query} maxLength={200} onChange={event => update("q",event.target.value,true)} placeholder="Topic, course or keyword" /></div>
      <div><label htmlFor="article-sort">Sort articles</label><select id="article-sort" value={sort} onChange={event => update("sort",event.target.value === "newest" ? "" : event.target.value)}><option value="newest">Newest first</option><option value="title">Title A–Z</option></select></div>
    </div>
    <div className="article-categories" role="group" aria-label="Article categories">{["",...categories].map(value => <button type="button" className="btn secondary" key={value} aria-pressed={value === category} onClick={() => update("category",value)}>{value || "All topics"}</button>)}</div>
    <div className="article-results-toolbar"><p role="status">{filtered.length} of {posts.length} articles</p>{(query || category || sort !== "newest") && <button type="button" className="btn secondary" onClick={reset}>Reset search and filters</button>}</div>
    {filtered.length ? <div className="article-discovery-grid">{filtered.map(post => <article className="article-discovery-card" key={post.slug}>
      <div className="article-discovery-cover"><Image src={post.cover} alt="" fill sizes="(max-width:640px) 90vw, (max-width:1000px) 45vw, 360px" style={{objectFit:"cover"}} /></div>
      <div className="article-discovery-content"><p className="article-card-meta">{post.category} · {post.read}</p><h2><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2><p>{post.excerpt}</p>
        <p className="article-card-byline">Content Team, Unnati Vidya<br /><time dateTime={post.publishedDate}>{new Date(`${post.publishedDate}T00:00:00Z`).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"})}</time></p>
        <Link className="article-read-link" href={`/blog/${post.slug}`} aria-label={`Read article: ${post.title}`}>Read article →</Link>
      </div>
    </article>)}</div> : <div className="illustrated-empty-state"><h2>No articles match</h2><p>Try a broader keyword or reset your search and topic filters.</p><Link href="/online-degree-guides" className="btn secondary">Browse degree guides</Link></div>}
  </section>;
}
