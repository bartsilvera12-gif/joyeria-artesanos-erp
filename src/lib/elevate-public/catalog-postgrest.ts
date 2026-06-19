/**
 * Cliente PostgREST mínimo para los endpoints públicos del catálogo Elevate.
 *
 * Llama por HTTPS al PostgREST de Supabase self-hosted usando
 * `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` con
 * `Accept-Profile: elevate`.
 *
 * Preferencia: ANON. Si PostgREST rechaza con 401/403 (anon sin GRANT SELECT
 * en `elevate.*`), fallback a SUPABASE_SERVICE_ROLE_KEY — server-side, nunca
 * expuesto al cliente. El whitelist de columnas + filtros se aplica vía
 * query params PostgREST (`?select=...&activo=eq.true&visible_web=eq.true`).
 *
 * Seguridad: el caller arma el `select` string. NUNCA `select=*`. Stock
 * exacto, costo_promedio, proveedor_principal_id, etc. NO se piden.
 */
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";

export type CatalogPostgrestError = {
  status: number;
  message: string;
};

export type CatalogPostgrestResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; error: CatalogPostgrestError };

function buildHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Accept-Profile": SUPABASE_APP_SCHEMA,
    Accept: "application/json",
  };
}

/**
 * Ejecuta GET PostgREST. Devuelve filas tipadas o error estructurado.
 *
 * @param resource ruta relativa a `/rest/v1/`, p.ej. `productos`
 * @param queryString PostgREST query (sin `?`), p.ej. `select=id,nombre&activo=eq.true`
 */
export async function postgrestGet<T>(
  resource: string,
  queryString: string
): Promise<CatalogPostgrestResult<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return {
      ok: false,
      error: { status: 500, message: "Faltan envs públicas Supabase" },
    };
  }

  const full = `${url}/rest/v1/${resource}?${queryString}`;

  // 1) ANON
  const rAnon = await fetch(full, {
    headers: buildHeaders(anon),
    cache: "no-store",
  });
  if (rAnon.ok) {
    const rows = (await rAnon.json()) as T[];
    return { ok: true, rows };
  }
  if (rAnon.status !== 401 && rAnon.status !== 403) {
    const text = (await rAnon.text()).slice(0, 300);
    return { ok: false, error: { status: rAnon.status, message: text } };
  }

  // 2) Fallback service_role (server-side, nunca expuesto al cliente).
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!sr) {
    return {
      ok: false,
      error: {
        status: rAnon.status,
        message: "PostgREST rechazó anon y no hay service role fallback configurado",
      },
    };
  }
  const rSr = await fetch(full, {
    headers: buildHeaders(sr),
    cache: "no-store",
  });
  if (rSr.ok) {
    const rows = (await rSr.json()) as T[];
    return { ok: true, rows };
  }
  const text = (await rSr.text()).slice(0, 300);
  return { ok: false, error: { status: rSr.status, message: text } };
}
