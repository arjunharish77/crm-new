"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Heart, Menu, X, ChevronDown } from "lucide-react";
import { useShortlist } from "@/lib/use-shortlist";

const nav = [
  { href: "/courses", label: "Courses" },
  { href: "/universities", label: "Universities" },
  { href: "/compare", label: "Compare" },
];
const groups = [
  { label: "Resources", links: [
    {href:"/online-degree-guides",label:"Degree guides",description:"Explore fees, eligibility and recognition by degree."},
    {href:"/blog",label:"Articles",description:"Read about online learning and career choices."},
    {href:"/how-we-verify",label:"How we verify",description:"Understand our sources and review process."},
  ]},
  { label: "Tools", links: [
    {href:"/recommender",label:"Find my course",description:"Explore options based on your preferences."},
    {href:"/tools/emi-calculator",label:"EMI calculator",description:"Estimate payments using your own assumptions."},
  ]},
];

export function SiteHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  // A route change resets disclosure state, including browser back/forward navigation.
  return <HeaderNavigation key={pathname} pathname={pathname}/>;
}

function HeaderNavigation({pathname}:{pathname:string}) {
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const { count: shortlistCount } = useShortlist();
  function closeNavigation() { setMobileNavOpen(false); setOpenGroup(null); }
  useEffect(()=>{
    const outside = (event:PointerEvent)=>{if(!header.current?.contains(event.target as Node)){setOpenGroup(null);setMobileNavOpen(false);}};
    const media=window.matchMedia("(max-width: 1100px)");
    const resize=()=>{setMobileNavOpen(false);setOpenGroup(null);};
    document.addEventListener("pointerdown",outside);media.addEventListener("change",resize);
    return ()=>{document.removeEventListener("pointerdown",outside);media.removeEventListener("change",resize);};
  },[]);
  function navigationLinks(context:"desktop"|"mobile") {
    return <>
      {nav.map(item=><Link key={item.href} href={item.href} aria-current={isActive(item.href)?"page":undefined} onClick={closeNavigation}>{item.label}</Link>)}
      {groups.map(group=>{
        const id=`uv-${context}-${group.label.toLowerCase()}`;
        const expanded=openGroup===id;
        const active=group.links.some(link=>isActive(link.href));
        return <div className="uv-nav-group" key={id}>
          <button id={`${id}-button`} type="button" className={active?"uv-nav-group-trigger uv-active":"uv-nav-group-trigger"} aria-expanded={expanded} aria-controls={id} onClick={()=>setOpenGroup(expanded?null:id)}>
            {group.label}<ChevronDown size={14} aria-hidden="true"/>
          </button>
          <div id={id} className="uv-nav-group-links" hidden={!expanded}>
            {group.links.map(link=><Link key={link.href} href={link.href} aria-current={isActive(link.href)?"page":undefined} onClick={closeNavigation}>
              <span>{link.label}</span><small>{link.description}</small>
            </Link>)}
          </div>
        </div>;
      })}
    </>;
  }
  return <>
    <header ref={header} className="uv-public-header" onKeyDown={event=>{
      if(event.key!=="Escape") return;
      if(openGroup){event.preventDefault();document.getElementById(`${openGroup}-button`)?.focus();setOpenGroup(null);}
      else if(mobileNavOpen){event.preventDefault();closeNavigation();toggle.current?.focus();}
    }}>
      <div className="uv-header-inner">
        <Link href="/" aria-label="Unnati Vidya home" onClick={closeNavigation}>
          <Image src="/brand/unnatividya-logo-gradient.svg" alt="Unnati Vidya" width={174} height={32} style={{height:24,width:"auto",display:"block"}} priority/>
        </Link>
        <nav className="uv-header-nav" aria-label="Main navigation">{navigationLinks("desktop")}</nav>
        <Link href="/shortlist" className="uv-header-shortlist" aria-current={isActive("/shortlist")?"page":undefined} aria-label={`Saved courses${shortlistCount?`, ${shortlistCount} saved`:""}`}>
          <Heart size={14} fill={shortlistCount?"currentColor":"none"} aria-hidden="true"/>Saved courses{shortlistCount?` (${shortlistCount})`:""}
        </Link>
        <Link href="/lead?intent=enquire" data-open-lead className="uv-header-cta">Apply now</Link>
        <button ref={toggle} type="button" className="uv-header-toggle" style={{marginLeft:"auto"}} aria-label={mobileNavOpen?"Close menu":"Open menu"} aria-expanded={mobileNavOpen} aria-controls="uv-mobile-nav-panel" onClick={()=>{setMobileNavOpen(!mobileNavOpen);setOpenGroup(null);}}>
          {mobileNavOpen?<X size={24} aria-hidden="true"/>:<Menu size={24} aria-hidden="true"/>}
        </button>
      </div>
      <nav hidden={!mobileNavOpen} className="uv-header-mobile-panel" id="uv-mobile-nav-panel" aria-label="Mobile navigation">
        {navigationLinks("mobile")}
        <Link href="/shortlist" aria-current={isActive("/shortlist")?"page":undefined} onClick={closeNavigation}>Saved courses{shortlistCount?` (${shortlistCount})`:""}</Link>
        <Link href="/lead?intent=enquire" data-open-lead className="uv-header-mobile-cta" onClick={closeNavigation}>Apply now</Link>
      </nav>
    </header>
  </>;
}
