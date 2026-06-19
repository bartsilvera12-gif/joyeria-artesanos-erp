"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ShoppingBag } from "lucide-react";
import { Logo } from "./Logo";
import { useCart } from "./CartContext";
import { SearchBox } from "./SearchBox";

const NAV = [
  { label: "Inicio", href: "/" },
  { label: "Catálogo", href: "/catalogo" },
  { label: "Marcas", href: "/marcas" },
  { label: "Nosotros", href: "/nosotros" },
  { label: "FAQ", href: "/faq" },
];

/**
 * Header pública Elevate.
 *
 * Diferencias respecto a la repo Vite original:
 *   - react-router-dom (Link/NavLink/useLocation) → next/link + usePathname.
 *   - El botón del carrito ahora dispara setOpen(true) del CartContext y
 *     muestra el count real (CartProvider está en publico/layout.tsx).
 */
export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { count, setOpen: openCart } = useCart();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname?.startsWith(href));

  return (
    <>
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-elegant bg-background/95 backdrop-blur-md ${
        scrolled ? "shadow-soft" : ""
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-10 flex items-center justify-between gap-2 h-16 sm:h-24 lg:h-28">
        <Logo />

        <nav className="hidden lg:flex items-center gap-8" aria-label="Principal">
          {NAV.map((n, i) => {
            const active = isActive(n.href);
            return (
              <span key={n.href} className="flex items-center gap-8">
                <Link
                  href={n.href}
                  className={`text-sm tracking-wide transition-smooth relative after:content-[''] after:absolute after:bottom-[-6px] after:left-0 after:h-px after:bg-gold after:transition-all ${
                    active
                      ? "text-primary after:w-full"
                      : "text-foreground/80 hover:text-primary after:w-0 hover:after:w-full"
                  }`}
                >
                  {n.label}
                </Link>
                {/* Lupa inmediatamente después del primer link ("Inicio"),
                    integrada visualmente con los items del navbar. */}
                {i === 0 && <SearchBox />}
              </span>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2 lg:gap-3 shrink-0">
          {/* En mobile el buscador no vive acá: se renderiza como pill
              full-width en una segunda fila bajo el header (ver más abajo).
              En desktop la lupa-ícono sigue dentro del <nav> al lado de
              "Inicio" (arriba). */}

          <Link
            href="/catalogo"
            className="hidden lg:inline-flex items-center px-6 py-3 bg-primary text-primary-foreground text-xs tracking-[0.25em] uppercase hover:bg-primary-glow transition-elegant shadow-soft border border-gold/30"
          >
            Explorar
          </Link>

          <button
            type="button"
            onClick={() => openCart(true)}
            aria-label={`Abrir carrito (${count})`}
            className="relative p-2.5 text-primary hover:text-gold transition-smooth"
          >
            <ShoppingBag size={22} />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 bg-gold text-gold-foreground text-[10px] font-medium h-5 w-5 rounded-full flex items-center justify-center">
                {count}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setOpen((s) => !s)}
            className="lg:hidden p-2 text-primary"
            aria-label="Abrir menú"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Segunda fila mobile/tablet: barra de búsqueda tipo pill, estilo
          e-commerce. Sólo visible <lg, no afecta desktop. */}
      <div className="lg:hidden border-t border-gold/15 bg-background/95">
        <div className="container mx-auto px-4 sm:px-6 py-2">
          <SearchBox variant="bar" />
        </div>
      </div>
    </header>

      {open && (
        <div className="lg:hidden fixed inset-x-0 top-[120px] sm:top-[152px] bottom-0 z-40 bg-background border-t border-gold/20 animate-fade-up overflow-y-auto">
          <nav className="flex flex-col p-6 gap-4" aria-label="Móvil">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`text-base py-3 border-b border-border/50 transition-smooth ${
                  isActive(n.href)
                    ? "text-primary"
                    : "text-foreground/85 hover:text-primary"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <Link
              href="/catalogo"
              className="mt-2 text-center px-6 py-3 bg-primary text-primary-foreground text-xs tracking-[0.25em] uppercase hover:bg-primary-glow transition-elegant shadow-soft border border-gold/30"
            >
              Explorar catálogo
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
