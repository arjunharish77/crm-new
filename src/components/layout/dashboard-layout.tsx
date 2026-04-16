'use client';

import * as React from 'react';
import { NavigationDrawer } from './NavigationDrawer';
import { Header } from './header';
import { Breadcrumbs } from './breadcrumbs';
import { ImpersonationBanner } from './impersonation-banner';
import {
    Box,
    CssBaseline,
    Container,
    useMediaQuery,
    useTheme,
    Paper,
} from '@mui/material';
import { PageTransition } from '@/components/ui/page-transition';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [open, setOpen] = React.useState(true);

    // Right side sheet state (placeholder for now)
    const [sideSheetOpen, setSideSheetOpen] = React.useState(false);

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

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
            <CssBaseline />

            <NavigationDrawer open={open} toggleDrawer={handleDrawerToggle} />

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    minWidth: 0, // Prevent overflow
                    display: 'flex',
                    flexDirection: 'column',
                    transition: theme.transitions.create('margin', {
                        easing: theme.transitions.easing.sharp,
                        duration: theme.transitions.duration.leavingScreen,
                    }),
                }}
            >
                <ImpersonationBanner />

                <Header />

                <Container maxWidth={false} sx={{ mt: 2, mb: 4, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>


                    <PageTransition>
                        <Box sx={{
                            position: 'relative',
                            display: 'flex',
                            gap: 2,
                            alignItems: 'start'
                        }}>
                            {/* Main Content Area */}
                            <Box sx={{ flexGrow: 1, minWidth: 0, width: '100%' }}>
                                {children}
                            </Box>

                            {/* Contextual Side Sheet (Hidden by default) */}
                            {sideSheetOpen && (
                                <Paper
                                    elevation={1}
                                    sx={{
                                        width: 360,
                                        flexShrink: 0,
                                        borderRadius: 3,
                                        p: 2,
                                        display: { xs: 'none', lg: 'block' },
                                        position: 'sticky',
                                        top: 80,
                                        height: 'calc(100vh - 100px)',
                                        overflowY: 'auto',
                                        bgcolor: 'surface.main' // M3 Surface
                                    }}
                                >
                                    {/* Side Sheet Content would go here */}
                                    Contextual Info
                                </Paper>
                            )}
                        </Box>
                    </PageTransition>
                </Container>
            </Box>
        </Box>
    );
}
