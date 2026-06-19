import Link from "next/link";
import { ChevronRight, Clock, Truck, Globe, CalendarOff, AlertCircle } from "lucide-react";

export const metadata = {
  title: "Política de envíos · Elevate",
  description:
    "Cómo, cuándo y a dónde despachamos los pedidos confirmados en Elevate Perfumería.",
};

export default function PoliticaEnviosPage() {
  return (
    <>
      {/* Hero oscuro */}
      <section className="relative bg-primary text-cream pt-24 pb-12 sm:pt-36 sm:pb-24 lg:pt-44 lg:pb-32">
        <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary to-primary/95" />
        <div className="relative container mx-auto px-6 lg:px-10">
          <nav className="mb-6 sm:mb-8 text-xs tracking-[0.25em] uppercase text-cream/60">
            <Link href="/" className="hover:text-gold-light transition-smooth">
              Inicio
            </Link>
            <ChevronRight size={12} className="inline mx-2 -mt-0.5" />
            <span className="text-cream/90">Política de envíos</span>
          </nav>

          <span className="inline-block text-gold-light text-xs tracking-[0.4em] uppercase mb-4 sm:mb-6">
            Información de envío
          </span>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-cream leading-[0.95] text-balance">
            Política de envíos
          </h1>
          <div className="gold-divider w-24 sm:w-32 my-5 sm:my-8" />
          <p className="font-editorial italic text-lg sm:text-xl md:text-2xl text-cream/85 max-w-2xl leading-relaxed">
            Cómo y cuándo despachamos tus fragancias después de confirmar el pedido.
          </p>
        </div>
      </section>

      {/* Contenido */}
      <section className="bg-background py-12 sm:py-20 lg:py-28">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="max-w-3xl mx-auto">
            {/* Bloque destacado: horario */}
            <div className="border border-gold/40 bg-cream/40 p-5 sm:p-8 lg:p-10 mb-8 sm:mb-12">
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center border border-gold/60 text-gold">
                  <Clock size={20} strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="font-display text-xl sm:text-2xl md:text-3xl text-primary leading-tight">
                    Pedidos confirmados de 07:00 a 14:30 hs
                  </h2>
                  <div className="gold-divider w-12 sm:w-16 my-3 sm:my-4" />
                  <p className="text-foreground/80 leading-relaxed text-sm sm:text-base md:text-lg">
                    Se preparan para envío en el mismo día a través de transportadora,
                    sujeto a disponibilidad de inventario y confirmación de pago.
                  </p>
                </div>
              </div>
            </div>

            {/* Bloques temáticos */}
            <div className="space-y-6 sm:space-y-10">
              <PolicyBlock
                icon={<Truck size={20} strokeWidth={1.5} />}
                title="Paraguay 🇵🇾"
              >
                Envíos por transportadora dentro del horario indicado.
              </PolicyBlock>

              <PolicyBlock
                icon={<Globe size={20} strokeWidth={1.5} />}
                title="Argentina 🇦🇷 y Brasil 🇧🇷"
              >
                Coordinar el envío directamente con el vendedor antes de
                confirmar la compra.
              </PolicyBlock>

              <PolicyBlock
                icon={<CalendarOff size={20} strokeWidth={1.5} />}
                title="Domingos y feriados"
              >
                No se realizan despachos los domingos ni feriados.
              </PolicyBlock>

              <PolicyBlock
                icon={<AlertCircle size={20} strokeWidth={1.5} />}
                title="Fechas de alta demanda"
              >
                En fechas de alta demanda, los envíos pueden tener demoras
                adicionales.
              </PolicyBlock>
            </div>

            {/* Cierre */}
            <div className="mt-10 sm:mt-16 pt-8 sm:pt-10 border-t border-border text-center">
              <p className="font-editorial italic text-base sm:text-lg text-muted-foreground">
                ¿Tenés alguna duda sobre tu envío?
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
