import Link from "next/link";
import {
  ChevronRight,
  ShieldCheck,
  Building2,
  Database,
  Target,
  Share2,
  Clock,
  UserCheck,
  Cookie,
  Lock,
  RefreshCw,
  Mail,
} from "lucide-react";
import { WHATSAPP_NUMBER } from "@/lib/elevate-public/products-mock";

export const metadata = {
  title: "Política de privacidad · Elevate",
  description:
    "Cómo Elevate Import Export trata los datos personales de sus clientes. Responsable, finalidades, derechos del titular y contacto.",
};

/**
 * Política de Privacidad — plantilla estándar Neura.
 *
 * Diseñada para ser reutilizable en cualquier sitio cliente desarrollado por
 * Neura. Para reusar:
 *   1. Reemplazar los valores de `EMPRESA` por los del cliente.
 *   2. Mantener la atribución a Neura como encargado técnico / proveedor
 *      tecnológico (NO dueño de los datos).
 *   3. El responsable de los datos siempre es el cliente, no Neura.
 *
 * Ruta: /privacidad (vía rewrite del middleware sobre /publico/privacidad).
 * Hay un redirect 308 desde /politica-privacidad para no romper links viejos.
 */
const EMPRESA = {
  nombre: "Elevate Import Export",
  email: "elevategroup023@gmail.com",
  telefono: WHATSAPP_NUMBER || "595994570003",
  direccion: "Ciudad del Este, Paraguay",
} as const;

const FECHA_VIGENCIA = "17 de junio de 2026";

