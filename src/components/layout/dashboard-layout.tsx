'use client';

import * as React from 'react';
import { NavigationDrawer } from './NavigationDrawer';
import { Header } from './header';
import { ImpersonationBanner } from './impersonation-banner';
import { PageTransition } from '@/components/ui/page-transition';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = React.useState(false);
    const [isMobile, setIsMobile] = React.useState(false);
    const [open, setOpen] = React.useState(true);

    // Right side sheet state (placeholder for now)
    const [sideSheetOpen, setSideSheetOpen] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const updateIsMobile = () => setIsMobile(mediaQuery.matches);

        updateIsMobile();
        mediaQuery.addEventListener('change', updateIsMobile);

        return () => mediaQuery.removeEventListener('change', updateIsMobile);
    }, []);

    React.useEffect(() => {
        if (isMobile) {
            setOpen(false);
        } else {
            const saved = localStorage.getItem('sidebar-open');
            if (saved !== null) {
                setOpen(saved === 'true');
            }
        }
    }, [isMobile]);

    const handleDrawerToggle = () => {
        const newState = !open;
        setOpen(newState);
        if (!isMobile) {
            localStorage.setItem('sidebar-open', String(newState));
        }
    };

    if (!mounted) {
        return (
            <div className="flex min-h-screen bg-background">
                <div className="hidden w-[68px] shrink-0 border-r bg-sidebar md:block" />
                <main className="flex min-w-0 grow flex-col">
                    <div className="h-16 border-b bg-background" />
                    <div className="mt-2 mb-4 flex grow flex-col px-4">
                        <div className="h-28 rounded-xl border bg-card/60" />
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-background">
            <NavigationDrawer open={open} toggleDrawer={handleDrawerToggle} />

            <main className="flex min-w-0 grow flex-col transition-[margin] duration-200 ease-in-out">
                <ImpersonationBanner />

                <Header />

                <div className="mt-2 mb-4 flex grow flex-col px-4">
                    <PageTransition>
                        <div className="relative flex items-start gap-4">
                            {/* Main Content Area */}
                            <div className="min-w-0 grow">
                                {children}
                            </div>

                            {/* Contextual Side Sheet (Hidden by default) */}
                            {sideSheetOpen && (
                                <aside className="sticky top-20 hidden h-[calc(100vh-100px)] w-[360px] shrink-0 overflow-y-auto rounded-xl border bg-card p-4 lg:block">
                                    {/* Side Sheet Content would go here */}
                                    Contextual Info
                                </aside>
                            )}
                        </div>
                    </PageTransition>
                </div>
            </main>
        </div>
    );
}
