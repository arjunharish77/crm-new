'use client';

import { createTheme, ThemeOptions, alpha } from '@mui/material/styles';
import { cssEasing, duration } from '@/lib/motion';

// ─── M3 Expressive Easing CSS strings ────────────────────────────────────────
const m3Ease = {
    standard: cssEasing.standard,
    emphasized: cssEasing.emphasized,
    decelerate: cssEasing.emphasizedDecelerate,
    accelerate: cssEasing.emphasizedAccelerate,
    spring: cssEasing.expressiveSpring,
};

const md3Colors = {
    light: {
        primary: '#1b6c31',
        onPrimary: '#FFFFFF',
        primaryContainer: '#a3f5aa',
        onPrimaryContainer: '#002108',
        secondary: '#516350',
        onSecondary: '#FFFFFF',
        secondaryContainer: '#d4e8cf',
        onSecondaryContainer: '#0f1f10',
        tertiary: '#39656b',
        onTertiary: '#FFFFFF',
        tertiaryContainer: '#bcebef',
        onTertiaryContainer: '#001f21',
        error: '#B3261E',
        onError: '#FFFFFF',
        errorContainer: '#F9DEDC',
        onErrorContainer: '#410E0B',
        background: '#f7fbf2',
        onBackground: '#181d18',
        surface: '#f7fbf2',
        onSurface: '#181d18',
        surfaceVariant: '#dee5d9',
        onSurfaceVariant: '#424940',
        outline: '#727970',
        outlineVariant: '#c1c9be',
        shadow: '#000000',
        scrim: '#000000',
        inverseSurface: '#2d322c',
        inverseOnSurface: '#eff2e9',
        inversePrimary: '#88d891',
        surfaceContainerHighest: '#e0e4de',
        surfaceContainerHigh: '#e6e9e3',
        surfaceContainer: '#ebefea',
        surfaceContainerLow: '#f1f4f0',
        surfaceContainerLowest: '#FFFFFF',
        surfaceDim: '#d7dbd4',
        surfaceBright: '#f7fbf2',
    },
    dark: {
        primary: '#88d891',
        onPrimary: '#003915',
        primaryContainer: '#005322',
        onPrimaryContainer: '#a3f5aa',
        secondary: '#b8ccb4',
        onSecondary: '#243424',
        secondaryContainer: '#3a4b39',
        onSecondaryContainer: '#d4e8cf',
        tertiary: '#a1ced3',
        onTertiary: '#00363c',
        tertiaryContainer: '#1f4d53',
        onTertiaryContainer: '#bcebef',
        error: '#F2B8B5',
        onError: '#601410',
        errorContainer: '#8C1D18',
        onErrorContainer: '#F9DEDC',
        background: '#101410',
        onBackground: '#e0e4de',
        surface: '#101410',
        onSurface: '#e0e4de',
        surfaceVariant: '#424940',
        onSurfaceVariant: '#c1c9be',
        outline: '#8b9389',
        outlineVariant: '#424940',
        shadow: '#000000',
        scrim: '#000000',
        inverseSurface: '#e0e4de',
        inverseOnSurface: '#2d322c',
        inversePrimary: '#1b6c31',
        surfaceContainerHighest: '#313631',
        surfaceContainerHigh: '#272b26',
        surfaceContainer: '#1d201d',
        surfaceContainerLow: '#181d18',
        surfaceContainerLowest: '#0d100d',
        surfaceDim: '#101410',
        surfaceBright: '#363a35',
    }
};

