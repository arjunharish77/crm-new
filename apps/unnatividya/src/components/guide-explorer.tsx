"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
export type GuideListing = { slug: string; degree: string; topic: string; description: string };
export function GuideExplorer({ guides }: { guides: GuideListing[] }) {
  const params = useSearchParams();
  const query = (params.get("q") || "").slice(0,200);
  const topics = [...new Set(guides.map(guide => guide.topic))];
  const degrees = [...new Set(guides.map(guide => guide.degree))].sort();
  const topic = topics.includes(params.get("topic") || "") ? params.get("topic")! : "";
  const degree = degrees.includes(params.get("degree") || "") ? params.get("degree")! : "";
  const filtered = guides.filter(guide => (!topic || guide.topic === topic) && (!degree || guide.degree === degree) && `${guide.degree} ${guide.topic} ${guide.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  function update(key: string, value: string, replace = false) {
    const url = new URL(window.location.href);if(value) url.searchParams.set(key,value);else url.searchParams.delete(key);
    if(replace)window.history.replaceState(null,"",url);else window.history.pushState(null,"",url);
  }
  function reset() { const url=new URL(window.location.href);["q","topic","degree"].forEach(key=>url.searchParams.delete(key));window.history.pushState(null,"",url); }
  return <section className="guide-explorer" aria-label="Find degree guides">
    <div className="guide-filters">
      <div><label htmlFor="guide-search">Search guides</label><input id="guide-search" type="search" value={query} maxLength={200} onChange={event=>update("q",event.target.value,true)} placeholder="Degree or topic" /></div>
      <div><label htmlFor="guide-topic">Topic</label><select id="guide-topic" value={topic} onChange={event=>update("topic",event.target.value)}><option value="">All topics</option>{topics.map(value=><option key={value}>{value}</option>)}</select></div>
      <div><label htmlFor="guide-degree">Degree</label><select id="guide-degree" value={degree} onChange={event=>update("degree",event.target.value)}><option value="">All degrees</option>{degrees.map(value=><option key={value}>{value}</option>)}</select></div>
    </div>
    <div className="guide-toolbar"><p role="status">{filtered.length} of {guides.length} guides</p>{(query||topic||degree)&&<button type="button" className="btn secondary" onClick={reset}>Reset search and filters</button>}</div>
    {filtered.length ? topics.map(value=>{const group=filtered.filter(guide=>guide.topic===value);return group.length ? <section className="guide-topic-group" key={value} aria-label={value}><h2>{value}</h2><div className="guide-grid">{group.map(guide=><Link className="guide-card" href={`/online-degree-guides/${guide.slug}`} key={guide.slug}><h3>{guide.degree}: {guide.topic}</h3><p>{guide.description}</p><span>Read guide →</span></Link>)}</div></section>:null;}) : <div className="illustrated-empty-state"><h2>No guides match</h2><p>Try another degree, topic or keyword, or reset your filters.</p><Link href="/blog" className="btn secondary">Browse articles</Link></div>}
  </section>;
}