export default function PrivacidadPage() {
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
            <span className="text-cream/90">Política de privacidad</span>
          </nav>

          <span className="inline-block text-gold-light text-xs tracking-[0.4em] uppercase mb-4 sm:mb-6">
            Protección de datos personales
          </span>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-cream leading-[0.95] text-balance">
            Política de privacidad
          </h1>
          <div className="gold-divider w-24 sm:w-32 my-5 sm:my-8" />
          <p className="font-editorial italic text-lg sm:text-xl md:text-2xl text-cream/85 max-w-2xl leading-relaxed">
            Cómo {EMPRESA.nombre} recolecta, trata y protege la información
            personal de sus clientes y visitantes.
          </p>
          <p className="mt-4 sm:mt-6 text-xs tracking-[0.25em] uppercase text-cream/60">
            Vigente desde el {FECHA_VIGENCIA}
          </p>
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
                  <ShieldCheck size={20} strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="font-display text-xl sm:text-2xl md:text-3xl text-primary leading-tight">
                    Tus datos están protegidos
                  </h2>
                  <div className="gold-divider w-12 sm:w-16 my-3 sm:my-4" />
                  <p className="text-foreground/80 leading-relaxed text-sm sm:text-base md:text-lg">
                    En {EMPRESA.nombre} tratamos tus datos personales con la
                    confidencialidad y el cuidado que merecen. Esta política
                    explica qué información recolectamos, para qué la usamos y
                    qué derechos tenés sobre ella.
                  </p>
                </div>
              </div>
            </div>

            {/* Secciones */}
            <div className="space-y-6 sm:space-y-10">
              <Seccion
                icon={<Building2 size={20} strokeWidth={1.5} />}
                title="1. Responsable del tratamiento"
              >
                <p>
                  El responsable del tratamiento de tus datos personales es{" "}
                  <strong className="text-primary font-medium">
                    {EMPRESA.nombre}
                  </strong>
                  , con domicilio en {EMPRESA.direccion}. Para cualquier consulta
                  relativa a esta política podés escribir a{" "}
                  <a
                    href={`mailto:${EMPRESA.email}`}
                    className="text-gold hover:text-primary transition-smooth"
                  >
                    {EMPRESA.email}
                  </a>
                  .
                </p>
                <p className="mt-3">
                  El desarrollo técnico, hosting y mantenimiento del sitio es
                  prestado por <strong className="text-primary font-medium">Neura</strong>{" "}
                  como proveedor tecnológico y encargado técnico del tratamiento.
                  Neura no es titular ni dueño de los datos: solo los procesa
                  por cuenta y bajo instrucción de {EMPRESA.nombre}.
                </p>
              </Seccion>

              <Seccion
                icon={<Database size={20} strokeWidth={1.5} />}
                title="2. Datos que recolectamos"
              >
                <p>Recolectamos únicamente la información necesaria para gestionar tu pedido:</p>
                <ul className="mt-3 space-y-2 list-none">
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Datos de identificación: nombre completo.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Datos de contacto: email, teléfono / WhatsApp.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Datos de envío: dirección, ciudad, código postal.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Datos del pedido: productos seleccionados, cantidades y notas.</span></li>
                </ul>
                <p className="mt-3">
                  <strong className="text-primary font-medium">
                    No almacenamos datos sensibles de tarjetas de crédito o
                    débito.
                  </strong>{" "}
                  Los pagos electrónicos se procesan a través de pasarelas de
                  pago externas certificadas.
                </p>
              </Seccion>

              <Seccion
                icon={<Target size={20} strokeWidth={1.5} />}
                title="3. Para qué los usamos"
              >
                <ul className="space-y-2 list-none">
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Confirmar tu pedido y coordinar la entrega.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Comunicarnos por WhatsApp o email para informarte el estado de tu compra.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Emitir el comprobante fiscal correspondiente.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Cumplir con obligaciones contables y tributarias.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Mejorar nuestro catálogo y servicio en base a estadísticas anónimas de uso.</span></li>
                </ul>
              </Seccion>

              <Seccion
                icon={<Share2 size={20} strokeWidth={1.5} />}
                title="4. Con quién los compartimos"
              >
                <p>Solo compartimos tus datos con terceros estrictamente necesarios para cumplir el servicio:</p>
                <ul className="mt-3 space-y-2 list-none">
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Empresas de transporte y logística, para entregar tu pedido.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Pasarelas de pago certificadas, para procesar la operación.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span>Proveedor tecnológico (Neura), como encargado técnico del tratamiento, sujeto a confidencialidad.</span></li>
                </ul>
                <p className="mt-3">
                  No vendemos, alquilamos ni cedemos tus datos a terceros con
                  fines comerciales o publicitarios.
                </p>
              </Seccion>

              <Seccion
                icon={<Clock size={20} strokeWidth={1.5} />}
                title="5. Cuánto tiempo los conservamos"
              >
                <p>
                  Conservamos tus datos personales mientras dure la relación
                  comercial y por los plazos adicionales que exija la normativa
                  fiscal y contable aplicable. Pasado ese plazo, los datos son
                  bloqueados o eliminados de forma segura.
                </p>
              </Seccion>

              <Seccion
                icon={<UserCheck size={20} strokeWidth={1.5} />}
                title="6. Tus derechos"
              >
                <p>
                  Como titular de los datos, podés ejercer en cualquier momento
                  los siguientes derechos:
                </p>
                <ul className="mt-3 space-y-2 list-none">
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span><strong className="text-primary font-medium">Acceso:</strong> saber qué datos tuyos tenemos.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span><strong className="text-primary font-medium">Rectificación:</strong> corregir información inexacta o desactualizada.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span><strong className="text-primary font-medium">Cancelación:</strong> solicitar la eliminación de tus datos.</span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span><strong className="text-primary font-medium">Oposición:</strong> oponerte al tratamiento para fines específicos.</span></li>
                </ul>
                <p className="mt-3">
                  Para ejercerlos, escribinos a{" "}
                  <a
                    href={`mailto:${EMPRESA.email}`}
                    className="text-gold hover:text-primary transition-smooth"
                  >
                    {EMPRESA.email}
                  </a>{" "}
                  con copia de un documento de identidad. Respondemos en un plazo
                  máximo de 10 días hábiles.
                </p>
              </Seccion>

              <Seccion
                icon={<Cookie size={20} strokeWidth={1.5} />}
                title="7. Cookies y analítica"
              >
                <p>
                  Usamos cookies técnicas necesarias para que el sitio funcione
                  (carrito de compras, sesión) y herramientas de analítica
                  agregada y anónima para entender cómo se usa el sitio. No
                  usamos cookies de seguimiento publicitario de terceros.
                </p>
              </Seccion>

              <Seccion
                icon={<Lock size={20} strokeWidth={1.5} />}
                title="8. Seguridad"
              >
                <p>
                  El sitio se sirve cifrado por HTTPS. Implementamos medidas
                  técnicas y organizativas razonables para proteger tus datos
                  contra accesos no autorizados, alteración o pérdida. Ningún
                  sistema en internet es 100 % invulnerable, pero trabajamos
                  para minimizar el riesgo.
                </p>
              </Seccion>

              <Seccion
                icon={<RefreshCw size={20} strokeWidth={1.5} />}
                title="9. Cambios a esta política"
              >
                <p>
                  Podemos actualizar esta política cuando cambien nuestras
                  prácticas o lo exija la normativa. La fecha de vigencia
                  arriba indica la última versión. Te recomendamos revisar esta
                  página periódicamente.
                </p>
              </Seccion>

              <Seccion
                icon={<Mail size={20} strokeWidth={1.5} />}
                title="10. Contacto"
              >
                <p>
                  Para cualquier consulta, queja o solicitud relacionada con
                  esta política:
                </p>
                <ul className="mt-3 space-y-2 list-none">
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span><strong className="text-primary font-medium">Email:</strong>{" "}<a href={`mailto:${EMPRESA.email}`} className="text-gold hover:text-primary transition-smooth">{EMPRESA.email}</a></span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span><strong className="text-primary font-medium">WhatsApp:</strong>{" "}<a href={`https://wa.me/${EMPRESA.telefono}`} target="_blank" rel="noopener noreferrer" className="text-gold hover:text-primary transition-smooth">+{EMPRESA.telefono}</a></span></li>
                  <li className="flex gap-3"><span className="text-gold mt-1">◆</span><span><strong className="text-primary font-medium">Dirección:</strong> {EMPRESA.direccion}</span></li>
                </ul>
              </Seccion>
            </div>

            {/* Cierre */}
            <div className="mt-10 sm:mt-16 pt-8 sm:pt-10 border-t border-border text-center">
              <p className="font-editorial italic text-base sm:text-lg text-muted-foreground">
                ¿Alguna pregunta sobre el tratamiento de tus datos?
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

function Seccion({
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
        <div className="mt-2 sm:mt-3 text-foreground/80 leading-relaxed text-sm sm:text-base space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}
