"use client";

import { useEffect, useRef, useState } from "react";

// Sticky section tabs from the design (Course/University "section tabs"): plain anchor links, so
// they work without JavaScript; with it, the tab for the section in view is marked and kept
// visible in the horizontally scrolling row. Targets use `scroll-margin-top` (shell.css) to land
// below the header and the tabs.
export function SectionTabs({ items, label }: { items: Array<{ label: string; href: `#${string}` }>; label: string }) {
  const [active, setActive] = useState(items[0]?.href || "");
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ids = items.map(item => item.href.slice(1));
    let frame = 0;
    function refresh() {
      frame = 0;
      const line = 150;
      const current = ids
        .map(id => ({ id, top: document.getElementById(id)?.getBoundingClientRect().top ?? Infinity }))
        .filter(item => item.top <= line)
        .sort((a, b) => b.top - a.top)[0];
      setActive(`#${current ? current.id : ids[0]}`);
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(refresh); };
    window.addEventListener("scroll", onScroll, { passive: true });
    refresh();
    return () => { window.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [items]);
  useEffect(() => {
    const link = row.current?.querySelector<HTMLAnchorElement>(`a[href="${active}"]`);
    if (!link || !row.current) return;
    const { offsetLeft, offsetWidth } = link;
    const { scrollLeft, clientWidth } = row.current;
    if (offsetLeft < scrollLeft || offsetLeft + offsetWidth > scrollLeft + clientWidth) row.current.scrollTo({ left: offsetLeft - 16 });
  }, [active]);
  return <nav className="uv-tabs" aria-label={label}>
    <div className="uv-tabs-inner" ref={row}>
      {items.map(item => <a key={item.href} href={item.href} aria-current={active === item.href ? "true" : undefined} onClick={() => {
        setActive(item.href);
        const target = document.getElementById(item.href.slice(1));
        if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
      }}>{item.label}</a>)}
    </div>
  </nav>;
}
