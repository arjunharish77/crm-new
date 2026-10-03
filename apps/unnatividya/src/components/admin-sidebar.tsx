"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AdminSession } from "@/lib/admin-auth";

type NavItem = { label: string; href: string; badge?: string };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Leads", href: "/admin/leads" },
  { label: "Courses", href: "/admin/courses" },
  { label: "Universities", href: "/admin/universities" },
  { label: "Catalog preview", href: "/admin/catalog-preview" },
  { label: "Catalog revisions", href: "/admin/catalog-revisions" },
  { label: "Content quality", href: "/admin/content-quality" },
  { label: "CRM sync", href: "/admin/crm-sync" },
  { label: "Redirects", href: "/admin/redirects" },
  { label: "Programmatic SEO", href: "/admin/programmatic-seo" },
  { label: "Source imports", href: "/admin/source-imports" },
];

type AdminSidebarProps = { session: AdminSession; counts: Record<string, number>; children: ReactNode };

export function AdminSidebar(props: AdminSidebarProps) {
  const pathname = usePathname();
  return <AdminSidebarContent key={pathname} pathname={pathname} {...props} />;
}

function AdminSidebarContent({ session, counts, children, pathname }: AdminSidebarProps & { pathname: string }) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const navigationOpen = openPath === pathname;
  const toggle = useRef<HTMLButtonElement>(null);
  const setNavigationOpen = (open: boolean) => setOpenPath(open ? pathname : null);
  const currentSection = NAV_ITEMS.find(item => item.href !== "/admin" && (pathname === item.href || pathname.startsWith(`${item.href}/`))) || NAV_ITEMS[0];
  const nested = pathname !== currentSection.href;
  const nestedLabel = pathname.endsWith("/new") ? "New record" : pathname.endsWith("/history") ? "History" : pathname.endsWith("/mappings") ? "Field mappings" : "Record details";
  useEffect(() => {
    const media = window.matchMedia("(max-width: 850px)");
    const close = () => setOpenPath(null);
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/admin/login");
  }

  return (
    <div className="cms-layout" style={{ display: "flex", minHeight: "100vh" }}>
      <aside onKeyDown={event => { if (event.key === "Escape" && navigationOpen) { event.preventDefault(); setNavigationOpen(false); toggle.current?.focus(); } }} className="cms-sidebar" data-open={navigationOpen} style={{ width: 236, flexShrink: 0, background: "#263238", color: "#B8C4CA", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div className="cms-sidebar-brand" style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>Unnati Vidya CMS</span>
          <button ref={toggle} type="button" className="cms-navigation-toggle" aria-expanded={navigationOpen} aria-controls="cms-navigation" onClick={()=>setNavigationOpen(!navigationOpen)}>{navigationOpen ? "Close menu" : "Menu"}</button>
        </div>
        <nav id="cms-navigation" aria-label="CMS navigation" style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {NAV_ITEMS.map((item) => {
            const count = counts[item.label];
            const active = isActive(item.href);
            return (
              <Link
                onClick={()=>setNavigationOpen(false)}
                aria-current={active ? (pathname === item.href ? "page" : "location") : undefined}
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
        <div className="cms-account" style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
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

      <div className="cms-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div className="cms-toolbar" style={{ background: "#fff", borderBottom: "1px solid #EAEAEA", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <nav aria-label="CMS breadcrumb" className="cms-breadcrumb">
            {pathname === "/admin" ? <span aria-current="page">Dashboard</span> : <>
              <Link href="/admin">Dashboard</Link><span aria-hidden="true">/</span>
              {nested ? <><Link href={currentSection.href}>{currentSection.label}</Link><span aria-hidden="true">/</span><span aria-current="page">{nestedLabel}</span></> : <span aria-current="page">{currentSection.label}</span>}
            </>}
          </nav>
        </div>
        <div className="cms-content" style={{ flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
