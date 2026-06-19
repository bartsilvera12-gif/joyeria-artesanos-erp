import type { Metadata } from "next";
import { Playfair_Display, Cormorant_Garamond, Inter } from "next/font/google";
import { Header } from "@/components/elevate-public/Header";
import { Footer } from "@/components/elevate-public/Footer";
import { CartProvider } from "@/components/elevate-public/CartContext";
import { CotizacionProvider } from "@/components/elevate-public/CotizacionContext";
import { CartDrawer } from "@/components/elevate-public/CartDrawer";
import { WhatsAppFloat } from "@/components/elevate-public/WhatsAppFloat";
import "./elevate-theme.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Elevate Import Export",
  description:
    "Elevate: perfumería premium con fragancias nicho, ultranicho, de diseñador y árabes originales.",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
};

/**
 * Layout de la web pública Elevate. Scopea fonts y theme tokens vía
 * `.elevate-public-theme` para no afectar al ERP. CartProvider envuelve los
 * children (lo necesitan Header, CartDrawer y todas las pages que usan
 * useCart). Header es fixed (h-28). CartDrawer + WhatsAppFloat son
 * overlays globales.
 */
export default function ElevatePublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`elevate-public-theme min-h-svh flex flex-col ${playfair.variable} ${cormorant.variable} ${inter.variable}`}
    >
      <CotizacionProvider>
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <CartDrawer />
          <WhatsAppFloat />
        </CartProvider>
      </CotizacionProvider>
    </div>
  );
}
