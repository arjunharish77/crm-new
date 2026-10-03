"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// An icon-only button always has a name (UI/UX plan rule A1): `label` becomes the accessible
// name and the hover/focus tooltip, so an icon is never the only clue to what it does.
export const IconButton = React.forwardRef<HTMLButtonElement, Omit<ButtonProps, "aria-label"> & {
    label: string;
    tooltipSide?: "top" | "right" | "bottom" | "left";
}>(({ label, tooltipSide = "top", variant = "ghost", size = "icon-sm", children, ...props }, ref) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button ref={ref} variant={variant} size={size} aria-label={label} {...props}>
                {children}
            </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
));
IconButton.displayName = "IconButton";
