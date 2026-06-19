import Link from "next/link";
import { ChevronRight, ShieldCheck, Ban, Wallet, AlertCircle } from "lucide-react";

export const metadata = {
  title: "Política de devoluciones · Elevate",
  description:
    "Condiciones de garantía y devolución de perfumes en Elevate. Solo aplica en caso de pérdidas o frasco roto.",
};

export default function PoliticaDevolucionesPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative bg-primary text-cream pt-24 pb-12 sm:pt-36 sm:pb-24 lg:pt-44 lg:pb-32">
        <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary to-primary/95" />
        <div className="relative container mx-auto px-6 lg:px-10">
          <nav className="mb-6 sm:mb-8 text-xs tracking-[0.25em] uppercase text-cream/60">
            <Link href="/" className="hover:text-gold-light transition-smooth">
              Inicio
            </Link>
            <ChevronRight size={12} className="inline mx-2 -mt-0.5" />
            <span className="text-cream/90">Política de devoluciones</span>
          </nav>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-cream leading-[0.95] text-balance">
            Política de devoluciones
          </h1>
          <div className="gold-divider w-24 sm:w-32 my-5 sm:my-8" />
          <p className="font-editorial italic text-lg sm:text-xl md:text-2xl text-cream/85 max-w-2xl leading-relaxed">
            Los perfumes son originales. La duración, actualización de empaque,
            aroma, etc. son responsabilidades exclusivas del productor.
          </p>
        </div>
      </section>

      {/* Contenido */}
      <section className="bg-background py-12 sm:py-20 lg:py-28">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="max-w-3xl mx-auto">
            {/* Bloque destacado: garantía única */}
            <div className="border border-gold/40 bg-cream/40 p-5 sm:p-8 lg:p-10 mb-8 sm:mb-12">
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center border border-gold/60 text-gold">
                  <ShieldCheck size={20} strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="font-display text-xl sm:text-2xl md:text-3xl text-primary leading-tight">
                    Garantía única
                  </h2>
                  <div className="gold-divider w-12 sm:w-16 my-3 sm:my-4" />
                  <p className="text-foreground/80 leading-relaxed text-sm sm:text-base md:text-lg">
                    El perfume solamente tiene garantía en un caso:{" "}
                    <em>
                      &ldquo;En caso de que el perfume presente pérdidas o haya
                      llegado con el frasco roto&rdquo;
                    </em>
                    .
                  </p>
                </div>
              </div>
            </div>

            {/* Bloques temáticos */}
            <div className="space-y-6 sm:space-y-10">
              <PolicyBlock
                icon={<Ban size={20} strokeWidth={1.5} />}
                title="Productos abiertos"
              >
                No realizamos reembolso de efectivo o reversiones de pago una
                vez que el producto esté abierto.
              </PolicyBlock>

              <PolicyBlock
                icon={<AlertCircle size={20} strokeWidth={1.5} />}
                title="Devoluciones fuera de garantía"
              >
                No aceptamos devoluciones de productos que no estén sujetos a
                nuestras políticas de garantía.
              </PolicyBlock>

              <PolicyBlock
                icon={<Wallet size={20} strokeWidth={1.5} />}
                title="Producto agotado luego del pago"
              >
                Si usted ya ha abonado por el producto y este se encuentra
                agotado, en ese caso debe indicar la cuenta bancaria a la cual
                desea que se realice la devolución. Esto se realizará en un
                plazo máximo de 24 hs.
              </PolicyBlock>
            </div>

            {/* Cierre */}
            <div className="mt-10 sm:mt-16 pt-8 sm:pt-10 border-t border-border text-center">
              <p className="font-editorial italic text-base sm:text-lg text-muted-foreground">
                ¿Tenés alguna duda sobre tu pedido?
              </p>
              <Link
                href="/faq"
                className="inline-block mt-4 sm:mt-5 px-8 py-3 border border-gold/60 text-primary text-xs tracking-[0.3em] uppercase hover:bg-gold/10 transition-elegant"
              >
                Ver preguntas frecuentes
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function PolicyBlock({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 sm:gap-5 lg:gap-7">
      <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center border border-border text-gold">
        {icon}
      </div>
      <div className="flex-1 pt-1">
        <h3 className="font-display text-lg sm:text-xl md:text-2xl text-primary">{title}</h3>
        <p className="mt-2 sm:mt-3 text-foreground/80 leading-relaxed text-sm sm:text-base">
          {children}
        </p>
      </div>
    </div>
  );
}
