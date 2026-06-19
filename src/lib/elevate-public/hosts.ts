/**
 * Parser de hosts públicos de Elevate.
 *
 * Configuración por env var `ELEVATE_PUBLIC_WEB_HOSTS`, lista separada por
 * coma. Ej:
 *   ELEVATE_PUBLIC_WEB_HOSTS=www.perfumeriaelevate.com,perfumeriaelevate.com
 *
 * Si la variable no está seteada, se usa un fallback con los dominios
 * provisorios del cliente. **Debe configurarse en Hostinger hPanel** cuando
 * el cliente confirme el dominio definitivo — basta con cambiar el valor de
 * la env var, no hace falta tocar código.
 */
const DEFAULT_PUBLIC_HOSTS = [
  "www.perfumeriaelevate.com",
  "perfumeriaelevate.com",
];

export function getElevatePublicHosts(): string[] {
  const raw = (process.env.ELEVATE_PUBLIC_WEB_HOSTS ?? "").trim();
  if (!raw) return DEFAULT_PUBLIC_HOSTS;
  const list = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
  return list.length > 0 ? list : DEFAULT_PUBLIC_HOSTS;
}

/**
 * Normaliza host (strip port, lowercase) y verifica si corresponde a la web
 * pública de Elevate.
 */
export function isElevatePublicHost(rawHost: string | null | undefined): boolean {
  if (!rawHost) return false;
  const host = rawHost.toLowerCase().split(":")[0].trim();
  if (!host) return false;
  return getElevatePublicHosts().includes(host);
}

/**
 * Prefijo interno donde viven las rutas públicas (rewrite target).
 *
 * Nota: NO usar prefijo con underscore (Next.js trata `_foo` como folder
 * privado y lo excluye del routing). `publico` es un nombre normal — el
 * usuario nunca lo ve porque el middleware hace rewrite (URL en browser
 * permanece `/`, `/catalogo`, etc.).
 */
export const ELEVATE_PUBLIC_PREFIX = "/publico";

/** Header inyectado por el middleware en requests rewritteados a la web pública. */
export const ELEVATE_PUBLIC_HEADER = "x-elevate-public";
