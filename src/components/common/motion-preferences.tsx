"use client";

import { MotionConfig } from "framer-motion";

// `reducedMotion="user"` makes every `motion.*` component inside respect the OS-level
// prefers-reduced-motion setting (opacity still animates; transforms and layout motion become
// instant). It wraps only the areas that animate (the signed-in app, sign-in and password
// reset), so public pages such as forms don't download the animation library (round-2 plan P4).
export function MotionPreferences({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
