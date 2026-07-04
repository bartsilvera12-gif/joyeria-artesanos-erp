import Link from "next/link";
import { ChevronRight, Briefcase, Tag, Truck, MessageCircle, Sparkles, ShieldCheck } from "lucide-react";
import { WHATSAPP_NUMBER } from "@/lib/elevate-public/products-mock";

export const metadata = {
  title: "Compra mayorista · Elevate",
  description:
    "Condiciones, beneficios y forma de contacto para revendedores, perfumerías y emprendedores que compran al por mayor en Elevate.",
};

const WA_MENSAJE = encodeURIComponent(
  "Hola Elevate, me interesa la compra mayorista. ¿Me cuentan las condiciones?"
);

export default function CompraMayoristaPage() {
  const waNumber = WHATSAPP_NUMBER || "595994570003";
  const waUrl = `https://wa.me/${waNumber}?text=${WA_MENSAJE}`;

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
            <span className="text-cream/90">Compra mayorista</span>
          </nav>

          <span className="inline-block text-gold-light text-xs tracking-[0.4em] uppercase mb-4 sm:mb-6">
            Programa para revendedores
          </span>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-cream leading-[0.95] text-balance">
            Compra mayorista
          </h1>
          <div className="gold-divider w-24 sm:w-32 my-5 sm:my-8" />
          <p className="font-editorial italic text-lg sm:text-xl md:text-2xl text-cream/85 max-w-2xl leading-relaxed">
            Precios diferenciales, prioridad de stock y asesoramiento para
            perfumerías, revendedores y emprendedores del rubro.
          </p>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 mt-8 sm:mt-10 px-8 py-4 bg-gold text-gold-foreground text-xs tracking-[0.3em] uppercase hover:bg-cream hover:text-primary transition-elegant shadow-elegant"
          >
            <MessageCircle size={16} strokeWidth={1.5} />
            Consultar por WhatsApp
          </a>
        </div>
      </section>

      {/* Contenido */}
      <section className="bg-background py-12 sm:py-20 lg:py-28">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="max-w-3xl mx-auto">
            {/* Bloque destacado */}
            <div className="border border-gold/40 bg-cream/40 p-5 sm:p-8 lg:p-10 mb-8 sm:mb-12">
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center border border-gold/60 text-gold">
                  <Briefcase size={20} strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="font-display text-xl sm:text-2xl md:text-3xl text-primary leading-tight">
                    Elevá tu negocio al siguiente nivel
                  </h2>
                  <div className="gold-divider w-12 sm:w-16 my-3 sm:my-4" />
                  <div className="space-y-3 sm:space-y-4 text-foreground/80 leading-relaxed text-sm sm:text-base md:text-lg">
                    <p>
                      No pierdas la oportunidad de adquirir la mejor mercadería
                      al mejor precio para expandir tu negocio. Garantizamos la
                      responsabilidad corporativa y estamos comprometidos con
                      nuestros clientes.
                    </p>
                    <p>
                      Nos enorgullece trabajar con diversos emprendedores
                      nacionales e internacionales como tiendas minoristas,
                      mayoristas, revendedores y{" "}
                      <strong className="text-primary font-medium">
                        más de 10.000 clientes
                      </strong>{" "}
                      que nos eligieron para elevar su negocio al siguiente
                      nivel.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Beneficios */}
            <div className="space-y-6 sm:space-y-10">
              <Bloque
                icon={<Tag size={20} strokeWidth={1.5} />}
                title="Precios mayoristas"
              >
                Tarifa diferencial sobre todo el catálogo, con descuentos
                escalonados según el volumen del pedido. Pedinos la lista
                actualizada por WhatsApp.
              </Bloque>

              <Bloque
                icon={<Sparkles size={20} strokeWidth={1.5} />}
                title="Prioridad de stock"
              >
                Nuestros mayoristas tienen prioridad sobre los lanzamientos,
                lotes limitados y ediciones de tirada corta antes de que
                lleguen al público general.
              </Bloque>

              <Bloque
                icon={<ShieldCheck size={20} strokeWidth={1.5} />}
                title="Originales 100%"
              >
                Trabajamos exclusivamente con proveedores autorizados y
                maisons oficiales. Todos los perfumes incluyen empaque y sellos
                de origen. Garantía Elevate sobre cada pieza.
              </Bloque>

              <Bloque
                icon={<Truck size={20} strokeWidth={1.5} />}
                title="Envíos coordinados"
              >
                Paraguay: despacho por transportadora en el horario habitual.
                Argentina y Brasil: coordinamos el envío directamente con vos
                antes de cerrar la operación.
              </Bloque>

              <Bloque
                icon={<MessageCircle size={20} strokeWidth={1.5} />}
                title="Asesoramiento personalizado"
              >
                Te ayudamos a armar tu primera selección o renovar tu vitrina,
                recomendando casas y notas que mejor performan en tu zona y
                rango de precio.
              </Bloque>
            </div>

            {/* CTA cierre */}
            <div className="mt-10 sm:mt-16 pt-8 sm:pt-10 border-t border-border text-center">
              <p className="font-editorial italic text-base sm:text-lg text-muted-foreground">
                ¿Listo para arrancar con Elevate?
              </p>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 sm:mt-5 px-8 py-3 bg-primary text-primary-foreground text-xs tracking-[0.3em] uppercase hover:bg-primary-glow transition-elegant shadow-soft"
              >
                <MessageCircle size={14} strokeWidth={1.5} />
                Hablemos por WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Bloque({
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
