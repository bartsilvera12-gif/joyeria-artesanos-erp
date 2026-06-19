import Link from "next/link";
import { Instagram, Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "./Logo";
import { WHATSAPP_NUMBER } from "@/lib/elevate-public/products-mock";

/**
 * Footer público Elevate.
 *
 * El número que se muestra como teléfono viene de
 * `NEXT_PUBLIC_ELEVATE_WHATSAPP_NUMBER`. Si no está configurada (string
 * vacío), el item de Phone no se renderiza para no mostrar un link roto.
 */
const EMAIL = "elevategroup023@gmail.com";
const INSTAGRAM_URL = "https://www.instagram.com/elevate_import_export?utm_source=qr";
const INSTAGRAM_HANDLE = "@elevate_import_export";
const ADDRESS = "Ciudad del Este - Paraguay";

function formatTel(num: string) {
  // Heurística mínima de formateo. Si no entra, mostrar tal cual.
  if (!num) return "";
  if (num.length < 10) return `+${num}`;
  return `+${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6, 9)}-${num.slice(9)}`;
}

export function Footer() {
  // Firma legal fija "© 2026 Elevate import Export" (sin year dinámico,
  // según directiva del cliente).
  const telDisplay = WHATSAPP_NUMBER ? formatTel(WHATSAPP_NUMBER) : "";
  return (
    <footer className="bg-primary text-cream pt-20 pb-8">
      <div className="container mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-4 gap-12 pb-12 border-b border-gold/20">
          <div className="md:col-span-2 flex justify-center md:justify-start">
            {/* Wrapper de ancho compartido para que el logo y el párrafo
                arranquen exactamente en el mismo x — sin esto, cada uno se
                centra solo en su columna y sus bordes izquierdos quedan
                desalineados. */}
            <div className="w-full max-w-md">
              <Logo variant="light" size="lg" />
              <p className="mt-6 text-cream/80 leading-relaxed font-editorial italic text-xl">
                La esencia de tu próximo negocio. Fragancias seleccionadas para quienes buscan elegancia,
                presencia y exclusividad.
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-sm tracking-[0.3em] uppercase text-gold-light mb-5">Navegación</h4>
            <ul className="space-y-3 text-base text-cream/85">
              <li><Link href="/catalogo" className="hover:text-gold-light transition-smooth">Catálogo</Link></li>
              <li><Link href="/marcas" className="hover:text-gold-light transition-smooth">Marcas</Link></li>
              <li><Link href="/nosotros" className="hover:text-gold-light transition-smooth">Quiénes somos</Link></li>
              <li><Link href="/faq" className="hover:text-gold-light transition-smooth">FAQ y Políticas</Link></li>
              <li><Link href="/politica-envios" className="hover:text-gold-light transition-smooth">Política de envíos</Link></li>
              <li><Link href="/politica-devoluciones" className="hover:text-gold-light transition-smooth">Política de devoluciones</Link></li>
              <li><Link href="/privacidad" className="hover:text-gold-light transition-smooth">Política de privacidad</Link></li>
              <li><Link href="/compra-mayorista" className="hover:text-gold-light transition-smooth">Compra mayorista</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm tracking-[0.3em] uppercase text-gold-light mb-5">Contacto</h4>
            <ul className="space-y-3 text-base text-cream/85">
              {WHATSAPP_NUMBER ? (
                <li className="flex items-start gap-3">
                  <Phone size={16} className="text-gold mt-1 shrink-0" />
                  <a
                    href={`tel:+${WHATSAPP_NUMBER}`}
                    className="hover:text-gold-light transition-smooth"
                  >
                    {telDisplay}
                  </a>
                </li>
              ) : null}
              <li className="flex items-start gap-3">
                <Mail size={16} className="text-gold mt-1 shrink-0" />
                <a href={`mailto:${EMAIL}`} className="hover:text-gold-light transition-smooth">
                  {EMAIL}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin size={16} className="text-gold mt-1 shrink-0" />
                <span>{ADDRESS}</span>
              </li>
              <li className="flex items-start gap-3">
                <Instagram size={16} className="text-gold mt-1 shrink-0" />
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gold-light transition-smooth"
                >
                  {INSTAGRAM_HANDLE}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col md:flex-row justify-between gap-4 text-sm text-cream/65 tracking-wide">
          <div>© 2026 Elevate import Export</div>
          <div className="font-editorial italic">Elegancia en cada nota.</div>
        </div>
      </div>
    </footer>
  );
}
