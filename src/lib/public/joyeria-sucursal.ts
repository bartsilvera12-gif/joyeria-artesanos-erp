/**
 * Helpers para que las APIs públicas (web e-commerce) de Joyería Artesanos
 * sirvan únicamente productos/stock de la sucursal Principal.
 *
 * El catálogo es compartido entre sucursales, pero la web SOLO debe ofrecer
 * lo que la sucursal Principal puede despachar.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = import("@supabase/supabase-js").SupabaseClient<any, any, any, any, any>;

export async function getPrincipalSucursalId(
  supabase: AnySupabase,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("sucursales")
      .select("id")
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
 * Devuelve un mapa producto_id → stock_actual para la sucursal Principal,
 * filtrado a stock > 0 si `soloDisponibles` es true.
 *
 * Si el schema no tiene `producto_stock_sucursal` o `sucursales` (deploys
 * que no son Joyería), devuelve null. El caller debe fallback al comportamiento
 * legacy (productos.stock_actual).
 */
export async function getPrincipalStockMap(
  supabase: AnySupabase,
  opts?: { soloDisponibles?: boolean },
): Promise<Map<string, number> | null> {
  const sid = await getPrincipalSucursalId(supabase);
  if (!sid) return null;
  try {
    let q = supabase
      .from("producto_stock_sucursal")
      .select("producto_id, stock_actual")
      .eq("sucursal_id", sid);
    if (opts?.soloDisponibles) q = q.gt("stock_actual", 0);
    const { data, error } = await q;
    if (error) return null;
    const map = new Map<string, number>();
    for (const row of (data ?? []) as { producto_id: string; stock_actual: number | string }[]) {
      map.set(row.producto_id, Number(row.stock_actual));
    }
    return map;
  } catch {
    return null;
  }
}
