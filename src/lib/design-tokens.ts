/**
 * Material Design System Tokens
 * 8px grid system with Material Design elevation
 */

export const spacing = {
    0: '0px',
    1: '8px',   // 0.5rem
    2: '16px',  // 1rem
    3: '24px',  // 1.5rem
    4: '32px',  // 2rem
    5: '40px',  // 2.5rem
    6: '48px',  // 3rem
    7: '56px',  // 3.5rem
    8: '64px',  // 4rem
} as const;

export const elevation = {
    0: 'none',
    1: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    2: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    3: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    4: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    5: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
} as const;

export const colors = {
    // Neutral palette (extended)
    neutral: {
        50: '#fafafa',
        100: '#f5f5f5',
        200: '#e5e5e5',
        300: '#d4d4d4',
        400: '#a3a3a3',
        500: '#737373',
        600: '#525252',
        700: '#404040',
        800: '#262626',
        900: '#171717',
        950: '#0a0a0a',
    },

    // Status colors
    success: {
        50: '#f0fdf4',
        100: '#dcfce7',
        500: '#22c55e',
        600: '#16a34a',
        700: '#15803d',
    },

    warning: {
        50: '#fffbeb',
        100: '#fef3c7',
        500: '#f59e0b',
        600: '#d97706',
        700: '#b45309',
    },

    error: {
        50: '#fef2f2',
        100: '#fee2e2',
        500: '#ef4444',
        600: '#dc2626',
        700: '#b91c1c',
    },

    info: {
        50: '#eff6ff',
        100: '#dbeafe',
        500: '#3b82f6',
        600: '#2563eb',
        700: '#1d4ed8',
    },
} as const;

export const typography = {
    fontSizes: {
        xs: '0.75rem',    // 12px
        sm: '0.875rem',   // 14px
        base: '1rem',     // 16px
        lg: '1.125rem',   // 18px
        xl: '1.25rem',    // 20px
        '2xl': '1.5rem',  // 24px
        '3xl': '1.875rem', // 30px
        '4xl': '2.25rem', // 36px
    },

    lineHeights: {
        tight: '1.25',
        normal: '1.5',
        relaxed: '1.75',
    },

    fontWeights: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
    },
} as const;

export const borderRadius = {
    none: '0',
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    base: '0.75rem', // 12px
    md: '0.75rem',   // 12px
    lg: '1.25rem',   // 20px
    xl: '1.75rem',   // 28px
    '2xl': '2rem',   // 32px
    full: '9999px',
} as const;

export const transitions = {
    fast: '150ms cubic-bezier(0.2, 0, 0, 1)',
    normal: '300ms cubic-bezier(0.2, 0, 0, 1)',
    slow: '500ms cubic-bezier(0.05, 0.7, 0.1, 1)',
    emphasized: '400ms cubic-bezier(0.2, 0, 0, 1)',
    spring: '400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
} as const;

export const zIndex = {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
} as const;
