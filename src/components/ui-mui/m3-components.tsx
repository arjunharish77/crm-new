'use client';

import React from 'react';
import { motion, AnimatePresence, HTMLMotionProps } from 'framer-motion';
import {
    Button as MuiButton,
    ButtonProps as MuiButtonProps,
    Card as MuiCard,
    CardProps as MuiCardProps,
    Dialog as MuiDialog,
    DialogProps as MuiDialogProps,
    Box,
    alpha,
    useTheme
} from '@mui/material';
import { spring, fadeInUp, scaleIn, buttonPress } from '@/lib/motion';

// ─── M3 Button ───────────────────────────────────────────────────────────────

export const M3Button = React.forwardRef<HTMLButtonElement, MuiButtonProps>((props, ref) => {
    return (
        <motion.div {...buttonPress}>
            <MuiButton ref={ref} {...props} />
        </motion.div>
    );
});
M3Button.displayName = 'M3Button';

// ─── M3 Card ─────────────────────────────────────────────────────────────────

export const M3Card = React.forwardRef<HTMLDivElement, MuiCardProps>((props, ref) => {
    const theme = useTheme();
    return (
        <motion.div
            whileHover={{
                y: -2,
                scale: 1.002,
                transition: { ...spring.micro }
            }}
            whileTap={{ scale: 0.995 }}
        >
            <MuiCard
                ref={ref}
                {...props}
                sx={{
                    transition: 'background-color 0.2s, border-color 0.2s',
                    '&:hover': {
                        backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.03),
                        borderColor: 'primary.main',
                    },
                    ...props.sx
                }}
            />
        </motion.div>
    );
});
M3Card.displayName = 'M3Card';

// ─── Page Transition ──────────────────────────────────────────────────────────

export const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <Box
            component={motion.div}
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            exit="exit"
            sx={{ width: '100%', height: '100%' }}
        >
            {children}
        </Box>
    );
};

// ─── Staggered Container ─────────────────────────────────────────────────────

export const StaggerContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <motion.div
            variants={{
                animate: {
                    transition: {
                        staggerChildren: 0.05,
                    },
                },
            }}
            initial="initial"
            animate="animate"
        >
            {children}
        </motion.div>
    );
};

export const StaggerItem: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <motion.div
            variants={{
                initial: { opacity: 0, y: 10 },
                animate: { opacity: 1, y: 0, transition: { ...spring.standard } },
            }}
        >
            {children}
        </motion.div>
    );
};
