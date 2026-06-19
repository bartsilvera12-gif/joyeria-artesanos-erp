import Link from "next/link";
import { SectionTitle } from "./SectionTitle";
import type { MarcaWeb } from "@/lib/elevate-public/catalog-fetch";

/**
 * Grilla de marcas reales (Fase Marcas). Las filas vienen desde la DB vía
 * `/api/public/elevate/marcas`. Cada card linkea al catálogo filtrado por
 * `?marca=<slug>` para que el cliente vea solo productos de esa marca.
 *
 * Si hay `logo_url`, se muestra; si no, se usa la letra inicial en gris
 * tipográfico como antes (consistente con el diseño premium previo).
 *
 * Reemplaza el listado hardcodeado anterior (que era de categorías, no de
 * marcas).
 */
export function Brands({ marcas }: { marcas: MarcaWeb[] }) {
  return (
    <section id="marcas" className="py-12 sm:py-24 lg:py-32 bg-background">
      <div className="container mx-auto px-6 lg:px-10">
        <SectionTitle
          eyebrow="Marcas"
          title="Marcas que ofrecemos"
          subtitle="Casas perfumistas seleccionadas. Tocá una marca para ver sus fragancias."
        />
        {marcas.length === 0 ? (
          <p className="mt-8 sm:mt-12 text-center text-sm text-muted-foreground italic font-editorial">
            Próximamente vamos a sumar más marcas a nuestra curaduría.
          </p>
        ) : (
          <div className="mt-8 sm:mt-14 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {marcas.map((m) => {
              const href = m.slug ? `/catalogo?marca=${encodeURIComponent(m.slug)}` : "/catalogo";
              return (
                <Link
                  key={m.id}
                  href={href}
                  className="group relative overflow-hidden border border-border/60 hover:border-gold transition-elegant aspect-[3/4] flex flex-col justify-end p-4 sm:p-8 bg-cream/40 hover:shadow-elegant"
                  aria-label={`Ver productos de ${m.nombre}`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-gold/10 group-hover:from-primary/15 transition-elegant" />
                  {m.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.logo_url}
                      alt={`Logo ${m.nombre}`}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-h-24 max-w-[60%] object-contain opacity-80 group-hover:opacity-100 transition-elegant"
                    />
                  ) : (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-5xl text-primary/10 group-hover:text-primary/20 transition-elegant">
                      {m.nombre.charAt(0)}
                    </div>
                  )}
                  <div className="relative">
                    <h3 className="font-display text-lg sm:text-2xl text-primary">{m.nombre}</h3>
                    <div className="gold-divider w-8 sm:w-12 my-2 sm:my-3" />
                    {m.descripcion && (
                      <p className="text-xs sm:text-sm text-muted-foreground font-editorial italic">
                        {m.descripcion}
                      </p>
                    )}
                    <span className="mt-2 sm:mt-3 inline-block text-[10px] tracking-[0.3em] uppercase text-gold opacity-0 group-hover:opacity-100 transition-elegant">
                      Ver productos →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
