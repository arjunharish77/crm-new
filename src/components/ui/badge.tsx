import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Tinted, sentence-case pills (UI/UX plan decision 25). Status badges use `tone`, one of the
// status tokens; the older variants map onto the same tinted look so existing callers keep working.
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium leading-4 w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:size-3 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-selected text-primary [a&]:hover:bg-selected/80",
        secondary: "bg-status-neutral text-status-neutral-foreground [a&]:hover:bg-status-neutral/80",
        destructive: "bg-status-danger text-status-danger-foreground focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline: "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
      tone: {
        success: "bg-status-success text-status-success-foreground",
        warning: "bg-status-warning text-status-warning-foreground",
        danger: "bg-status-danger text-status-danger-foreground",
        info: "bg-status-info text-status-info-foreground",
        neutral: "bg-status-neutral text-status-neutral-foreground",
        accent: "bg-status-accent text-status-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// Badges are sentence case with normal tracking and medium weight everywhere (decision 25), so
// per-call overrides that fight that are dropped here instead of in hundreds of call sites.
const DROPPED_BADGE_CLASSES = /^(?:uppercase|tracking-[\w[\].-]+|font-(?:bold|extrabold|black|semibold))$/

function badgeClassName(className?: string) {
  return className?.split(/\s+/).filter((token) => token && !DROPPED_BADGE_CLASSES.test(token)).join(" ")
}

function Badge({
  className,
  variant,
  tone,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant: tone ? null : variant, tone }), badgeClassName(className))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
