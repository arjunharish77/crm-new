"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { ArrowLeftRight, BookOpen, Bookmark, Calculator, ChevronDown, GraduationCap, Landmark, Menu, Search, Shapes, X, type LucideProps } from "lucide-react";
import { useShortlist } from "@/lib/use-shortlist";

// Header from the design handoff (UVHeader), with the owner's IA (UI redesign Q3/Q4): four plain
// links plus "Guides" and "Tools" disclosures, "Saved courses" with the bookmark icon, Apply now.
type Icon = ComponentType<LucideProps>;
const nav: Array<{ href: string; label: string; icon: Icon }> = [
  { href: "/courses", label: "Courses", icon: GraduationCap },
  { href: "/universities", label: "Universities", icon: Landmark },
  { href: "/compare", label: "Compare", icon: ArrowLeftRight },
  { href: "/specializations", label: "Specializations", icon: Shapes },
];
// Decision V9: the Tools menu lists every tool, in labelled sections (two columns on desktop). The
// Guides menu adds the Wave 5 hubs the same way (owner decision, 25 October 2026).
const groups: Array<{ label: string; icon: Icon; links: Array<{ href: string; label: string; description: string; section?: string }> }> = [
  { label: "Guides", icon: BookOpen, links: [
    { href: "/online-degree-guides", label: "Degree guides", description: "Fees, eligibility, careers and recognition by degree.", section: "Browse" },
    { href: "/blog", label: "Articles", description: "Online learning, admissions and career choices.", section: "Browse" },
    { href: "/how-we-verify", label: "How we verify", description: "Our sources and review process.", section: "Browse" },
    { href: "/online-degree-guides/fees", label: "Fees and EMI", description: "Tuition and payment plans side by side.", section: "Topics" },
    { href: "/online-degree-guides/admissions", label: "Admissions", description: "How to apply, step by step.", section: "Topics" },
    { href: "/online-degree-guides/international", label: "Applying from outside India", description: "Fees, documents and exams for NRIs.", section: "Topics" },
    { href: "/online-degree-guides/online-learning", label: "How online learning works", description: "Classes, exams and your time.", section: "Topics" },
    { href: "/online-degree-guides/computing", label: "Computing and data", description: "BCA, MCA, MSc Data Science and Mathematics.", section: "Degrees" },
    { href: "/online-degree-guides/commerce-humanities", label: "Commerce and humanities", description: "B.Com, BBA, M.Com, BA, MA and JMC.", section: "Degrees" },
  ] },
  { label: "Tools", icon: Calculator, links: [
    { href: "/recommender", label: "Find my course", description: "Programs that match your answers.", section: "Choose" },
    { href: "/tools/mode-helper", label: "Mode helper", description: "Online, distance or regular?", section: "Choose" },
    { href: "/tools/specialization-finder", label: "Specialization finder", description: "Match a career goal.", section: "Choose" },
    { href: "/tools/eligibility-checker", label: "Eligibility checker", description: "Check published entry criteria.", section: "Choose" },
    { href: "/tools/emi-calculator", label: "EMI calculator", description: "Estimate monthly payments.", section: "Afford" },
    { href: "/tools/total-cost", label: "Total cost planner", description: "Tuition by applicant category.", section: "Afford" },
    { href: "/tools/recognition-check", label: "Recognition check", description: "Check a program's UGC-DEB status.", section: "Apply" },
    { href: "/tools/document-checklist", label: "Document checklist", description: "Documents to gather before you apply.", section: "Apply" },
    { href: "/tools/study-planner", label: "Study-time planner", description: "Fit study around your week.", section: "Study" },
    { href: "/tools/exam-check", label: "Exams and device check", description: "How exams work; test your computer.", section: "Study" },
  ] },
];

export function SiteHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  // A route change resets disclosure state, including browser back/forward navigation.
  return <HeaderNavigation key={pathname} pathname={pathname} />;
}

