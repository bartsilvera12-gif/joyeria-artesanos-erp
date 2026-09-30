import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header } from "@/components/elevate-public/Header";
import { Footer } from "@/components/elevate-public/Footer";
import { CartProvider } from "@/components/elevate-public/CartContext";
import { CotizacionProvider } from "@/components/elevate-public/CotizacionContext";
import { CartDrawer } from "@/components/elevate-public/CartDrawer";
import { WhatsAppFloat } from "@/components/elevate-public/WhatsAppFloat";
import "./elevate-theme.css";

/**
 * Fuentes locales (no `next/font/google`): con Google, `next build` las descarga en pleno build y
 * el deploy falla si esa descarga se corta. Mismos archivos que entrega Google (subset latino,
 * fuentes variables: un archivo cubre todos los pesos). Licencia OFL.
 */
const playfair = localFont({
  src: "./fonts/playfair-display-latin.woff2",
  variable: "--font-playfair",
  weight: "400 800",
  display: "swap",
});

const cormorant = localFont({
  src: [
    { path: "./fonts/cormorant-garamond-latin.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/cormorant-garamond-italic-latin.woff2", weight: "400 700", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-inter",
  weight: "300 700",
  display: "swap",
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
