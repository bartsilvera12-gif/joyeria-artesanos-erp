"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SectionTitle } from "./SectionTitle";

const faqs = [
  { q: "¿Los perfumes son originales?", a: "Sí. Trabajamos exclusivamente con productos originales, importados directamente de proveedores autorizados y maisons oficiales. Cada pieza incluye su empaque y sellos de origen." },
  { q: "¿Realizan envíos a todo el país?", a: "Sí, enviamos a todo el territorio nacional mediante operadores logísticos premium con seguimiento. CABA y GBA cuentan con envío express." },
  { q: "¿Puedo consultar disponibilidad antes de comprar?", a: "Por supuesto. Podés consultarnos por WhatsApp y te respondemos en el día con stock, presentaciones disponibles y asesoramiento personalizado." },
  { q: "¿Tienen perfumes nicho y ultranicho?", a: "Sí. Es nuestra especialidad. Contamos con casas niche reconocidas y ediciones ultranicho de tirada limitada." },
  { q: "¿Qué métodos de pago aceptan?", a: "Aceptamos transferencia bancaria y tarjetas de crédito/débito." },
  { q: "¿Hacen devoluciones?", a: "No realizamos devoluciones generales. Los perfumes son originales y su duración, empaque y aroma son responsabilidad del productor. Solo aplica garantía si el frasco llega con pérdidas o roto. No se reembolsa una vez abierto el producto. Si pagaste y el producto está agotado, devolvemos el dinero por transferencia en máximo 24 hs." },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-12 sm:py-24 lg:py-32 bg-cream/30">
      <div className="container mx-auto px-6 lg:px-10">
        <SectionTitle eyebrow="FAQ" title="Preguntas frecuentes" />
        <div className="mt-8 sm:mt-14 max-w-3xl mx-auto divide-y divide-border border-y border-border bg-background">
          {faqs.map((f, i) => (
            <div key={i}>
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between text-left p-4 sm:p-6 lg:p-7 hover:bg-cream/40 transition-smooth"
                aria-expanded={open === i}
              >
                <span className="font-display text-base sm:text-lg md:text-xl text-primary pr-4 sm:pr-6">{f.q}</span>
                <ChevronDown
                  className={`shrink-0 text-gold transition-transform ${open === i ? "rotate-180" : ""}`}
                  size={20}
                />
              </button>
              {open === i && (
                <div className="px-4 sm:px-6 lg:px-7 pb-5 sm:pb-7 text-sm sm:text-base text-foreground/75 leading-relaxed animate-fade-up">
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