function HeaderNavigation({ pathname }: { pathname: string }) {
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const { count } = useShortlist();
  const savedLabel = `Saved courses${count ? `, ${count} saved` : ""}`;
  function closeNavigation() { setMobileNavOpen(false); setOpenGroup(null); }
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) { setOpenGroup(null); setMobileNavOpen(false); } };
    const media = window.matchMedia("(max-width: 1079px)");
    const resize = () => { setMobileNavOpen(false); setOpenGroup(null); };
    document.addEventListener("pointerdown", outside); media.addEventListener("change", resize);
    return () => { document.removeEventListener("pointerdown", outside); media.removeEventListener("change", resize); };
  }, []);

  function navigationLinks(context: "desktop" | "mobile") {
    return <>
      {nav.map(item => <Link key={item.href} href={item.href} className="uvh-link" aria-current={isActive(item.href) ? "page" : undefined} onClick={closeNavigation}>
        {context === "mobile" ? <item.icon size={22} aria-hidden="true" /> : null}{item.label}
      </Link>)}
      {groups.map(group => {
        const id = `uvh-${context}-${group.label.toLowerCase()}`;
        const expanded = openGroup === id;
        const active = group.links.some(link => isActive(link.href));
        // Only the most specific match is the current page ("Fees and EMI", not also "Degree guides").
        const current = group.links.filter(link => isActive(link.href)).sort((x, y) => y.href.length - x.href.length)[0]?.href;
        return <div className="uvh-group" key={id}>
          <button id={`${id}-button`} type="button" className="uvh-link uvh-group-trigger" data-active={active || undefined} aria-expanded={expanded} aria-controls={id} onClick={() => setOpenGroup(expanded ? null : id)}>
            {context === "mobile" ? <group.icon size={22} aria-hidden="true" /> : null}{group.label}<ChevronDown size={16} className="uvh-chevron" aria-hidden="true" />
          </button>
          <div id={id} className={`uvh-group-panel${group.links.some(link => link.section) ? " is-sectioned" : ""}`} hidden={!expanded}>
            {[...new Set(group.links.map(link => link.section || ""))].map(section => <div key={section || "all"} className="uvh-panel-section" role={section ? "group" : undefined} aria-labelledby={section ? `${id}-${section.toLowerCase()}` : undefined}>
              {section ? <p id={`${id}-${section.toLowerCase()}`} className="uvh-panel-heading">{section}</p> : null}
              {group.links.filter(link => (link.section || "") === section).map(link => <Link key={link.href} href={link.href} aria-current={link.href === current ? "page" : undefined} onClick={closeNavigation}>
                <span>{link.label}</span><small>{link.description}</small>
              </Link>)}
            </div>)}
          </div>
        </div>;
      })}
    </>;
  }

  return <header ref={header} className="uvh" onKeyDown={event => {
    if (event.key !== "Escape") return;
    if (openGroup) { event.preventDefault(); document.getElementById(`${openGroup}-button`)?.focus(); setOpenGroup(null); }
    else if (mobileNavOpen) { event.preventDefault(); closeNavigation(); toggle.current?.focus(); }
  }}>
    <div className="uvh-inner">
      <Link href="/" className="uvh-logo" aria-label="Unnati Vidya home" onClick={closeNavigation}>
        <Image src="/brand/unnatividya-logo-gradient.svg" alt="Unnati Vidya" width={197} height={32} priority />
      </Link>
      <nav className="uvh-nav" aria-label="Main navigation">{navigationLinks("desktop")}</nav>
      <div className="uvh-actions">
        <Link href="/courses#course-search" className="uvh-icon-btn uvh-desktop-only" aria-label="Search courses"><Search size={22} aria-hidden="true" /></Link>
        <Link href="/shortlist" className="uvh-saved uvh-desktop-only" aria-current={isActive("/shortlist") ? "page" : undefined} aria-label={savedLabel}>
          <Bookmark size={20} fill={count ? "currentColor" : "none"} aria-hidden="true" />Saved courses{count ? ` (${count})` : ""}
        </Link>
        <Link href="/lead?intent=enquire" rel="nofollow" data-open-lead className="btn primary uvh-cta uvh-desktop-only">Apply now</Link>
        <Link href="/shortlist" className="uvh-icon-btn uvh-mobile-only" aria-label={savedLabel}>
          <Bookmark size={24} fill={count ? "currentColor" : "none"} aria-hidden="true" />
          {count ? <span className="uvh-badge" aria-hidden="true">{count}</span> : null}
        </Link>
        <button ref={toggle} type="button" className="uvh-toggle uvh-mobile-only" aria-label={mobileNavOpen ? "Close menu" : "Open menu"} aria-expanded={mobileNavOpen} aria-controls="uvh-mobile-panel" onClick={() => { setMobileNavOpen(!mobileNavOpen); setOpenGroup(null); }}>
          {mobileNavOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>
      </div>
    </div>
    <nav hidden={!mobileNavOpen} className="uvh-mobile-panel" id="uvh-mobile-panel" aria-label="Mobile navigation">
      {navigationLinks("mobile")}
      <Link href="/shortlist" className="uvh-link" aria-current={isActive("/shortlist") ? "page" : undefined} onClick={closeNavigation}>
        <Bookmark size={22} aria-hidden="true" />Saved courses{count ? ` (${count})` : ""}
      </Link>
      <Link href="/lead?intent=enquire" rel="nofollow" data-open-lead className="btn primary uvh-mobile-cta" onClick={closeNavigation}>Apply now</Link>
    </nav>
  </header>;
}
