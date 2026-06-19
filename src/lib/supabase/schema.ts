import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Esquema Postgres único de esta instancia (monocliente Elevate).
 *
 * Se lee de NEURA_CLIENT_SCHEMA. Si no está definida, default 'elevate'.
 * Requiere en Supabase: Settings → API → "Exposed schemas" incluir ese schema.
 */
const RAW_NEURA_CLIENT_SCHEMA =
  typeof process !== "undefined" ? process.env.NEURA_CLIENT_SCHEMA?.trim() : "";
export const SUPABASE_APP_SCHEMA =
  RAW_NEURA_CLIENT_SCHEMA && RAW_NEURA_CLIENT_SCHEMA.length > 0
    ? RAW_NEURA_CLIENT_SCHEMA
    : "elevate";

/**
 * Resolución de schema para tablas de negocio.
 *
 * En instancia monocliente Elevate, SIEMPRE devuelve SUPABASE_APP_SCHEMA.
 * El parámetro `dataSchema` (legacy) se ignora — se conserva la firma para
 * no romper callsites mientras se completa la migración.
 */
export function resolveEmpresaDataSchema(_dataSchema?: string | null): string {
  return SUPABASE_APP_SCHEMA;
}

/**
 * Cliente Supabase con cualquier esquema PostgREST (`zentra_erp`, `erp_*`, etc.).
 * Con @supabase/supabase-js ≥2.99 los genéricos de `SupabaseClient` son varios y condicionales;
 * acotar alguno a `string` o `"public"` rompe la asignación entre instancias (p. ej. Vercel TS).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppSupabaseClient = SupabaseClient<any, any, any, any, any>;

export const supabaseDbSchemaOption = {
  db: { schema: SUPABASE_APP_SCHEMA },
} as const;

/** Cliente service role estándar (API routes, webhooks, jobs). */
export const supabaseServiceRoleClientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  ...supabaseDbSchemaOption,
} as const;