declare module '@mui/material/styles' {
    interface Palette {
        onPrimary: string;
        primaryContainer: string;
        onPrimaryContainer: string;
        secondaryContainer: string;
        onSecondaryContainer: string;
        tertiary: {
            main: string;
            light: string;
            dark: string;
            contrastText: string;
        };
        onTertiary: string;
        tertiaryContainer: string;
        onTertiaryContainer: string;
        surfaceContainerLowest: string;
        surfaceContainerLow: string;
        surfaceContainer: string;
        surfaceContainerHigh: string;
        surfaceContainerHighest: string;
        onSurface: string;
        onSurfaceVariant: string;
        surfaceVariant: string;
        inverseSurface: string;
        inverseOnSurface: string;
        outline: string;
        outlineVariant: string;
    }
    interface PaletteOptions {
        onPrimary?: string;
        primaryContainer?: string;
        onPrimaryContainer?: string;
        secondaryContainer?: string;
        onSecondaryContainer?: string;
        tertiary?: {
            main?: string;
            light?: string;
            dark?: string;
            contrastText?: string;
        };
        onTertiary?: string;
        tertiaryContainer?: string;
        onTertiaryContainer?: string;
        surfaceContainerLowest?: string;
        surfaceContainerLow?: string;
        surfaceContainer?: string;
        surfaceContainerHigh?: string;
        surfaceContainerHighest?: string;
        onSurface?: string;
        onSurfaceVariant?: string;
        surfaceVariant?: string;
        inverseSurface?: string;
        inverseOnSurface?: string;
        outline?: string;
        outlineVariant?: string;
    }
}

