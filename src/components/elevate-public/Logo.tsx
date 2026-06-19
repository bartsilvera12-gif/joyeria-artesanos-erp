import Image from "next/image";
import Link from "next/link";

/**
 * Logo Elevate. Variante `dark` para fondo claro (default), `light` para
 * fondo bordeaux. Asset en `public/brand/elevate/elevate-logo-gold.png`.
 */
export function Logo({
  variant = "dark",
  size = "md",
}: {
  variant?: "dark" | "light";
  /** "md" para header (default); "lg" para footer (más presencia visual). */
  size?: "md" | "lg";
}) {
  const isLg = size === "lg";
  // El PNG del logo tiene whitespace interno a la izquierda (la botellita
  // está dibujada sin tocar el borde). Para que el contenido visual del
  // logo arranque en el mismo eje que el texto que viene debajo (cuando
  // se usa size="lg" en el footer), compensamos con un margen negativo.
  const imgClass = isLg
    ? "h-28 w-28 md:h-36 md:w-36 object-contain -ml-3 md:-ml-4"
    : "h-9 w-9 sm:h-16 sm:w-16 md:h-24 md:w-24 object-contain shrink-0";
  const titleClass = isLg
    ? "font-display text-3xl md:text-4xl tracking-[0.18em]"
    : "font-display text-base sm:text-xl md:text-2xl tracking-[0.18em]";
  // En mobile el tagline se oculta para liberar altura del header; vuelve
  // desde sm (tablet) en adelante. En lg (desktop) nunca cambia.
  const tagClass = isLg
    ? "text-xs md:text-sm tracking-[0.3em] mt-1"
    : "hidden sm:block text-[10px] tracking-[0.3em] mt-1";
  return (
    <Link href="/" className="flex items-center gap-2 sm:gap-3 group min-w-0" aria-label="Elevate inicio">
      <Image
        src="/brand/elevate/elevate-logo-gold.png"
        alt="Elevate logo"
        width={isLg ? 144 : 96}
        height={isLg ? 144 : 96}
        className={imgClass}
        priority
      />
      <div className="leading-none">
        <div
          className={`${titleClass} ${
            variant === "light" ? "text-cream" : "text-primary"
          }`}
        >
          ELEVATE
        </div>
        <div
          className={`${tagClass} ${
            variant === "light" ? "text-gold-light" : "text-gold"
          }`}
        >
          La esencia de tu próximo negocio
        </div>
      </div>
    </Link>
  );
}
