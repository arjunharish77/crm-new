'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export function Breadcrumbs() {
    const pathname = usePathname();
    const pathnames = pathname.split('/').filter((x) => x);

    if (pathnames.length === 0) return null;

    return (
        <nav className="bg-background px-3 py-1" aria-label="breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-[0.8125rem]">
                <li>
                <Link
                    href="/dashboard"
                    className="font-medium text-muted-foreground hover:text-primary"
                >
                    Dashboard
                </Link>
                </li>
                {pathnames.map((value, index) => {
                    const last = index === pathnames.length - 1;
                    const to = `/${pathnames.slice(0, index + 1).join('/')}`;

                    if (value === 'dashboard') return null;

                    const label = value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ');

                    return last ? (
                        <React.Fragment key={to}>
                            <ChevronRight className="size-4 text-muted-foreground" />
                            <li className="font-semibold text-foreground">{label}</li>
                        </React.Fragment>
                    ) : (
                        <React.Fragment key={to}>
                            <ChevronRight className="size-4 text-muted-foreground" />
                            <li>
                                <Link
                                    href={to}
                                    className="font-medium text-muted-foreground hover:text-primary"
                            >
                                {label}
                                </Link>
                            </li>
                        </React.Fragment>
                    );
                })}
            </ol>
        </nav>
    );
}