const getDesignTokens = (mode: 'light' | 'dark'): ThemeOptions => ({
    palette: {
        mode,
        primary: {
            main: md3Colors[mode].primary,
            light: md3Colors[mode].primaryContainer,
            dark: md3Colors[mode].onPrimaryContainer,
            contrastText: md3Colors[mode].onPrimary,
        },
        secondary: {
            main: md3Colors[mode].secondary,
            light: md3Colors[mode].secondaryContainer,
            dark: md3Colors[mode].onSecondaryContainer,
            contrastText: md3Colors[mode].onSecondary,
        },
        error: {
            main: md3Colors[mode].error,
            light: md3Colors[mode].errorContainer,
            dark: md3Colors[mode].onErrorContainer,
            contrastText: md3Colors[mode].onError,
        },
        background: {
            default: md3Colors[mode].background,
            paper: md3Colors[mode].surface,
        },
        text: {
            primary: md3Colors[mode].onSurface,
            secondary: md3Colors[mode].onSurfaceVariant,
        },
        divider: md3Colors[mode].outlineVariant,

        onPrimary: md3Colors[mode].onPrimary,
        primaryContainer: md3Colors[mode].primaryContainer,
        onPrimaryContainer: md3Colors[mode].onPrimaryContainer,
        secondaryContainer: md3Colors[mode].secondaryContainer,
        onSecondaryContainer: md3Colors[mode].onSecondaryContainer,
        tertiary: {
            main: md3Colors[mode].tertiary,
            light: md3Colors[mode].tertiaryContainer,
            dark: md3Colors[mode].onTertiaryContainer,
            contrastText: md3Colors[mode].onTertiary,
        },
        onTertiary: md3Colors[mode].onTertiary,
        tertiaryContainer: md3Colors[mode].tertiaryContainer,
        onTertiaryContainer: md3Colors[mode].onTertiaryContainer,
        surfaceContainerLowest: md3Colors[mode].surfaceContainerLowest,
        surfaceContainerLow: md3Colors[mode].surfaceContainerLow,
        surfaceContainer: md3Colors[mode].surfaceContainer,
        surfaceContainerHigh: md3Colors[mode].surfaceContainerHigh,
        surfaceContainerHighest: md3Colors[mode].surfaceContainerHighest,
        onSurface: md3Colors[mode].onSurface,
        onSurfaceVariant: md3Colors[mode].onSurfaceVariant,
        surfaceVariant: md3Colors[mode].surfaceVariant,
        inverseSurface: md3Colors[mode].inverseSurface,
        inverseOnSurface: md3Colors[mode].inverseOnSurface,
        outline: md3Colors[mode].outline,
        outlineVariant: md3Colors[mode].outlineVariant,
    },
    typography: {
        fontFamily: '"Instrument Sans", "Avenir Next", "Segoe UI", sans-serif',
        h1: { fontSize: '50px', lineHeight: '56px', letterSpacing: '-0.3px', fontWeight: 500 },
        h2: { fontSize: '40px', lineHeight: '46px', letterSpacing: '-0.2px', fontWeight: 500 },
        h3: { fontSize: '31px', lineHeight: '38px', letterSpacing: '-0.1px', fontWeight: 600 },
        h4: { fontSize: '27px', lineHeight: '34px', letterSpacing: '0px', fontWeight: 600 },
        h5: { fontSize: '22px', lineHeight: '28px', letterSpacing: '0px', fontWeight: 700 },
        h6: { fontSize: '18px', lineHeight: '24px', letterSpacing: '0px', fontWeight: 700 },
        subtitle1: { fontSize: '15px', lineHeight: '22px', letterSpacing: '0.1px', fontWeight: 600 },
        subtitle2: { fontSize: '13px', lineHeight: '18px', letterSpacing: '0.08px', fontWeight: 600 },
        body1: { fontSize: '14px', lineHeight: '21px', letterSpacing: '0.25px', fontWeight: 400 },
        body2: { fontSize: '13px', lineHeight: '18px', letterSpacing: '0.2px', fontWeight: 400 },
        button: { fontSize: '14px', lineHeight: '20px', letterSpacing: '0.1px', fontWeight: 500, textTransform: 'none' },
        caption: { fontSize: '12px', lineHeight: '16px', letterSpacing: '0.4px', fontWeight: 400 },
        overline: { fontSize: '12px', lineHeight: '16px', letterSpacing: '0.5px', fontWeight: 500, textTransform: 'uppercase' },
        labelLarge: { fontSize: '13px', lineHeight: '18px', letterSpacing: '0.08px', fontWeight: 600 },
        labelMedium: { fontSize: '11px', lineHeight: '14px', letterSpacing: '0.45px', fontWeight: 600 },
        labelSmall: { fontSize: '11px', lineHeight: '16px', letterSpacing: '0.5px', fontWeight: 500 },
        titleMedium: { fontSize: '15px', lineHeight: '21px', letterSpacing: '0.12px', fontWeight: 600 },
        titleSmall: { fontSize: '13px', lineHeight: '18px', letterSpacing: '0.08px', fontWeight: 600 },
    },
    shape: {
        borderRadius: 14,
    },
    components: {
        // ─── Buttons ─────────────────────────────────────────────────
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: '28px',
                    padding: '9px 20px',
                    boxShadow: 'none',
                    textTransform: 'none',
                    fontWeight: 600,
                    letterSpacing: '0.1px',
                    transition: `all ${duration.medium2}ms ${m3Ease.emphasized}`,
                    '&:hover': {
                        boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.15)',
                        transform: 'translateY(-1px) scale(1.01)',
                    },
                    '&:active': {
                        transform: 'translateY(0) scale(0.97)',
                        transition: `all ${duration.short2}ms ${m3Ease.accelerate}`,
                    },
                },
                sizeSmall: {
                    padding: '4px 12px',
                    fontSize: '12px',
                    borderRadius: '18px',
                    height: '28px',
                },
                contained: {
                    backgroundColor: md3Colors[mode].primary,
                    color: md3Colors[mode].onPrimary,
                    '&:hover': {
                        backgroundColor: alpha(md3Colors[mode].primary, 0.92),
                        boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.2)',
                    },
                },
                containedSecondary: {
                    backgroundColor: md3Colors[mode].secondaryContainer,
                    color: md3Colors[mode].onSecondaryContainer,
                    '&:hover': {
                        backgroundColor: alpha(md3Colors[mode].secondaryContainer, 0.88),
                        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
                    },
                },
                outlined: {
                    borderColor: md3Colors[mode].outline,
                    color: md3Colors[mode].primary,
                    '&:hover': {
                        borderColor: md3Colors[mode].primary,
                        backgroundColor: alpha(md3Colors[mode].primary, 0.08),
                    },
                },
                text: {
                    padding: '7px 12px',
                    '&:hover': {
                        backgroundColor: alpha(md3Colors[mode].primary, 0.08),
                    },
                },
            },
            defaultProps: {
                disableElevation: true,
                disableRipple: false,
            },
        },
        MuiIconButton: {
            styleOverrides: {
                root: {
                    padding: 8,
                    transition: `all ${duration.short4}ms ${m3Ease.standard}`,
                    '&:hover': {
                        transform: 'scale(1.04)',
                        backgroundColor: alpha(md3Colors[mode].onSurface, 0.08),
                    },
                    '&:active': {
                        transform: 'scale(0.95)',
                    },
                },
            },
        },
        MuiFab: {
            styleOverrides: {
                root: {
                    borderRadius: '28px',
                    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
                    transition: `all ${duration.medium2}ms ${m3Ease.spring}`,
                    '&:hover': {
                        boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.2)',
                        transform: 'scale(1.05)',
                    },
                    '&:active': {
                        transform: 'scale(0.97)',
                    },
                },
            },
        },
        // ─── Surfaces ────────────────────────────────────────────────
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    borderRadius: '18px',
                    transition: `all ${duration.medium4}ms ${m3Ease.emphasized}`,
                    backgroundColor: md3Colors[mode].surfaceContainerLow,
                    border: `1px solid ${md3Colors[mode].outlineVariant}`,
                    boxShadow: 'none',
                    '&:hover': {
                        boxShadow: '0px 6px 18px rgba(0, 0, 0, 0.06)',
                        transform: 'translateY(-1px)',
                        backgroundColor: md3Colors[mode].surfaceContainer,
                        borderColor: md3Colors[mode].outlineVariant,
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    borderRadius: '14px',
                },
            },
        },
        // ─── Dialogs ─────────────────────────────────────────────────
        MuiDialog: {
            styleOverrides: {
                paper: {
                    borderRadius: '20px',
                    backgroundImage: 'none',
                    backgroundColor: md3Colors[mode].surfaceContainerHigh,
                    boxShadow: '0px 16px 42px rgba(0, 0, 0, 0.14)',
                },
            },
        },
        MuiDialogTitle: {
            styleOverrides: {
                root: {
                    fontSize: '20px',
                    fontWeight: 600,
                    padding: '18px 18px 10px',
                },
            },
        },
        MuiDialogContent: {
            styleOverrides: {
                root: {
                    padding: '6px 18px 18px',
                },
            },
        },
        MuiDialogActions: {
            styleOverrides: {
                root: {
                    padding: '4px 18px 18px',
                    gap: '6px',
                },
            },
        },
        // ─── Navigation ──────────────────────────────────────────────
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    borderRight: 'none',
                    borderRadius: '0 22px 22px 0',
                    backgroundColor: md3Colors[mode].surfaceContainerLow,
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    boxShadow: 'none',
                    backgroundColor: alpha(md3Colors[mode].background, 0.92),
                    backdropFilter: 'blur(12px)',
                    color: md3Colors[mode].onSurface,
                    backgroundImage: 'none',
                },
            },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    borderRadius: '22px',
                    minHeight: 42,
                    transition: `all ${duration.short4}ms ${m3Ease.standard}`,
                    '&:hover': {
                        transform: 'scale(1.01)',
                    },
                },
            },
        },
        MuiTabs: {
            styleOverrides: {
                indicator: {
                    borderRadius: '3px 3px 0 0',
                    height: 3,
                    transition: `all ${duration.medium2}ms ${m3Ease.spring}`,
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    fontWeight: 500,
                    fontSize: '13px',
                    minHeight: 40,
                    padding: '8px 12px',
                    transition: `all ${duration.short4}ms ${m3Ease.standard}`,
                    '&.Mui-selected': {
                        fontWeight: 700,
                    },
                },
            },
        },
        // ─── Inputs ──────────────────────────────────────────────────
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        minHeight: 40,
                        borderRadius: '10px',
                        transition: `all ${duration.short4}ms ${m3Ease.standard}`,
                        '&.Mui-focused': {
                            backgroundColor: alpha(md3Colors[mode].primary, 0.04),
                        },
                    },
                },
            },
        },
        MuiSelect: {
            styleOverrides: {
                root: {
                    borderRadius: '10px',
                },
            },
        },
        MuiCheckbox: {
            styleOverrides: {
                root: {
                    transition: `all ${duration.short3}ms ${m3Ease.standard}`,
                    '&:hover': {
                        transform: 'scale(1.1)',
                    },
                    '&.Mui-checked': {
                        animation: 'none',
                    },
                },
            },
        },
        MuiSwitch: {
            styleOverrides: {
                switchBase: {
                    transition: `all ${duration.short4}ms ${m3Ease.spring}`,
                },
                thumb: {
                    transition: `all ${duration.short4}ms ${m3Ease.spring}`,
                },
            },
        },
        // ─── Data Display ────────────────────────────────────────────
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: '7px',
                    fontWeight: 500,
                    height: 24,
                    transition: `all ${duration.short3}ms ${m3Ease.standard}`,
                    '&:hover': {
                        transform: 'scale(1.01)',
                    },
                },
            },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 500,
                    padding: '6px 12px',
                    backgroundColor: md3Colors[mode].inverseSurface,
                    color: md3Colors[mode].inverseOnSurface,
                },
                arrow: {
                    color: md3Colors[mode].inverseSurface,
                },
            },
        },
        MuiSnackbar: {
            styleOverrides: {
                root: {
                    '& .MuiSnackbarContent-root': {
                        borderRadius: '12px',
                        backgroundColor: md3Colors[mode].inverseSurface,
                        color: md3Colors[mode].inverseOnSurface,
                    },
                },
            },
        },
        MuiAlert: {
            styleOverrides: {
                root: {
                    borderRadius: '16px',
                },
            },
        },
        // ─── Progress ────────────────────────────────────────────────
        MuiLinearProgress: {
            styleOverrides: {
                root: {
                    borderRadius: '8px',
                    height: 6,
                    backgroundColor: alpha(md3Colors[mode].primary, 0.12),
                },
                bar: {
                    borderRadius: '8px',
                    transition: `transform ${duration.medium4}ms ${m3Ease.decelerate}`,
                },
            },
        },
        MuiCircularProgress: {
            styleOverrides: {
                root: {
                    // Expressive: slightly thinner for elegance
                },
            },
        },
        // ─── Menu / Popover ──────────────────────────────────────────
        MuiMenu: {
            styleOverrides: {
                paper: {
                    borderRadius: '16px',
                    boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.12)',
                    border: `1px solid ${md3Colors[mode].outlineVariant}`,
                    backgroundColor: md3Colors[mode].surfaceContainer,
                },
            },
        },
        MuiMenuItem: {
            styleOverrides: {
                root: {
                    borderRadius: '8px',
                    margin: '2px 8px',
                    transition: `all ${duration.short3}ms ${m3Ease.standard}`,
                },
            },
        },
        MuiPopover: {
            styleOverrides: {
                paper: {
                    borderRadius: '16px',
                    boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.12)',
                },
            },
        },
        // ─── Divider ─────────────────────────────────────────────────
        MuiDivider: {
            styleOverrides: {
                root: {
                    borderColor: md3Colors[mode].outlineVariant,
                },
            },
        },
        // ─── Skeleton ────────────────────────────────────────────────
        MuiSkeleton: {
            styleOverrides: {
                root: {
                    borderRadius: '8px',
                    backgroundColor: alpha(md3Colors[mode].onSurface, 0.08),
                },
            },
            defaultProps: {
                animation: 'wave',
            },
        },
    },
});

export const lightTheme = createTheme(getDesignTokens('light'));
export const darkTheme = createTheme(getDesignTokens('dark'));

export default lightTheme;
