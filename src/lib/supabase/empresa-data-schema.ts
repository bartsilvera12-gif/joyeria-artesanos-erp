import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_APP_SCHEMA,
  type AppSupabaseClient,
} from "@/lib/supabase/schema";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";

/**
 * Monocliente Elevate: el schema es fijo (NEURA_CLIENT_SCHEMA o 'elevate').
 * Esta función se mantiene async por compatibilidad de firma, pero NO consulta
 * la tabla `empresas` — siempre devuelve SUPABASE_APP_SCHEMA.
 */
export async function fetchDataSchemaForEmpresaId(_empresaId: string): Promise<string> {
  return SUPABASE_APP_SCHEMA;
}

/** Service role apuntando al esquema de datos operativos de la empresa (chat/omnicanal). */
export function createServiceRoleClientWithDbSchema(schema: string): AppSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema },
  }) as AppSupabaseClient;
}

/**
 * Monocliente Elevate: siempre devuelve el cliente service role del schema
 * único (SUPABASE_APP_SCHEMA). Se ignora `_empresaId`.
 */
export async function createServiceRoleClientForEmpresa(_empresaId: string): Promise<AppSupabaseClient> {
  return createServiceRoleClient();
}
