"use client";

import { useEffect, useState, useId, useRef } from "react";

type SectionPill = {
  label: string;
  href: `#${string}`;
};

export function SectionPillNav({ items, label }: { items: SectionPill[]; label: string }) {
  const selectId = useId();
  const navRef = useRef<HTMLElement>(null);
  const [activeHref, setActiveHref] = useState(items[0]?.href || "");

  useEffect(() => {
    if (!items.length) return undefined;
    const ids = items.map((item) => item.href.slice(1));
    let ticking = false;

    // Include the responsive nav height and anchor breathing room in the active-section line.
    function refreshActive() {
      const activeLine = 100 + (navRef.current?.getBoundingClientRect().height || 50);
      const current = ids
        .map((id) => {
          const element = document.getElementById(id);
          return element ? { id, top: element.getBoundingClientRect().top } : null;
        })
        .filter((item): item is { id: string; top: number } => Boolean(item))
        .filter((item) => item.top <= activeLine)
        .sort((a, b) => b.top - a.top)[0];
      setActiveHref(current ? `#${current.id}` : `#${ids[0]}`);
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(refreshActive);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    refreshActive();

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [items]);

  return (
    <nav ref={navRef} className="pill-nav" aria-label={label}>
      <div className="container section-picker">
        <label htmlFor={selectId}>Jump to section</label>
        <select id={selectId} value={activeHref} onChange={event=>{
          const href=items.find(item=>item.href===event.target.value)?.href;
          if(!href) return;
          setActiveHref(href);
          window.location.hash=href;
          const target=document.getElementById(href.slice(1));
          if(target){target.tabIndex=-1;target.focus({preventScroll:true});}
        }}>{items.map(item=><option key={item.href} value={item.href}>{item.label}</option>)}</select>
      </div>
      <div className="container pill-nav-inner">
        {items.map((item) => (
          <a aria-current={activeHref === item.href ? "location" : undefined} className={activeHref === item.href ? "active" : undefined} href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
