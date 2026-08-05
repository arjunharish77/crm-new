"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/courses", label: "Courses" },
  { href: "/universities", label: "Universities" },
  { href: "/compare", label: "Compare" },
  { href: "/recommender", label: "AI Recommender", ai: true },
  { href: "/blog", label: "Blog" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "#fff", boxShadow: "0 3px 6px rgba(194,194,194,0.16)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", height: 64, display: "flex", alignItems: "center", gap: 28, padding: "0 24px" }}>
          <Link href="/" aria-label="Unnati Vidya home">
            <Image
              src="/brand/unnatividya-logo-gradient.svg"
              alt="Unnati Vidya"
              width={174}
              height={32}
              style={{ height: 22, width: "auto", display: "block" }}
              priority
            />
          </Link>
          <nav aria-label="Main navigation" style={{ display: "flex", gap: 22, fontSize: 14, fontWeight: 600, flex: 1 }}>
            {nav.map((item) => (
              <Link
                href={item.href}
                key={item.href}
                style={{
                  color: isActive(item.href) ? "#544CC8" : "#555",
                  borderBottom: isActive(item.href) ? "2px solid #544CC8" : undefined,
                  paddingBottom: isActive(item.href) ? 2 : undefined,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {item.ai ? <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FDB515", display: "inline-block" }} aria-hidden="true" /> : null}
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/lead?intent=talk-to-expert"
            data-open-lead
            className="uv-header-cta"
            style={{
              height: 40,
              display: "inline-flex",
              alignItems: "center",
              padding: "0 18px",
              background: "#544CC8",
              color: "#fff",
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Talk to an expert
          </Link>
        </div>
      </header>
      <div style={{ background: "#263238", color: "#fff", fontSize: 12, textAlign: "center", padding: "7px 16px" }}>
        Admissions open for the July 2026 batch · Last date to apply: 20 August ·{" "}
        <Link href="/courses" style={{ color: "#FDB515", fontWeight: 600 }}>Explore courses</Link>
      </div>
    </>
  );
}
