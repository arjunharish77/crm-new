"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { BlogPost } from "@/data/blog";

const categories = ["All", "Validity", "Fees & EMI", "Careers", "Admissions"] as const;

export function BlogExplorer({ posts }: { posts: BlogPost[] }) {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");

  const filtered = useMemo(
    () => (category === "All" ? posts : posts.filter((post) => post.category === category)),
    [category, posts],
  );

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {categories.map((item) => (
          <button
            style={{
              border: `1.5px solid ${category === item ? "#544CC8" : "#CFDAE6"}`,
              background: category === item ? "rgba(84,76,200,0.08)" : "#fff",
              color: category === item ? "#544CC8" : "#555",
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
            type="button"
            onClick={() => setCategory(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="uv-home-three-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
        {filtered.map((post) => (
          <article style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }} key={post.slug}>
            <div style={{ height: 150, overflow: "hidden", position: "relative" }}>
              <Image src={post.cover} alt="Article cover" fill sizes="(max-width: 900px) 100vw, 33vw" style={{ objectFit: "cover" }} />
            </div>
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#4FA8FF", background: "rgba(79,168,255,0.12)", borderRadius: 999, whiteSpace: "nowrap", padding: "3px 9px" }}>{post.category}</span>
                <span style={{ fontSize: 12, color: "#AAAAAA" }}>{post.read}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634", lineHeight: 1.35 }}>{post.title}</div>
              <div style={{ fontSize: 13, color: "#696868", lineHeight: 1.55 }}>{post.excerpt}</div>
              <Link href={`/blog/${post.slug}`} style={{ marginTop: "auto", fontSize: 13, fontWeight: 700, color: "#544CC8" }}>Read article →</Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
