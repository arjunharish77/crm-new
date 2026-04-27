import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../providers/auth-provider";
import { NotificationProvider } from "../providers/notification-provider";
import { GeneralSettingsProvider } from "../providers/general-settings-provider";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Unnatify",
  description: "Secure, multi-tenant CRM SaaS",
};

import ThemeRegistry from "@/components/providers/ThemeRegistry";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeRegistry>
          <AuthProvider>
            <GeneralSettingsProvider>
              <NotificationProvider>
                {children}
                <Toaster />
              </NotificationProvider>
            </GeneralSettingsProvider>
          </AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
