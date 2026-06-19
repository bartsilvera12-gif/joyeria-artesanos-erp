/**
 * Configuración WhatsApp para la web pública de Elevate.
 *
 * Source of truth (orden de preferencia):
 *   1. `ELEVATE_WHATSAPP_NUMBER`             — server-only (no inlined al bundle)
 *   2. `NEXT_PUBLIC_ELEVATE_WHATSAPP_NUMBER` — accesible client-side (inlined al build)
 *
 * Comportamiento isomórfico:
 *   - En server components / API routes: lee la 1 (preferida) o la 2 como
 *     fallback. Si ambas existen, gana la 1.
 *   - En client components (browser): solo está disponible la 2 (Next.js
 *     inlinea las NEXT_PUBLIC_* en build time). Por eso, si querés que el
 *     botón WhatsApp del browser funcione, hay que definir la 2.
 *
 * Recomendación operativa (Coolify env):
 *   * Setear `NEXT_PUBLIC_ELEVATE_WHATSAPP_NUMBER=595981234567`
 *     (el número no es secreto — es para que clientes te escriban).
 *   * Opcionalmente también `ELEVATE_WHATSAPP_NUMBER` con el mismo valor para
 *     consistencia server-only en endpoints internos.
 *
 * Si la env no está configurada, los componentes ocultan / deshabilitan los
 * CTAs de WhatsApp. NUNCA hardcodear un número fallback (sería el número
 * equivocado para el cliente, como pasó con el legacy `5491100000000`).
 *
 * Formato esperado: dígitos, incluyendo código de país. Ej: 595981234567.
 * Si llega con `+`, espacios o guiones, se sanitiza acá. wa.me solo acepta
 * dígitos sin `+`.
 */

function sanitizeNumber(raw: string): string {
  // Conserva solo dígitos. Strip espacios, +, guiones, paréntesis, etc.
  return raw.replace(/\D/g, "");
}

/** Lee el número desde env (server-only o NEXT_PUBLIC_). Null si no existe. */
export function getElevateWhatsappNumber(): string | null {
  const fromServer = process.env.ELEVATE_WHATSAPP_NUMBER?.trim();
  const fromClient = process.env.NEXT_PUBLIC_ELEVATE_WHATSAPP_NUMBER?.trim();
  const raw = fromServer && fromServer.length > 0 ? fromServer : fromClient;
  if (!raw) return null;
  const clean = sanitizeNumber(raw);
  if (clean.length < 8) return null; // demasiado corto, asumir mal configurado
  return clean;
}

/**
 * Arma el link wa.me con mensaje pre-llenado para consulta de un producto.
 * Si el number es null/inválido, devuelve null (los components deben ocultar).
 */
export function buildProductWhatsappLink(input: {
  number: string | null;
  productName: string;
  sku?: string | null;
  productUrl?: string | null;
}): string | null {
  if (!input.number) return null;
  const num = sanitizeNumber(input.number);
  if (num.length < 8) return null;
  const lines: string[] = [
    "Hola, quiero consultar por este perfume:",
    input.productName,
  ];
  if (input.sku && input.sku.trim().length > 0) {
    lines.push(`SKU: ${input.sku}`);
  }
  if (input.productUrl && input.productUrl.trim().length > 0) {
    lines.push(`Link: ${input.productUrl}`);
  }
  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${num}?text=${text}`;
}

/** Link genérico (sin producto) para el botón flotante. */
export function buildGenericWhatsappLink(number: string | null): string | null {
  if (!number) return null;
  const num = sanitizeNumber(number);
  if (num.length < 8) return null;
  const text = encodeURIComponent("Hola Elevate ✨ Quisiera consultar por una fragancia.");
  return `https://wa.me/${num}?text=${text}`;
}
