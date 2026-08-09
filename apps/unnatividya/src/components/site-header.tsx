"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, Menu, X } from "lucide-react";
import { useShortlist } from "@/lib/use-shortlist";

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { count: shortlistCount } = useShortlist();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

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
          <nav className="uv-header-nav" aria-label="Main navigation" style={{ display: "flex", gap: 22, fontSize: 14, fontWeight: 600, flex: 1 }}>
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
            href="/shortlist"
            aria-label={`Shortlist${shortlistCount ? `, ${shortlistCount} saved` : ""}`}
            style={{ position: "relative", display: "inline-flex", alignItems: "center", color: isActive("/shortlist") ? "#544CC8" : "#555" }}
          >
            <Heart size={20} strokeWidth={2} aria-hidden="true" />
            {shortlistCount ? (
              <span
                style={{
                  position: "absolute",
                  top: -6,
                  right: -8,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 999,
                  background: "#544CC8",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: "16px",
                  textAlign: "center",
                  padding: "0 3px",
                }}
              >
                {shortlistCount}
              </span>
            ) : null}
          </Link>
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
          <button
            type="button"
            className="uv-header-toggle"
            style={{ marginLeft: "auto" }}
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
            aria-controls="uv-mobile-nav-panel"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        {mobileNavOpen ? (
          <nav className="uv-header-mobile-panel" id="uv-mobile-nav-panel" aria-label="Mobile navigation">
            {nav.map((item) => (
              <Link
                href={item.href}
                key={item.href}
                style={{ color: isActive(item.href) ? "#544CC8" : "#555" }}
              >
                {item.ai ? <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FDB515", display: "inline-block" }} aria-hidden="true" /> : null}
                {item.label}
              </Link>
            ))}
            <Link href="/shortlist" style={{ color: isActive("/shortlist") ? "#544CC8" : "#555" }}>
              Shortlist{shortlistCount ? ` (${shortlistCount})` : ""}
            </Link>
            <Link href="/lead?intent=talk-to-expert" data-open-lead className="uv-header-mobile-cta">
              Talk to an expert
            </Link>
          </nav>
        ) : null}
      </header>
      <div style={{ background: "#263238", color: "#fff", fontSize: 12, textAlign: "center", padding: "7px 16px" }}>
        Admissions open for the July 2026 batch · Last date to apply: 20 August ·{" "}
        <Link href="/courses" style={{ color: "#FDB515", fontWeight: 600 }}>Explore courses</Link>
      </div>
    </>
  );
}
