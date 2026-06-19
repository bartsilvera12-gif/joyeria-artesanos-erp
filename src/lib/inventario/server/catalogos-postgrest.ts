/**
 * CRUD catálogos de Inventario via PostgREST HTTPS (JWT del usuario).
 *
 * Reemplaza la capa pg.Pool de `catalogos-pg.ts` para uso en runtime
 * Hostinger (puerto 5432 firewalled). RLS por empresa en
 * elevate.categorias_productos / elevate.inventario_ubicaciones cubre
 * la autorización (no necesitamos volver a filtrar por empresa más allá
 * de defensa en profundidad).
 *
 * Mantiene tipos compatibles con los call-sites del route handler.
 */
import {
  postgrestGet,
  postgrestRequest,
} from "@/lib/supabase/postgrest-runtime";

// ─── Categorías de productos ──────────────────────────────────────────────

export interface CategoriaProductoRow {
  id: string;
  empresa_id: string;
  nombre: string;
  codigo: string | null;
  descripcion: string | null;
  parent_id: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  // Campos catálogo web (Fase 1)
  slug_web: string | null;
  visible_web: boolean;
  orden_web: number | null;
  descripcion_web: string | null;
}

const CATEGORIA_COLS =
  "id,empresa_id,nombre,codigo,descripcion,parent_id,activo,created_at,updated_at," +
  "slug_web,visible_web,orden_web,descripcion_web";

const TIPOS_UBICACION = [
  "deposito",
  "salon",
  "pasillo",
  "gondola",
  "estante",
  "zona",
  "otro",
] as const;
export type TipoUbicacion = (typeof TIPOS_UBICACION)[number];

function normTipo(t: unknown): TipoUbicacion {
  return TIPOS_UBICACION.includes(t as TipoUbicacion) ? (t as TipoUbicacion) : "deposito";
}

