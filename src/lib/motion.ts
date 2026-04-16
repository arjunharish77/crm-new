/**
 * M3 Expressive Motion System
 * Centralized motion tokens following Material Design 3 Expressive principles.
 * 
 * References:
 * - https://m3.material.io/styles/motion/overview
 * - M3 Expressive: emotionally resonant, spring-like, slight overshoot
 */

import { Variants, Transition } from 'framer-motion';

// ─── Duration Tokens (ms) ────────────────────────────────────────────────────
export const duration = {
    short1: 50,
    short2: 100,
    short3: 150,
    short4: 200,
    medium1: 250,
    medium2: 300,
    medium3: 350,
    medium4: 400,
    long1: 450,
    long2: 500,
    long3: 550,
    long4: 600,
    extraLong1: 700,
    extraLong2: 800,
    extraLong3: 900,
    extraLong4: 1000,
} as const;

// ─── Easing Curves ───────────────────────────────────────────────────────────
export const easing = {
    /** Standard: general-purpose transitions */
    standard: [0.2, 0, 0, 1] as [number, number, number, number],
    standardDecelerate: [0, 0, 0, 1] as [number, number, number, number],
    standardAccelerate: [0.3, 0, 1, 1] as [number, number, number, number],
    /** Emphasized: more expressive, attention-drawing */
    emphasized: [0.2, 0, 0, 1] as [number, number, number, number],
    emphasizedDecelerate: [0.05, 0.7, 0.1, 1] as [number, number, number, number],
    emphasizedAccelerate: [0.3, 0, 0.8, 0.15] as [number, number, number, number],
} as const;

// ─── CSS Easing Strings ──────────────────────────────────────────────────────
export const cssEasing = {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    standardDecelerate: 'cubic-bezier(0, 0, 0, 1)',
    standardAccelerate: 'cubic-bezier(0.3, 0, 1, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
    /** Expressive spring-like overshoot for hero transitions */
    expressiveSpring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
} as const;

// ─── Spring Configs (Framer Motion) ──────────────────────────────────────────
export const spring = {
    /** Micro-interactions: button press, checkbox, small UI feedback */
    micro: { type: 'spring' as const, stiffness: 500, damping: 30, mass: 0.8 },
    /** General UI: menus, tooltips, small panels */
    standard: { type: 'spring' as const, stiffness: 400, damping: 28, mass: 1 },
    /** Dialogs, floating toolbars — noticeable but controlled */
    expressive: { type: 'spring' as const, stiffness: 300, damping: 22, mass: 1 },
    /** Large transitions: drawers, full-screen panels */
    gentle: { type: 'spring' as const, stiffness: 200, damping: 24, mass: 1.2 },
    /** Bouncy: attention-drawing elements like FABs, notifications */
    bouncy: { type: 'spring' as const, stiffness: 400, damping: 15, mass: 1 },
};

// ─── Transition Presets ──────────────────────────────────────────────────────
export const transition = {
    /** Fast micro-interaction */
    fast: { duration: duration.short3 / 1000, ease: easing.standard } as Transition,
    /** Standard UI transition */
    normal: { duration: duration.medium2 / 1000, ease: easing.standard } as Transition,
    /** Emphasized transition for important state changes */
    emphasized: { duration: duration.medium4 / 1000, ease: easing.emphasized } as Transition,
    /** Slow decorative transition */
    slow: { duration: duration.long2 / 1000, ease: easing.emphasizedDecelerate } as Transition,
};

// ─── Variant Presets ─────────────────────────────────────────────────────────

/** Fade in from below — page/section entrance */
export const fadeInUp: Variants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { ...spring.standard } },
    exit: { opacity: 0, y: 8, transition: { duration: 0.15, ease: easing.standardAccelerate } },
};

/** Fade in from above */
export const fadeInDown: Variants = {
    initial: { opacity: 0, y: -16 },
    animate: { opacity: 1, y: 0, transition: { ...spring.standard } },
    exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: easing.standardAccelerate } },
};

/** Scale + fade — dialogs, modals */
export const scaleIn: Variants = {
    initial: { opacity: 0, scale: 0.92 },
    animate: { opacity: 1, scale: 1, transition: { ...spring.expressive } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15, ease: easing.emphasizedAccelerate } },
};

/** Slide from bottom — floating toolbar, snackbar */
export const slideUpSpring: Variants = {
    initial: { opacity: 0, y: 80, scale: 0.9 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { ...spring.expressive } },
    exit: { opacity: 0, y: 40, scale: 0.95, transition: { duration: 0.2, ease: easing.emphasizedAccelerate } },
};

/** Slide from right — side panels, drawers */
export const slideInRight: Variants = {
    initial: { opacity: 0, x: 40 },
    animate: { opacity: 1, x: 0, transition: { ...spring.gentle } },
    exit: { opacity: 0, x: 20, transition: { duration: 0.2, ease: easing.standardAccelerate } },
};

/** Stagger container for lists */
export const staggerContainer: Variants = {
    animate: {
        transition: {
            staggerChildren: 0.04,
            delayChildren: 0.02,
        },
    },
};

/** Stagger child item */
export const staggerItem: Variants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { ...spring.micro } },
};

/** Card hover effect */
export const cardHover = {
    rest: { scale: 1, y: 0, boxShadow: '0px 1px 3px rgba(0,0,0,0.08)' },
    hover: {
        scale: 1.01,
        y: -2,
        boxShadow: '0px 8px 24px rgba(0,0,0,0.12)',
        transition: { ...spring.micro },
    },
};

/** Button micro-interaction */
export const buttonPress = {
    whileTap: { scale: 0.97 },
    whileHover: { scale: 1.02 },
    transition: { ...spring.micro },
};

/** Row hover highlight */
export const rowHover = {
    rest: { backgroundColor: 'transparent' },
    hover: { backgroundColor: 'rgba(0,0,0,0.04)', transition: { duration: 0.15 } },
};

// ─── CSS Transition Strings (for non-framer styling) ─────────────────────────
export const cssTransition = {
    fast: `all ${duration.short3}ms ${cssEasing.standard}`,
    normal: `all ${duration.medium2}ms ${cssEasing.standard}`,
    emphasized: `all ${duration.medium4}ms ${cssEasing.emphasized}`,
    slow: `all ${duration.long2}ms ${cssEasing.emphasizedDecelerate}`,
    color: `color ${duration.short4}ms ${cssEasing.standard}, background-color ${duration.short4}ms ${cssEasing.standard}`,
    transform: `transform ${duration.medium2}ms ${cssEasing.expressiveSpring}`,
} as const;

// ─── CSS Keyframes (for @keyframes in styled-components or global CSS) ───────
export const keyframes = {
    shimmer: `
        @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
    `,
    pulse: `
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    `,
    slideUp: `
        @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `,
    scaleIn: `
        @keyframes scaleIn {
            from { transform: scale(0.92); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
    `,
    fadeIn: `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    `,
} as const;
