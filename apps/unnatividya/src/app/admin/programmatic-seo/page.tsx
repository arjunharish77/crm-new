import type { Metadata } from "next";
import { generateProgrammaticSeoCandidates } from "@/lib/programmatic-seo";

export const metadata: Metadata = {
  title: "Programmatic SEO",
  robots: { index: false, follow: false, nocache: true },
};

export default function ProgrammaticSeoPage() {
  const candidates = generateProgrammaticSeoCandidates();
  const live = candidates.filter((candidate) => candidate.routeType === "LIVE");
  const future = candidates.filter((candidate) => candidate.routeType === "CANDIDATE");
  const intents = [...new Set(candidates.map((candidate) => candidate.intent))];

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">SEO Controls</span>
            <h1>Programmatic SEO generator</h1>
            <p>Generate route candidates for course, university, fee, eligibility, career, UGC, and comparison search intent without indexing thin pages.</p>
          </div>
          <div className="course-actions" style={{ marginTop: 0 }}>
            <div className="admin-count">{live.length} live</div>
            <div className="admin-count warning">{future.length} candidates</div>
          </div>
        </div>

        <div className="admin-grid">
          {intents.map((intent) => {
            const count = candidates.filter((candidate) => candidate.intent === intent).length;
            const indexable = candidates.filter((candidate) => candidate.intent === intent && candidate.indexable).length;
            return (
              <article className="card admin-tile" key={intent}>
                <span className="admin-tag">{intent}</span>
                <h2>{count} routes</h2>
                <p>{indexable} currently indexable. Candidate pages stay out of sitemap until quality checks pass.</p>
              </article>
            );
          })}
        </div>

        <section className="admin-table-card" style={{ marginTop: 18 }}>
          <div className="admin-table-head">
            <h2>Generated routes</h2>
            <span className="admin-muted">Live routes can be indexed; candidates are planning rows for future page generation.</span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                {["Route", "Intent", "Type", "Index", "Readiness", "Sources"].map((head) => <th key={head}>{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.slug}>
                  <td><strong>{candidate.title}</strong><span>{candidate.slug}</span></td>
                  <td>{candidate.intent}</td>
                  <td><span className={candidate.routeType === "LIVE" ? "admin-status good" : "admin-status"}>{candidate.routeType}</span></td>
                  <td>{candidate.indexable ? "Indexable" : "Hold"}</td>
                  <td>{candidate.reason}</td>
                  <td>
                    <div className="quality-chip-list">
                      {candidate.sourceUrls.map((source) => <span className="quality-chip" key={source}>{source}</span>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
}
