import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import AppShell from "../components/AppShell";
import { ThemeProvider } from "../components/ThemeProvider";
import AuthGuard from "../components/AuthGuard";
import { ELEVATE_PUBLIC_HEADER } from "../lib/elevate-public/hosts";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Neura ERP",
  description: "Sistema de gestión empresarial de Neura",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
};

/**
 * Root layout. Decide en server-time si la request corresponde a la web
 * pública de Elevate (header inyectado por el middleware) o al ERP/admin.
 *
 *   - Web pública  → children directo (chrome propio en `__public/layout.tsx`).
 *   - ERP/admin    → `AuthGuard` + `AppShell` (sidebar + topbar) como antes.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const isPublic = h.get(ELEVATE_PUBLIC_HEADER) === "1";

  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${plusJakarta.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          {isPublic ? (
            children
          ) : (
            <AuthGuard>
              <AppShell>{children}</AppShell>
            </AuthGuard>
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
