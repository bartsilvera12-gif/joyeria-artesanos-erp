import { isErpRolSupervisor } from "@/lib/usuarios/erp-rol-normalize";

export type ModuloRow = { id: string; nombre: string; slug: string };

/**
 * Modo de instancia dedicada single-client (ej. Elevate).
 *
 * Cuando `NEURA_INSTANCE_MODE=single_client`, la resolución de módulos aplica
 * una allowlist estricta SOLO a nivel empresa:
 *   - Sin filas en `empresa_modulos` ⇒ ningún módulo (NO fallback al catálogo
 *     completo, a diferencia del modo multitenant legacy).
 *   - Si un módulo no tiene fila en `empresa_modulos` o tiene `activo=false`,
 *     queda bloqueado para todos.
 *
 * Importante: la allowlist estricta NO se aplica a `usuario_modulos`. Un
 * usuario sin filas en `usuario_modulos` HEREDA los módulos activos de la
 * empresa (comportamiento natural — usuarios sin permisos granulares ven
 * todo lo que la empresa tiene activo). Filtrar a `[]` rebotaría al usuario
 * fuera del ERP en el caso por defecto.
 *
 * El modo no-single_client mantiene el comportamiento legacy retrocompatible.
 */
export function isStrictAllowlistMode(): boolean {
  if (typeof process === "undefined") return false;
  const v = (process.env.NEURA_INSTANCE_MODE ?? "").trim().toLowerCase();
  return v === "single_client";
}

/**
 * Cliente Supabase para consultas a tablas ERP en PostgREST.
 * Debe ser `any` aquí: en Vercel/TS estricto, `SupabaseClient<…, "zentra_erp", …>` no asigna a
 * alias con genéricos y rompe el build al pasar `createClient(..., { db: { schema: "zentra_erp" } })`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ModulosSupabase = any;

/** Slugs del stack omnicanal en dashboard; si la empresa los tiene habilitados, el supervisor debe verlos aunque `usuario_modulos` esté acotado a otros módulos. */
const SUPERVISOR_OMNICANAL_GRANT_SLUGS = new Set([
  "conversaciones",
  "omnicanal",
  "historial-omnicanal",
  "conversaciones-finalizadas",
  "monitoreo",
]);

/** Admin de empresa (`admin` al crear empresa, `administrador` en el alta interna): ven todos los módulos habilitados para la empresa. */
export function esRolAdminEmpresa(rol: string | null | undefined): boolean {
  const r = (rol ?? "").trim().toLowerCase();
  return r === "admin" || r === "administrador";
}

async function allModuloIdsFromCatalog(supabase: ModulosSupabase): Promise<string[]> {
  const { data, error } = await supabase.from("modulos").select("id");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((m: { id?: unknown }) => String(m.id ?? ""))
    .filter((id: string) => id.length > 0);
}

async function modulosRowsByIds(
  supabase: ModulosSupabase,
  moduloIds: string[]
): Promise<ModuloRow[]> {
  if (moduloIds.length === 0) return [];
  const { data: modulos, error: errMod } = await supabase
    .from("modulos")
    .select("id, nombre, slug")
    .in("id", moduloIds)
    .order("slug");
  if (errMod) throw new Error(errMod.message);
  return (modulos ?? []).map((m: { id?: unknown; nombre?: unknown; slug?: unknown }) => ({
    id: m.id as string,
    nombre: (m.nombre as string) ?? "",
    slug: (m.slug as string) ?? "",
  }));
}

/**
 * Resuelve módulos efectivos:
 * - super_admin → catálogo completo
 * - admin / administrador de empresa → todos los módulos activos de empresa_modulos
 * - resto (supervisor, usuario, etc.) → intersección empresa (activo) ∩ usuario_modulos
 */
