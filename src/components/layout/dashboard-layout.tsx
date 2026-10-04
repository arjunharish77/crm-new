"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ErrorState } from "@/components/common/error-state";
import { useModuleAccess } from "@/hooks/use-module-access";
import { permissionModuleForPage } from "@/lib/module-access";
import { NavigationDrawer } from "./NavigationDrawer";
import { Header } from "./header";
import { ImpersonationBanner } from "./impersonation-banner";
import { MaintenanceBanner } from "./maintenance-banner";
import { KeyboardShortcutsProvider } from "@/lib/keyboard-shortcuts";
import { PageTitleProvider } from "@/components/app-states/page-title";
import { storageGet, storageSet } from "@/lib/storage";
import { useAuth } from "@/providers/auth-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = React.useState(false);
    // Pages wait for sign-in to settle before they render and start loading (round-2 plan P1).
    const { isLoading: authLoading } = useAuth();
    const [isMobile, setIsMobile] = React.useState(false);
    const [desktopOpen, setDesktopOpen] = React.useState(true);
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const shellRef = React.useRef<HTMLDivElement>(null);
    // Inside Settings the main menu collapses to its icon rail, so the Settings menu has room
    // (UI/UX plan decision 22). Expanding it there lasts until you leave Settings and isn't saved.
    const pathname = usePathname();
    const inSettings = pathname.startsWith("/dashboard/settings");
    const can = useModuleAccess();
    const pageModule = permissionModuleForPage(pathname);
    const blockedModule = pageModule && !can(pageModule.key) ? pageModule : null;
    const [settingsExpanded, setSettingsExpanded] = React.useState(false);
    React.useEffect(() => { if (!inSettings) setSettingsExpanded(false); }, [inSettings]);
    const chromeRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const media = window.matchMedia("(max-width: 767px)");
        const update = () => {
            setIsMobile(media.matches);
            setMobileOpen(false);
        };
        update();
        try {
            const saved = storageGet("sidebar-open");
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
        else if (inSettings) setSettingsExpanded(current => !current);
        else {
            const next = !desktopOpen;
            setDesktopOpen(next);
            try { storageSet("sidebar-open", String(next)); } catch { /* Optional preference. */ }
        }
    };

    if (!mounted || authLoading) return (
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
            <PageTitleProvider>
            <div ref={shellRef} className="flex min-h-dvh bg-background" data-slot="app-shell">
                <NavigationDrawer open={isMobile ? mobileOpen : inSettings ? settingsExpanded : desktopOpen} isMobile={isMobile} toggleDrawer={toggleDrawer} />
                <main id="main-content" className="flex min-w-0 flex-1 flex-col">
                    <div ref={chromeRef} className="sticky top-0 z-30 bg-card" data-slot="app-chrome">
                        <ImpersonationBanner />
                        <MaintenanceBanner />
                        <Header onToggleNavigation={toggleDrawer} navigationOpen={mobileOpen} />
                    </div>
                    <div className="min-w-0 flex-1 px-4 py-4 lg:px-6">
                        {/* A page whose module the role can't use says so instead of looking empty
                            (role module permissions, lib/module-access.ts). */}
                        {blockedModule ? (
                            <ErrorState kind="permission" title={`Your role can't see ${blockedModule.label.toLowerCase()}`} description="Ask an admin if you need access." />
                        ) : children}
                    </div>
                </main>
            </div>
            </PageTitleProvider>
        </KeyboardShortcutsProvider>
    );
}
