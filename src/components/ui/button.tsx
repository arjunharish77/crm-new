'use client';

import * as React from 'react';
import { Button as MuiButton, ButtonProps as MuiButtonProps, CircularProgress, alpha, styled } from '@mui/material';
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// ─── Shadcn / Tailwind Variant Definition (Kept for compatibility) ───
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 shadow-md",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-6 py-2 has-[>svg]:px-4",
        xs: "h-7 rounded-[8px] px-3 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 rounded-[10px] px-4 has-[>svg]:px-3",
        lg: "h-12 rounded-[12px] px-8 has-[>svg]:px-6 text-base",
        icon: "size-10 rounded-[10px]",
        "icon-xs": "size-7 rounded-[8px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 rounded-[10px]",
        "icon-lg": "size-12 rounded-[12px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// ─── MUI Facade Implementation ───

// Shadcn variants mapping
export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link';

export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'xs' | 'icon-xs' | 'icon-sm' | 'icon-lg';

export interface ButtonProps extends Omit<MuiButtonProps, 'variant' | 'size' | 'color'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  asChild?: boolean; // Kept for compatibility but treated as false for now
}

// Styled component to handle custom variants if needed beyond standard MUI
const StyledButton = styled(MuiButton, {
  shouldForwardProp: (prop) => prop !== 'shadcnVariant' && prop !== 'shadcnSize',
})<{ shadcnVariant?: ButtonVariant; shadcnSize?: ButtonSize }>(({ theme, shadcnVariant, shadcnSize }) => {
  return {};
});

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', isLoading, children, ...props }, ref) => {

    // Map usage to MUI props
    let muiVariant: MuiButtonProps['variant'] = 'contained'; // default
    let muiColor: MuiButtonProps['color'] = 'primary';
    let muiSize: MuiButtonProps['size'] = 'medium';
    let sx = { ...props.sx };

    // Variant mapping
    switch (variant) {
      case 'destructive':
        muiColor = 'error';
        muiVariant = 'contained';
        break;
      case 'outline':
        muiVariant = 'outlined';
        muiColor = 'inherit';
        // Force border color to match surface variant or outline token
        sx = {
          ...sx,
          borderColor: 'outline',
          color: 'text.primary',
        };
        break;
      case 'secondary':
        muiColor = 'secondary';
        muiVariant = 'contained';
        break;
      case 'ghost':
        muiVariant = 'text';
        muiColor = 'inherit';
        sx = {
          ...sx,
          color: 'text.primary',
          '&:hover': {
            bgcolor: 'action.hover',
          }
        };
        break;
      case 'link':
        muiVariant = 'text';
        muiColor = 'primary';
        sx = {
          ...sx,
          textDecoration: 'underline',
          textUnderlineOffset: 4,
          '&:hover': {
            textDecoration: 'underline',
            bgcolor: 'transparent',
          }
        };
        break;
      default: // 'default'
        muiVariant = 'contained';
        muiColor = 'primary';
    }

    // Size mapping
    switch (size) {
      case 'sm':
      case 'xs': // Map xs to small
        muiSize = 'small';
        break;
      case 'lg':
        muiSize = 'large';
        break;
      case 'icon':
      case 'icon-sm':
        muiSize = 'medium';
        sx = {
          ...sx,
          minWidth: 40,
          width: 40,
          height: 40,
          p: 0,
          borderRadius: '10px',
        };
        break;
      case 'icon-xs':
        muiSize = 'small';
        sx = {
          ...sx,
          minWidth: 28,
          width: 28,
          height: 28,
          p: 0,
          borderRadius: '8px',
        };
        break;
      case 'icon-lg':
        muiSize = 'large';
        sx = {
          ...sx,
          minWidth: 48,
          width: 48,
          height: 48,
          p: 0,
          borderRadius: '12px',
        };
        break;
      case 'default':
        muiSize = 'medium';
        break;
      default:
        muiSize = 'medium';
    }

    // Merge className for utility override support (hybrid)
    // We pass className to StyledButton, which passes it to root.
    // Tailwind classes might conflict with MUI styles, but usually MUI wins on specificity if styled engine is configured right.
    // Or we can try to filter out conflicting layout classes. For now, pass it through.

    return (
      <StyledButton
        ref={ref}
        variant={muiVariant}
        color={muiColor}
        size={muiSize}
        disabled={isLoading || props.disabled}
        shadcnVariant={variant}
        shadcnSize={size}
        className={className}
        sx={sx}
        {...props}
        startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : props.startIcon}
      >
        {children}
      </StyledButton>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
