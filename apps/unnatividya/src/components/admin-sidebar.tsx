"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BookOpen,
  ArrowLeft, BadgeCheck, Building2, Eye, FileInput, FileText, GraduationCap, History, Inbox, LayoutDashboard,
  ListChecks, LogOut, Mail, Menu, RefreshCw, Signpost, Waypoints, X, type LucideIcon,
} from "lucide-react";
import type { AdminSession } from "@/lib/admin-auth";

type NavItem = { label: string; href: string; icon: LucideIcon; badge?: string };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Leads", href: "/admin/leads", icon: Inbox },
  { label: "Courses", href: "/admin/courses", icon: GraduationCap },
  { label: "Universities", href: "/admin/universities", icon: Building2 },
  { label: "Catalog preview", href: "/admin/catalog-preview", icon: Eye },
  { label: "Catalog revisions", href: "/admin/catalog-revisions", icon: History },
  { label: "Publishing checklist", href: "/admin/publishing-checklist", icon: ListChecks },
  { label: "Articles", href: "/admin/articles", icon: FileText },
  { label: "Guides", href: "/admin/guides", icon: BookOpen },
  { label: "Content quality", href: "/admin/content-quality", icon: BadgeCheck },
  { label: "CRM sync", href: "/admin/crm-sync", icon: RefreshCw },
  { label: "Newsletter", href: "/admin/newsletter", icon: Mail },
  { label: "Redirects", href: "/admin/redirects", icon: Signpost },
  { label: "Programmatic SEO", href: "/admin/programmatic-seo", icon: Waypoints },
  { label: "Source imports", href: "/admin/source-imports", icon: FileInput },
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
    <div className="cms-layout">
      <aside onKeyDown={event => { if (event.key === "Escape" && navigationOpen) { event.preventDefault(); setNavigationOpen(false); toggle.current?.focus(); } }} className="cms-sidebar" data-open={navigationOpen}>
        <div className="cms-sidebar-brand">
          <Link href="/admin" className="cms-brand-link">
            <Image src="/brand/unnatividya-logo-white.svg" alt="Unnati Vidya" width={148} height={24} className="cms-brand-logo" />
            <span className="cms-brand-tag">CMS</span>
          </Link>
          <button ref={toggle} type="button" className="cms-navigation-toggle" aria-expanded={navigationOpen} aria-controls="cms-navigation" onClick={()=>setNavigationOpen(!navigationOpen)}>
            {navigationOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            {navigationOpen ? "Close menu" : "Menu"}
          </button>
        </div>
        <nav id="cms-navigation" aria-label="CMS navigation" className="cms-nav">
          {NAV_ITEMS.map((item) => {
            const count = counts[item.label];
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                onClick={()=>setNavigationOpen(false)}
                aria-current={active ? (pathname === item.href ? "page" : "location") : undefined}
                key={item.href}
                href={item.href}
                className="cms-nav-link"
              >
                <Icon size={18} aria-hidden="true" className="cms-nav-icon" />
                <span className="cms-nav-label">{item.label}</span>
                {typeof count === "number" ? <span className="cms-nav-count">{count}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="cms-account">
          <div className="cms-account-email">{session.email}</div>
          <div className="cms-account-role">{session.role}</div>
          <div className="cms-account-actions">
            <Link href="/"><ArrowLeft size={14} aria-hidden="true" />Back to site</Link>
            <button type="button" onClick={logout}><LogOut size={14} aria-hidden="true" />Sign out</button>
          </div>
        </div>
      </aside>

      <div className="cms-main">
        <div className="cms-toolbar">
          <nav aria-label="CMS breadcrumb" className="cms-breadcrumb">
            {pathname === "/admin" ? <span aria-current="page">Dashboard</span> : <>
              <Link href="/admin">Dashboard</Link><span aria-hidden="true">/</span>
              {nested ? <><Link href={currentSection.href}>{currentSection.label}</Link><span aria-hidden="true">/</span><span aria-current="page">{nestedLabel}</span></> : <span aria-current="page">{currentSection.label}</span>}
            </>}
          </nav>
        </div>
        <div className="cms-content">{children}</div>
      </div>
    </div>
  );
}
