import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../providers/auth-provider";
import { NotificationProvider } from "../providers/notification-provider";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Enterprise CRM",
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
            <NotificationProvider>
              {children}
              <Toaster />
            </NotificationProvider>
          </AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
