/**
 * Framer Motion Animation Presets
 * Material Design motion principles
 */

import { Variants } from 'framer-motion';

// Fade animations
export const fadeIn: Variants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};

export const fadeInUp: Variants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
};

export const fadeInDown: Variants = {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
};

// Scale animations
export const scaleIn: Variants = {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
};

export const scaleInCenter: Variants = {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
};

// Slide animations
export const slideInLeft: Variants = {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
};

export const slideInRight: Variants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
};

// List animations
export const staggerContainer: Variants = {
    animate: {
        transition: {
            staggerChildren: 0.1,
        },
    },
};

export const staggerItem: Variants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
};

// Card animations
export const cardHover: Variants = {
    rest: { scale: 1 },
    hover: {
        scale: 1.02,
        transition: { duration: 0.2 },
    },
};

// Button animations
export const buttonTap = {
    scale: 0.95,
};

// Transition presets
export const transitions = {
    fast: { duration: 0.15, ease: [0.2, 0, 0, 1] },
    normal: { duration: 0.3, ease: [0.2, 0, 0, 1] },
    slow: { duration: 0.5, ease: [0.2, 0, 0, 1] },
    emphasized: { duration: 0.5, ease: [0.2, 0, 0, 1.0] },

    // M3 Expressive Springs
    spring: { type: 'spring', stiffness: 400, damping: 28, mass: 1 } as any,
    expressive: { type: 'spring', stiffness: 300, damping: 20, mass: 1 } as any,
    bouncy: { type: 'spring', stiffness: 500, damping: 15, mass: 1 } as any,
    gentle: { type: 'spring', stiffness: 100, damping: 20, mass: 1 } as any,
};

// Helper function to create custom fade variants
export const createFadeVariant = (direction: 'up' | 'down' | 'left' | 'right' = 'up', distance = 20) => {
    const axis = direction === 'up' || direction === 'down' ? 'y' : 'x';
    const value = direction === 'up' || direction === 'left' ? distance : -distance;

    return {
        initial: { opacity: 0, [axis]: value },
        animate: { opacity: 1, [axis]: 0 },
        exit: { opacity: 0, [axis]: value },
    };
};
