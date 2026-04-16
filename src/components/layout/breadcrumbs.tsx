'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Breadcrumbs as MuiBreadcrumbs, Typography, Box, alpha } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

export function Breadcrumbs() {
    const pathname = usePathname();
    const pathnames = pathname.split('/').filter((x) => x);

    if (pathnames.length === 0) return null;

    return (
        <Box sx={{ py: 1, px: 3, bgcolor: 'background.default' }}>
            <MuiBreadcrumbs
                separator={<NavigateNextIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
                aria-label="breadcrumb"
            >
                <Link
                    href="/dashboard"
                    style={{
                        textDecoration: 'none',
                        color: 'inherit',
                        fontSize: '0.8125rem',
                        fontWeight: 500
                    }}
                >
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            '&:hover': { color: 'primary.main', cursor: 'pointer' },
                            fontWeight: 500
                        }}
                    >
                        Dashboard
                    </Typography>
                </Link>
                {pathnames.map((value, index) => {
                    const last = index === pathnames.length - 1;
                    const to = `/${pathnames.slice(0, index + 1).join('/')}`;

                    if (value === 'dashboard') return null;

                    const label = value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ');

                    return last ? (
                        <Typography
                            key={to}
                            variant="caption"
                            sx={{ color: 'text.primary', fontWeight: 600, fontSize: '0.8125rem' }}
                        >
                            {label}
                        </Typography>
                    ) : (
                        <Link
                            href={to}
                            key={to}
                            style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: 'text.secondary',
                                    '&:hover': { color: 'primary.main', cursor: 'pointer' },
                                    fontWeight: 500
                                }}
                            >
                                {label}
                            </Typography>
                        </Link>
                    );
                })}
            </MuiBreadcrumbs>
        </Box>
    );
}
