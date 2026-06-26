/**
 * Helpers de sucursal para Joyería Artesanos (multi-sucursal dentro de una empresa).
 *
 * Modelo:
 *   - usuarios.sucursal_id NULL  → usuario "global" (admin / super admin). Las
 *     escrituras (caja, ventas, compras) se materializan en la sucursal Principal.
 *   - usuarios.sucursal_id <uuid> → usuario operativo de una sucursal específica.
 *
 * Deploys que no son Joyería Artesanos (schema sin tabla sucursales) son
 * tolerados: estas funciones devuelven null sin error.
 */
import { createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";

/** Devuelve la sucursal Principal de la empresa, o null si no aplica. */
export async function getSucursalPrincipalIdPg(
  schema: string,
  empresaId: string,
): Promise<string | null> {
  try {
    const sb = createServiceRoleClientWithDbSchema(schema);
    const { data, error } = await sb
      .from("sucursales")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("es_principal", true)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as { id?: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Sucursal efectiva para una operación de un usuario:
 *   - si el usuario tiene sucursal_id → esa.
 *   - sino → la Principal de la empresa.
 *   - null sólo si el schema no tiene `sucursales` (deploys no-joyería).
 */
export async function resolveSucursalIdForUserPg(
  schema: string,
  empresaId: string,
  usuarioSucursalId: string | null,
): Promise<string | null> {
  if (usuarioSucursalId) return usuarioSucursalId;
  return getSucursalPrincipalIdPg(schema, empresaId);
}