export async function resolveEffectiveModules(
  supabase: ModulosSupabase,
  usuario: { id: string; empresa_id: string | null; rol: string | null }
): Promise<ModuloRow[]> {
  const rol = (usuario.rol ?? "").trim();
  if (rol === "super_admin") {
    const { data, error } = await supabase.from("modulos").select("id, nombre, slug").order("slug");
    if (error) throw new Error(error.message);
    return (data ?? []).map((m: { id?: unknown; nombre?: unknown; slug?: unknown }) => ({
      id: m.id as string,
      nombre: (m.nombre as string) ?? "",
      slug: (m.slug as string) ?? "",
    }));
  }

  if (!usuario.empresa_id) {
    return [];
  }

  const { data: emData, error: errEm } = await supabase
    .from("empresa_modulos")
    .select("modulo_id")
    .eq("empresa_id", usuario.empresa_id)
    .eq("activo", true);

  if (errEm) throw new Error(errEm.message);
  const emRows = (emData ?? []) as { modulo_id?: unknown }[];
  const empresaModuloIds: string[] = [
    ...new Set(
      emRows
        .map((r) => (r.modulo_id != null ? String(r.modulo_id) : ""))
        .filter((x): x is string => x.length > 0)
    ),
  ];

  /**
   * Single-client (NEURA_INSTANCE_MODE=single_client): allowlist estricta. Sin
   * filas en empresa_modulos ⇒ ningún módulo. NO fallback al catálogo completo.
   *
   * Modo legacy: misma UX que "ERP completo" para empresas nuevas / legado.
   */
  const strict = isStrictAllowlistMode();
  let effectiveEmpresaModuloIds = empresaModuloIds;
  if (effectiveEmpresaModuloIds.length === 0 && !strict) {
    effectiveEmpresaModuloIds = await allModuloIdsFromCatalog(supabase);
  }
  if (effectiveEmpresaModuloIds.length === 0) return [];

  if (esRolAdminEmpresa(usuario.rol)) {
    return modulosRowsByIds(supabase, effectiveEmpresaModuloIds);
  }

  const { data: umData, error: errUm } = await supabase
    .from("usuario_modulos")
    .select("modulo_id")
    .eq("usuario_id", usuario.id);

  if (errUm) throw new Error(errUm.message);
  const umRows = (umData ?? []) as { modulo_id?: unknown }[];
  const userIds: string[] = [
    ...new Set(
      umRows
        .map((r) => (r.modulo_id != null ? String(r.modulo_id) : ""))
        .filter((x): x is string => x.length > 0)
    ),
  ];

  let moduloIds: string[];
  if (userIds.length === 0) {
    /**
     * Sin filas en usuario_modulos: HEREDAR los módulos activos de la empresa.
     * Aplica igual en modo strict y legacy — la allowlist estricta solo gatea
     * a nivel empresa_modulos, no a nivel usuario. Filtrar a [] aquí dejaría
     * sin acceso a usuarios non-admin que aún no tienen permisos granulares
     * y los rebotaría fuera del ERP.
     */
    moduloIds = effectiveEmpresaModuloIds;
  } else {
    const empresaSet = new Set(effectiveEmpresaModuloIds);
    moduloIds = userIds.filter((id) => empresaSet.has(id));
  }

  if (isErpRolSupervisor(usuario.rol)) {
    const empresaModulos = await modulosRowsByIds(supabase, effectiveEmpresaModuloIds);
    const omnicanalExtraIds = empresaModulos
      .filter((m) => SUPERVISOR_OMNICANAL_GRANT_SLUGS.has((m.slug ?? "").trim().toLowerCase()))
      .map((m) => m.id);
    moduloIds = [...new Set([...moduloIds, ...omnicanalExtraIds])];
  }

  if (moduloIds.length === 0) return [];

  return modulosRowsByIds(supabase, moduloIds);
}

/** Filtra modulo_ids contra los habilitados para la empresa. */
export async function filterModuloIdsForEmpresa(
  supabase: ModulosSupabase,
  empresaId: string,
  moduloIds: string[]
): Promise<string[]> {
  if (moduloIds.length === 0) return [];
  const { data, error } = await supabase
    .from("empresa_modulos")
    .select("modulo_id")
    .eq("empresa_id", empresaId)
    .eq("activo", true)
    .in("modulo_id", moduloIds);
  if (error) throw new Error(error.message);
  const fmRows = (data ?? []) as { modulo_id?: unknown }[];
  const allowed = new Set(fmRows.map((r) => (r.modulo_id != null ? String(r.modulo_id) : "")));
  return moduloIds.filter((id) => allowed.has(id));
}
