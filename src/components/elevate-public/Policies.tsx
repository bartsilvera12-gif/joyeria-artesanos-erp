import Link from "next/link";
import { SectionTitle } from "./SectionTitle";

const policies = [
  {
    title: "Política de Devolución",
    items: [
      "Los perfumes son originales: duración, empaque y aroma son responsabilidad del productor.",
      "Garantía solo si el frasco llega con pérdidas o roto.",
      "No se reembolsa ni se revierten pagos una vez abierto el producto.",
      "Si pagaste y el producto está agotado, devolvemos el dinero por transferencia en máximo 24 hs.",
    ],
    link: { href: "/politica-devoluciones", label: "Ver política de devoluciones completa" } as { href: string; label: string } | null,
  },
  {
    title: "Política de Envío",
    items: [
      "Pedidos confirmados de 07:00 a 14:30 hs se preparan para envío el mismo día.",
      "Paraguay 🇵🇾: envíos por transportadora dentro del horario indicado.",
      "Argentina 🇦🇷 y Brasil 🇧🇷: coordinar el envío con el vendedor antes de confirmar la compra.",
      "No se realizan despachos los domingos ni feriados.",
    ],
    link: { href: "/politica-envios", label: "Ver política de envíos completa" },
  },
];

export function Policies() {
  return (
    <section id="politicas" className="py-12 sm:py-24 lg:py-32 bg-background">
      <div className="container mx-auto px-6 lg:px-10">
        <SectionTitle eyebrow="Políticas" title="Compra con tranquilidad" />
        <div className="mt-8 sm:mt-14 grid md:grid-cols-2 gap-5 sm:gap-8 max-w-5xl mx-auto">
          {policies.map((p) => (
            <div
              key={p.title}
              className="border border-border p-5 sm:p-8 lg:p-10 bg-cream/30 hover:border-gold transition-elegant flex flex-col"
            >
              <h3 className="font-display text-xl sm:text-2xl text-primary">{p.title}</h3>
              <div className="gold-divider w-10 sm:w-12 my-3 sm:my-5" />
              <ul className="space-y-2 sm:space-y-3 flex-1">
                {p.items.map((it, i) => (
                  <li key={i} className="flex gap-3 text-foreground/80 text-sm leading-relaxed">
                    <span className="text-gold mt-1">◆</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
              {p.link && (
                <Link
                  href={p.link.href}
                  className="mt-5 sm:mt-6 inline-block text-xs tracking-[0.3em] uppercase text-gold hover:text-primary transition-smooth"
                >
                  {p.link.label} →
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
