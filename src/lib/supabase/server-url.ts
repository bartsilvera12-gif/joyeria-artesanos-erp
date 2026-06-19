/**
 * Resolución de la URL de Supabase para el código SERVER-side.
 *
 * - Browser (cliente): siempre usa `NEXT_PUBLIC_SUPABASE_URL` (la URL pública).
 * - Server (route handlers, server components, RSC, middleware Node): si la
 *   variable `SUPABASE_INTERNAL_URL` está definida la usa, sino cae a
 *   `NEXT_PUBLIC_SUPABASE_URL`.
 *
 * Caso de uso: el ERP está co-hospedado en la misma VPS donde corre Supabase
 * self-hosted (Kong en `http://localhost:8000`). El server resuelve queries por
 * loopback (latencia ≈ 0ms) mientras el browser sigue usando el dominio
 * público (https://api.neura.com.py) con TLS.
 *
 * El cliente browser NUNCA debe ver `SUPABASE_INTERNAL_URL` — por eso esta
 * variable NO lleva prefijo `NEXT_PUBLIC_`.
 */
export function getSupabaseServerUrl(): string {
  const internal = process.env.SUPABASE_INTERNAL_URL?.trim();
  if (internal) return internal;
  const pub = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (pub) return pub;
  throw new Error(
    "Falta NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_INTERNAL_URL para server-side)"
  );
}

/** URL pública para emitir al browser (`NEXT_PUBLIC_SUPABASE_URL` sin fallback interno). */
export function getSupabasePublicUrl(): string {
  const pub = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!pub) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL");
  return pub;
}
