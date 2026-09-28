"use client";

import * as React from "react";
import { NavigationDrawer } from "./NavigationDrawer";
import { Header } from "./header";
import { ImpersonationBanner } from "./impersonation-banner";
import { MaintenanceBanner } from "./maintenance-banner";
import { PageTransition } from "@/components/ui/page-transition";
import { KeyboardShortcutsProvider } from "@/lib/keyboard-shortcuts";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = React.useState(false);
    const [isMobile, setIsMobile] = React.useState(false);
    const [desktopOpen, setDesktopOpen] = React.useState(true);
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const shellRef = React.useRef<HTMLDivElement>(null);
    const chromeRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const media = window.matchMedia("(max-width: 767px)");
        const update = () => {
            setIsMobile(media.matches);
            setMobileOpen(false);
        };
        update();
        try {
            const saved = localStorage.getItem("sidebar-open");
            setDesktopOpen(saved === null ? window.innerWidth >= 1200 : saved === "true");
        } catch { /* Storage is optional; navigation still works. */ }
        setMounted(true);
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    React.useEffect(() => {
        if (!mounted || !chromeRef.current) return;
        const chrome = chromeRef.current;
        const update = () => shellRef.current?.style.setProperty("--app-header-offset", `${chrome.getBoundingClientRect().height}px`);
        const observer = new ResizeObserver(update);
        observer.observe(chrome);
        update();
        return () => observer.disconnect();
    }, [mounted]);

    const toggleDrawer = () => {
        if (isMobile) setMobileOpen(current => !current);
        else {
            const next = !desktopOpen;
            setDesktopOpen(next);
            try { localStorage.setItem("sidebar-open", String(next)); } catch { /* Optional preference. */ }
        }
    };

    if (!mounted) return (
        <div className="flex min-h-dvh bg-background">
            <div className="hidden w-16 shrink-0 border-r bg-sidebar md:block" />
            <main className="min-w-0 flex-1">
                <div className="h-14 border-b" />
                <div className="m-4 h-28 rounded-xl border bg-card/60" />
            </main>
        </div>
    );

    return (
        <KeyboardShortcutsProvider>
            <div ref={shellRef} className="flex min-h-dvh bg-background" data-slot="app-shell">
                <NavigationDrawer open={isMobile ? mobileOpen : desktopOpen} isMobile={isMobile} toggleDrawer={toggleDrawer} />
                <main id="main-content" className="flex min-w-0 flex-1 flex-col">
                    <div ref={chromeRef} className="sticky top-0 z-30 bg-background" data-slot="app-chrome">
                        <ImpersonationBanner />
                        <MaintenanceBanner />
                        <Header onToggleNavigation={toggleDrawer} navigationOpen={mobileOpen} />
                    </div>
                    <div className="min-w-0 flex-1 px-4 py-4 lg:px-6">
                        <PageTransition>{children}</PageTransition>
                    </div>
                </main>
            </div>
        </KeyboardShortcutsProvider>
    );
}
