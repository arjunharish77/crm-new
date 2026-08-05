"use client";

import { useEffect, useState } from "react";

type SectionPill = {
  label: string;
  href: `#${string}`;
};

export function SectionPillNav({ items, label }: { items: SectionPill[]; label: string }) {
  const [activeHref, setActiveHref] = useState(items[0]?.href || "");

  useEffect(() => {
    if (!items.length) return undefined;
    const ids = items.map((item) => item.href.slice(1));
    let ticking = false;

    // Single source of truth: whichever section heading is the last one to have scrolled up
    // past the 150px line (matching the sticky header + pill-nav's own height). This used to
    // run alongside an IntersectionObserver with different thresholds, and the two would
    // disagree about which section was "current" during a scroll gesture, causing the active
    // pill to visibly flicker between two answers.
    function refreshActive() {
      const current = ids
        .map((id) => {
          const element = document.getElementById(id);
          return element ? { id, top: element.getBoundingClientRect().top } : null;
        })
        .filter((item): item is { id: string; top: number } => Boolean(item))
        .filter((item) => item.top <= 150)
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
    <nav className="pill-nav" aria-label={label}>
      <div className="container pill-nav-inner">
        {items.map((item) => (
          <a className={activeHref === item.href ? "active" : undefined} href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