export interface UbicacionRow {
  id: string;
  empresa_id: string;
  nombre: string;
  codigo: string | null;
  tipo: TipoUbicacion;
  parent_id: string | null;
  descripcion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

const UBICACION_COLS =
  "id,empresa_id,nombre,codigo,tipo,parent_id,descripcion,activo,created_at,updated_at";

// ─── Categorías: insert / update / list ──────────────────────────────────

export async function listCategoriasProductoPostgrest(
  jwt: string | null,
  empresaId: string,
  opts: { soloActivas?: boolean } = {}
): Promise<CategoriaProductoRow[]> {
  const qs = new URLSearchParams({
    select: CATEGORIA_COLS,
    empresa_id: `eq.${empresaId}`,
    order: "nombre.asc",
    limit: "5000",
  });
  if (opts.soloActivas !== false) qs.set("activo", "eq.true");
  const r = await postgrestGet<CategoriaProductoRow>(
    "categorias_productos",
    qs.toString(),
    { role: "jwt", jwt, noStore: true }
  );
  if (!r.ok) {
    throw new Error(`PostgREST categorias list: ${r.error.status} ${r.error.message}`);
  }
  return r.rows;
}

export async function insertCategoriaProductoPostgrest(
  jwt: string | null,
  empresaId: string,
  d: {
    nombre: string;
    codigo?: string | null;
    descripcion?: string | null;
    parent_id?: string | null;
    activo?: boolean;
    slug_web?: string | null;
    visible_web?: boolean;
    orden_web?: number | null;
    descripcion_web?: string | null;
  }
): Promise<CategoriaProductoRow> {
  const body: Record<string, unknown> = {
    empresa_id: empresaId,
    nombre: d.nombre.trim(),
    codigo: d.codigo?.trim() || null,
    descripcion: d.descripcion?.trim() || null,
    parent_id: d.parent_id || null,
    activo: d.activo ?? true,
    slug_web: d.slug_web?.trim() || null,
    visible_web: d.visible_web ?? true,
    orden_web: typeof d.orden_web === "number" ? d.orden_web : null,
    descripcion_web: d.descripcion_web?.trim() || null,
  };
  const r = await postgrestRequest<CategoriaProductoRow>(
    "categorias_productos",
    `select=${CATEGORIA_COLS}`,
    {
      method: "POST",
      role: "jwt",
      jwt,
      body,
      prefer: "return=representation",
    }
  );
  if (!r.ok) {
    const err = new Error(
      `PostgREST categorias insert: ${r.error.status} ${r.error.message}`
    );
    (err as Error & { pgCode?: string }).pgCode = r.error.code;
    throw err;
  }
  if (!r.rows[0]) throw new Error("PostgREST categorias insert: sin fila");
  return r.rows[0];
}

export async function updateCategoriaProductoPostgrest(
  jwt: string | null,
  empresaId: string,
  id: string,
  patch: Partial<{
    nombre: string;
    codigo: string | null;
    descripcion: string | null;
    parent_id: string | null;
    activo: boolean;
    slug_web: string | null;
    visible_web: boolean;
    orden_web: number | null;
    descripcion_web: string | null;
  }>
): Promise<CategoriaProductoRow | null> {
  const body: Record<string, unknown> = {};
  if (patch.nombre !== undefined) body.nombre = patch.nombre.trim();
  if (patch.codigo !== undefined) body.codigo = patch.codigo?.trim() || null;
  if (patch.descripcion !== undefined) body.descripcion = patch.descripcion?.trim() || null;
  if (patch.parent_id !== undefined) body.parent_id = patch.parent_id || null;
  if (patch.activo !== undefined) body.activo = patch.activo;
  if (patch.slug_web !== undefined) body.slug_web = patch.slug_web?.trim() || null;
  if (patch.visible_web !== undefined) body.visible_web = patch.visible_web;
  if (patch.orden_web !== undefined) body.orden_web = patch.orden_web;
  if (patch.descripcion_web !== undefined) body.descripcion_web = patch.descripcion_web?.trim() || null;
  if (Object.keys(body).length === 0) return null;

  const qs = new URLSearchParams({
    id: `eq.${id}`,
    empresa_id: `eq.${empresaId}`,
    select: CATEGORIA_COLS,
  });
  const r = await postgrestRequest<CategoriaProductoRow>(
    "categorias_productos",
    qs.toString(),
    {
      method: "PATCH",
      role: "jwt",
      jwt,
      body,
      prefer: "return=representation",
    }
  );
  if (!r.ok) {
    const err = new Error(
      `PostgREST categorias update: ${r.error.status} ${r.error.message}`
    );
    (err as Error & { pgCode?: string }).pgCode = r.error.code;
    throw err;
  }
  return r.rows[0] ?? null;
}

// ─── Ubicaciones: insert / update / list ─────────────────────────────────

export async function listUbicacionesPostgrest(
  jwt: string | null,
  empresaId: string,
  opts: { soloActivas?: boolean } = {}
): Promise<UbicacionRow[]> {
  const qs = new URLSearchParams({
    select: UBICACION_COLS,
    empresa_id: `eq.${empresaId}`,
    order: "nombre.asc",
    limit: "5000",
  });
  if (opts.soloActivas !== false) qs.set("activo", "eq.true");
  const r = await postgrestGet<UbicacionRow>(
    "inventario_ubicaciones",
    qs.toString(),
    { role: "jwt", jwt, noStore: true }
  );
  if (!r.ok) {
    throw new Error(`PostgREST ubicaciones list: ${r.error.status} ${r.error.message}`);
  }
  return r.rows;
}

export async function insertUbicacionPostgrest(
  jwt: string | null,
  empresaId: string,
  d: {
    nombre: string;
    codigo?: string | null;
    tipo?: string;
    parent_id?: string | null;
    descripcion?: string | null;
    activo?: boolean;
  }
): Promise<UbicacionRow> {
  const body: Record<string, unknown> = {
    empresa_id: empresaId,
    nombre: d.nombre.trim(),
    codigo: d.codigo?.trim() || null,
    tipo: normTipo(d.tipo),
    parent_id: d.parent_id || null,
    descripcion: d.descripcion?.trim() || null,
    activo: d.activo ?? true,
  };
  const r = await postgrestRequest<UbicacionRow>(
    "inventario_ubicaciones",
    `select=${UBICACION_COLS}`,
    {
      method: "POST",
      role: "jwt",
      jwt,
      body,
      prefer: "return=representation",
    }
  );
  if (!r.ok) {
    const err = new Error(
      `PostgREST ubicaciones insert: ${r.error.status} ${r.error.message}`
    );
    (err as Error & { pgCode?: string }).pgCode = r.error.code;
    throw err;
  }
  if (!r.rows[0]) throw new Error("PostgREST ubicaciones insert: sin fila");
  return r.rows[0];
}

export async function updateUbicacionPostgrest(
  jwt: string | null,
  empresaId: string,
  id: string,
  patch: Partial<{
    nombre: string;
    codigo: string | null;
    tipo: string;
    parent_id: string | null;
    descripcion: string | null;
    activo: boolean;
  }>
): Promise<UbicacionRow | null> {
  const body: Record<string, unknown> = {};
  if (patch.nombre !== undefined) body.nombre = patch.nombre.trim();
  if (patch.codigo !== undefined) body.codigo = patch.codigo?.trim() || null;
  if (patch.tipo !== undefined) body.tipo = normTipo(patch.tipo);
  if (patch.parent_id !== undefined) body.parent_id = patch.parent_id || null;
  if (patch.descripcion !== undefined) body.descripcion = patch.descripcion?.trim() || null;
  if (patch.activo !== undefined) body.activo = patch.activo;
  if (Object.keys(body).length === 0) return null;

  const qs = new URLSearchParams({
    id: `eq.${id}`,
    empresa_id: `eq.${empresaId}`,
    select: UBICACION_COLS,
  });
  const r = await postgrestRequest<UbicacionRow>(
    "inventario_ubicaciones",
    qs.toString(),
    {
      method: "PATCH",
      role: "jwt",
      jwt,
      body,
      prefer: "return=representation",
    }
  );
  if (!r.ok) {
    const err = new Error(
      `PostgREST ubicaciones update: ${r.error.status} ${r.error.message}`
    );
    (err as Error & { pgCode?: string }).pgCode = r.error.code;
    throw err;
  }
  return r.rows[0] ?? null;
}
