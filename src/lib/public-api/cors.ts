/**
 * CORS para endpoints públicos del catálogo Elevate.
 *
 * Lee dominio permitido desde ELEVATE_PUBLIC_WEB_ORIGIN.
 * Sin esa env var, no se emiten headers CORS (las llamadas same-origin o
 * server-to-server siguen funcionando; el navegador desde otro dominio
 * recibirá bloqueo del browser, comportamiento por defecto seguro).
 */
export function elevatePublicCorsHeaders(): Record<string, string> {
  const origin = (process.env.ELEVATE_PUBLIC_WEB_ORIGIN ?? "").trim();
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Cache HTTP estándar para respuestas públicas del catálogo. */
export const PUBLIC_CATALOG_CACHE: Record<string, string> = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=120",
};
