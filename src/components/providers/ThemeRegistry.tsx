'use client';

import * as React from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { lightTheme, darkTheme } from '@/theme';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useTheme as useNextTheme } from 'next-themes';

// We are assuming next-themes is used for theme switching, 
// if not we can default to lightTheme or implement a separate context.
// Based on package.json, next-themes is present.

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
    const { theme: resolvedTheme } = useNextTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    // Prevent hydration mismatch
    const currentTheme = mounted && resolvedTheme === 'dark' ? darkTheme : lightTheme;

    return (
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
            <ThemeProvider theme={currentTheme}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <CssBaseline />
                    {children}
                </LocalizationProvider>
            </ThemeProvider>
        </AppRouterCacheProvider>
    );
}
