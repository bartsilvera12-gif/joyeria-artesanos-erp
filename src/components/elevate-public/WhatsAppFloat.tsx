"use client";

import { MessageCircle } from "lucide-react";
import {
  buildGenericWhatsappLink,
  getElevateWhatsappNumber,
} from "@/lib/elevate-public/whatsapp";

/**
 * Botón flotante WhatsApp (consulta genérica). Si no hay
 * NEXT_PUBLIC_ELEVATE_WHATSAPP_NUMBER configurado, no se renderiza —
 * preferimos invisible a un link roto.
 */
export function WhatsAppFloat() {
  const number = getElevateWhatsappNumber();
  const href = buildGenericWhatsappLink(number);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Consultas al WhatsApp"
      className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2"
    >
      {/* Mobile: label compacto encima del botón. Desktop (sm+): label normal. */}
      <span className="sm:hidden bg-primary/95 text-cream text-[10px] tracking-wider uppercase px-2.5 py-1 whitespace-nowrap shadow-soft pointer-events-none">
        Consultas al WhatsApp
      </span>
      <span className="hidden sm:inline-block bg-primary text-cream text-xs tracking-widest uppercase px-4 py-2 whitespace-nowrap shadow-soft pointer-events-none">
        Consultas al WhatsApp
      </span>
      <span className="relative h-14 w-14">
        <span className="absolute inset-0 bg-gold/40 rounded-full animate-ping opacity-50" />
        <span className="relative bg-gold text-gold-foreground h-14 w-14 rounded-full flex items-center justify-center shadow-gold hover:bg-primary hover:text-primary-foreground transition-elegant">
          <MessageCircle size={24} />
        </span>
      </span>
    </a>
  );
}
