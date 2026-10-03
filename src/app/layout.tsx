import type { Metadata } from "next";
import "./globals.css";
// Gap checklist Module 17, item 4 (advanced dashboard builder: true 2D drag/drop grid).
// react-grid-layout ships its own required CSS (drag handle, resize handle, placeholder
// styles) -- Next.js only allows importing a third-party stylesheet from the root layout, not
// from the DashboardManager component itself, so it lives here despite only one page using it.
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { AuthProvider } from "../providers/auth-provider";
import { NotificationProvider } from "../providers/notification-provider";
import { InboundCallPopupProvider } from "../providers/inbound-call-popup-provider";
import { GeneralSettingsProvider } from "../providers/general-settings-provider";
import { ColorThemeProvider } from "../providers/color-theme-provider";
import { COLOR_THEME_STORAGE_KEY, DEFAULT_COLOR_THEME } from "@/lib/color-themes";
import { Toaster } from "@/components/ui/sonner";
import { DialogsProvider } from "@/components/common/dialogs-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionConfig } from "framer-motion";

export const metadata: Metadata = {
  // Absolute URLs for the share image (opengraph-image.png) and icons.
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: "Unnatify",
  description: "Secure, multi-tenant CRM SaaS",
};

import ThemeRegistry from "@/components/providers/ThemeRegistry";

// Applied before hydration so the chosen color theme never flashes to the
// "forest" default on load, mirroring how next-themes avoids a dark-mode flash.
const NO_FLASH_SCRIPT = `try {
  var t = window.localStorage.getItem(${JSON.stringify(COLOR_THEME_STORAGE_KEY)}) || ${JSON.stringify(DEFAULT_COLOR_THEME)};
  document.documentElement.setAttribute('data-color-theme', t);
} catch (e) {}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        {/* Gap checklist Module 10's "accessibility pass" item, "reduced motion support" --
            `reducedMotion="user"` makes every `motion.*` component app-wide (fadeInUp, scaleIn,
            slideInRight, etc. from src/lib/motion.ts included) automatically respect the OS-level
            prefers-reduced-motion setting -- opacity still animates, but transforms/layout
            motion collapse to instant. A single wrap here, rather than touching every one of
            this app's many `motion.div` call sites individually. */}
        <MotionConfig reducedMotion="user">
          <ThemeRegistry>
            <TooltipProvider>
            <ColorThemeProvider>
              <AuthProvider>
                <GeneralSettingsProvider>
                  <NotificationProvider>
                    <InboundCallPopupProvider>
                      <DialogsProvider>
                        {children}
                      </DialogsProvider>
                      <Toaster />
                    </InboundCallPopupProvider>
                  </NotificationProvider>
                </GeneralSettingsProvider>
              </AuthProvider>
            </ColorThemeProvider>
            </TooltipProvider>
          </ThemeRegistry>
        </MotionConfig>
      </body>
    </html>
  );
}
