import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../providers/auth-provider";
import { NotificationProvider } from "../providers/notification-provider";
import { GeneralSettingsProvider } from "../providers/general-settings-provider";
import { ColorThemeProvider } from "../providers/color-theme-provider";
import { COLOR_THEME_STORAGE_KEY, DEFAULT_COLOR_THEME } from "@/lib/color-themes";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
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
        <ThemeRegistry>
          <ColorThemeProvider>
            <AuthProvider>
              <GeneralSettingsProvider>
                <NotificationProvider>
                  {children}
                  <Toaster />
                </NotificationProvider>
              </GeneralSettingsProvider>
            </AuthProvider>
          </ColorThemeProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
