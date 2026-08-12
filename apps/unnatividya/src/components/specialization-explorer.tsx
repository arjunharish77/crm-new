"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatFee } from "@/data/catalog";
import type { SpecializationPage } from "@/lib/specializations";

const STREAM_ORDER = ["Management", "IT & Computers", "Commerce", "Arts & Humanities"];

export function SpecializationExplorer({ pages }: { pages: Array<SpecializationPage & { stream: string }> }) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const text = query.trim().toLowerCase();
    const filtered = text
      ? pages.filter((page) => `${page.specialization} ${page.courseLabel}`.toLowerCase().includes(text))
      : pages;
    const map = new Map<string, typeof pages>();
    for (const page of filtered) {
      const list = map.get(page.stream) || [];
      list.push(page);
      map.set(page.stream, list);
    }
    return STREAM_ORDER.filter((stream) => map.has(stream)).map((stream) => [stream, map.get(stream)!] as const);
  }, [pages, query]);

  return (
    <>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search a specialisation, e.g. Cybersecurity"
        style={{ height: 46, width: "100%", maxWidth: 420, padding: "0 16px", border: "1px solid #CFDAE6", borderRadius: 6, fontSize: 14, color: "#555", outlineColor: "#544CC8", background: "#fff", marginBottom: 28, display: "block" }}
      />
      {grouped.length ? (
        grouped.map(([stream, group]) => (
          <div key={stream} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, marginBottom: 4 }}>{stream}</h2>
            <div style={{ fontSize: 13, color: "#707070", marginBottom: 12 }}>{group.length} specialisations</div>
            <div className="grid three">
              {group.map((page) => (
                <Link href={`/specializations/${page.slug}`} className="card uv-card" style={{ display: "block", padding: 18, color: "inherit" }} key={page.slug}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#363634" }}>{page.specialization}</div>
                  <div style={{ fontSize: 13, color: "#707070", marginTop: 4 }}>
                    {page.isComparison
                      ? `${page.courseLabel} · ${page.courses.length} universities · from ${formatFee(page.courses[0].fee)}`
                      : `${page.courseLabel} · ${page.courses[0].university.shortName} · ${formatFee(page.courses[0].fee)}`}
                  </div>
                  <div style={{ fontSize: 13, color: "#544CC8", fontWeight: 700, marginTop: 10 }}>
                    {page.isComparison ? "Compare universities" : "View details"} →
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div style={{ background: "#fff", border: "1px dashed #CFDAE6", borderRadius: 8, padding: 40, textAlign: "center", color: "#707070", fontSize: 14 }}>
          No specialisation matches that search. Try a broader term like &ldquo;data&rdquo; or &ldquo;finance&rdquo;.
        </div>
      )}
    </>
  );
}
