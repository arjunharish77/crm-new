"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import type { AdminSession } from "@/lib/admin-auth";

type NavItem = { label: string; href: string; badge?: string };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Leads", href: "/admin/leads" },
  { label: "Courses", href: "/admin/courses" },
  { label: "Universities", href: "/admin/universities" },
  { label: "Content quality", href: "/admin/content-quality" },
  { label: "CRM sync", href: "/admin/crm-sync" },
  { label: "Redirects", href: "/admin/redirects" },
  { label: "Programmatic SEO", href: "/admin/programmatic-seo" },
  { label: "Source imports", href: "/admin/source-imports" },
];

export function AdminSidebar({
  session,
  counts,
  children,
}: {
  session: AdminSession;
  counts: Record<string, number>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/admin/login");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 236, flexShrink: 0, background: "#263238", color: "#B8C4CA", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>Unnati Vidya CMS</span>
        </div>
        <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {NAV_ITEMS.map((item) => {
            const count = counts[item.label];
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 12px",
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  color: active ? "#fff" : "#B8C4CA",
                  background: active ? "rgba(84,76,200,0.35)" : "transparent",
                }}
              >
                {item.label}
                {typeof count === "number" ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#B8C4CA", background: "rgba(255,255,255,0.10)", borderRadius: 999, padding: "2px 8px" }}>{count}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{session.email}</div>
          <div style={{ fontSize: 12, color: "#B8C4CA", marginTop: 2 }}>{session.role}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            <Link href="/" style={{ fontSize: 12, color: "#8B7CF0", fontWeight: 600 }}>← Back to site</Link>
            <button type="button" onClick={logout} style={{ fontSize: 12, color: "#8B7CF0", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <form
            action="/admin/leads"
            style={{ flex: 1, maxWidth: 420 }}
            onSubmit={(event) => {
              if (!query.trim()) event.preventDefault();
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              name="q"
              placeholder="Search leads by name or email…"
              style={{ width: "100%", height: 38, padding: "0 14px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 13, color: "#555" }}
            />
          </form>
          <Link href="/api/admin/leads/export" className="btn secondary" style={{ height: 38, fontSize: 13, display: "inline-flex", alignItems: "center", padding: "0 16px" }}>
            Export CSV
          </Link>
        </div>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
