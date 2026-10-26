"use client";
import Link from "next/link";
import { useLiveSearchParams, useUrlSearchText, writeUrl } from "@/lib/use-live-search-params";
import { BadgeCheck, Banknote, GraduationCap, Search, TrendingUp, type LucideIcon } from "lucide-react";
import { GUIDE_TOPICS } from "@/components/reading-page";

export type GuideListing = { slug: string; degree: string; topic: string; title: string; description: string; date?: string };

const ICONS: Record<string, LucideIcon> = {
  "Fees & payments": Banknote,
  "Eligibility & admission": GraduationCap,
  "Career scope": TrendingUp,
  "Recognition & validity": BadgeCheck,
};
const shortTopic = (topic: string) => GUIDE_TOPICS.find(item => item.topic === topic)?.short || topic;

// URL state (q, topic, degree) shared by the hero pills and the explorer below; both read
// useLiveSearchParams (writeUrl updates them immediately).
function useGuideFilters(guides: GuideListing[]) {
  const params = useLiveSearchParams();
  const query = (params.get("q") || "").slice(0, 200);
  const topics = [...new Set(guides.map(guide => guide.topic))];
  const degrees = [...new Set(guides.map(guide => guide.degree))].sort();
  const topic = topics.includes(params.get("topic") || "") ? params.get("topic")! : "";
  const degree = degrees.includes(params.get("degree") || "") ? params.get("degree")! : "";
  return { query, topics, degrees, topic, degree };
}

function update(key: string, value: string, replace = false) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  writeUrl(url, replace);
}

export function GuideTopicPills({ guides }: { guides: GuideListing[] }) {
  const { topics, topic } = useGuideFilters(guides);
  return <div className="uv-g-pills" role="group" aria-label="Guide topics">
    {["", ...topics].map(value => <button type="button" key={value || "all"} className="uv-g-pill" aria-pressed={value === topic} onClick={() => update("topic", value)}>
      {value ? shortTopic(value) : "All"}
    </button>)}
  </div>;
}

function GuideCard({ guide }: { guide: GuideListing }) {
  const Icon = ICONS[guide.topic] || Banknote;
  const titleId = `guide-card-${guide.slug}`;
  return <Link className="uv-g-card" href={`/online-degree-guides/${guide.slug}`} aria-labelledby={titleId}>
    <span className="uv-g-card-top">
      <span className="uv-g-card-icon" aria-hidden="true"><Icon size={24} /></span>
      <span className="uv-g-card-tag">{shortTopic(guide.topic)}</span>
    </span>
    <h3 id={titleId} className="uv-g-card-title">{guide.title}</h3>
    <span className="uv-g-card-desc">{guide.description}</span>
    <span className="uv-g-card-foot"><span>{guide.degree}</span><span className="uv-g-card-more" aria-hidden="true">Read guide →</span></span>
  </Link>;
}

export function GuideExplorer({ guides, featuredSlug }: { guides: GuideListing[]; featuredSlug?: string }) {
  const { query, topics, degrees, topic, degree } = useGuideFilters(guides);
  const [searchText, setSearchText] = useUrlSearchText(query, value => update("q", value, true));
  const text = query.trim().toLowerCase();
  const filtered = guides.filter(guide => (!topic || guide.topic === topic) && (!degree || guide.degree === degree) && `${guide.degree} ${guide.topic} ${guide.description}`.toLowerCase().includes(text));
  const filteredView = Boolean(query || topic || degree);
  const featured = !filteredView ? guides.find(guide => guide.slug === featuredSlug) : undefined;
  function reset() { const url = new URL(window.location.href); ["q", "topic", "degree"].forEach(key => url.searchParams.delete(key)); writeUrl(url); }
  const FeaturedIcon = featured ? ICONS[featured.topic] || Banknote : Banknote;
  return <section className="uv-g-explorer" aria-label="Find degree guides">
    <div className="uv-g-filters">
      <div className="uv-g-field is-search">
        <label htmlFor="guide-search">Search guides</label>
        <span className="uv-g-input">
          <Search size={18} aria-hidden="true" />
          <input id="guide-search" type="search" value={searchText} maxLength={200} onChange={event => setSearchText(event.target.value)} placeholder="Degree or topic" />
        </span>
      </div>
      <div className="uv-g-field">
        <label htmlFor="guide-degree">Degree</label>
        <select id="guide-degree" value={degree} onChange={event => update("degree", event.target.value)}><option value="">All degrees</option>{degrees.map(value => <option key={value}>{value}</option>)}</select>
      </div>
    </div>
    <div className="uv-g-toolbar"><p role="status">{filtered.length} of {guides.length} guides</p>{filteredView && <button type="button" className="btn secondary" onClick={reset}>Reset search and filters</button>}</div>

    {featured ? <Link href={`/online-degree-guides/${featured.slug}`} className="uv-g-featured" aria-labelledby="guide-featured-title">
      <span className="uv-g-featured-panel">
        <FeaturedIcon size={44} aria-hidden="true" />
        <span className="uv-g-featured-label">Featured guide</span>
      </span>
      <span className="uv-g-featured-body">
        <span className="uv-g-featured-tag">{shortTopic(featured.topic)}</span>
        <h2 id="guide-featured-title" className="uv-g-featured-title">{featured.title}</h2>
        <span className="uv-g-featured-desc">{featured.description}</span>
        <span className="uv-g-featured-meta">Content Team, Unnati Vidya{featured.date ? ` · Reviewed ${featured.date}` : ""}</span>
      </span>
    </Link> : null}

    {filtered.length ? topics.map(value => {
      const group = filtered.filter(guide => guide.topic === value);
      const headingId = `guide-group-${shortTopic(value).toLowerCase()}`;
      return group.length ? <section className="uv-g-group" key={value} aria-labelledby={headingId}>
        <h2 id={headingId} className="uv-h2 is-inner">{value}</h2>
        <div className="uv-g-grid">{group.map(guide => <GuideCard key={guide.slug} guide={guide} />)}</div>
      </section> : null;
    }) : <div className="uv-empty">
      <div className="uv-empty-art" aria-hidden="true"><span><Search size={26} /></span><i /><i /></div>
      <h2>No guides match</h2>
      <p>Try another degree, topic or keyword, or reset your filters.</p>
      <div className="uv-empty-actions">
        <Link href="/blog" className="btn secondary">Browse articles</Link>
      </div>
    </div>}
  </section>;
}
