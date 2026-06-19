/**
 * CRUD de productos via PostgREST HTTPS.
 *
 * Reemplaza la capa pg pool directa (productos-pg.ts) en runtime web de
 * Hostinger, donde el puerto 5432 está firewalled. Las queries van por
 * HTTPS con el JWT del usuario logueado — la RLS de elevate.productos
 * (`productos_select USING puede_acceder_empresa(empresa_id)`) cubre
 * autorización por empresa.
 *
 * Mantiene contrato de DuplicadoError y rowToProductoApi para no romper
 * los call-sites del route handler.
 */
import {
  postgrestRequest,
  postgrestGet,
} from "@/lib/supabase/postgrest-runtime";
import {
  DuplicadoError,
  type ProductoRow,
  type InsertProductoInput,
  type UpdateProductoInput,
} from "./productos-pg";

const RETURNING_COLS =
  "id,empresa_id,nombre,sku,modelo,costo_promedio,precio_venta,stock_actual,stock_minimo," +
  "cantidad_minima_minorista," +
  "unidad_medida,metodo_valuacion,activo,created_at,updated_at," +
  "codigo_barras,codigo_barras_interno,imagen_path,imagen_url," +
  "categoria_principal_id,ubicacion_principal_id,proveedor_principal_id," +
  "slug_web,visible_web,destacado_web,descripcion_corta,descripcion_web,marca,marca_id,precio_web,precio_mayorista,cantidad_minima_mayorista,visible_mayorista_web," +
  "precio_oferta,oferta_hasta,nuevo_hasta,concentracion,volumen_ml,genero," +
  "proximamente,orden_web,familia_olfativa_id,tiene_presentaciones,es_decant";

function classify23505(err: { code?: string; message?: string; detail?: string }): DuplicadoError {
  const txt = [err.message, err.detail].filter(Boolean).join(" ");
  if (/codigo_barras/i.test(txt)) {
    return new DuplicadoError("codigo_barras", "Ya existe otro producto con el mismo código de barras en esta empresa.");
  }
  if (/sku/i.test(txt)) {
    return new DuplicadoError("sku", "Ya existe otro producto con el mismo SKU en esta empresa.");
  }
  return new DuplicadoError("otro", "Ya existe un registro con un valor único conflictivo.");
}

export async function existsInTenantPostgrest(
  jwt: string | null,
  empresaId: string,
  table: "categorias_productos" | "inventario_ubicaciones" | "proveedores" | "marcas",
  id: string
): Promise<boolean> {
  const qs = new URLSearchParams({
    select: "id",
    id: `eq.${id}`,
    empresa_id: `eq.${empresaId}`,
    limit: "1",
  });
  const r = await postgrestGet<{ id: string }>(table, qs.toString(), {
    role: "jwt",
    jwt,
    noStore: true,
  });
  return r.ok && r.rows.length > 0;
}

export async function getProductoPostgrest(
  jwt: string | null,
  empresaId: string,
  id: string
): Promise<ProductoRow | null> {
  const qs = new URLSearchParams({
    select: RETURNING_COLS,
    id: `eq.${id}`,
    empresa_id: `eq.${empresaId}`,
    limit: "1",
  });
  const r = await postgrestGet<ProductoRow>("productos", qs.toString(), {
    role: "jwt",
    jwt,
    noStore: true,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.rows[0] ?? null;
}

export async function insertProductoPostgrest(
  jwt: string | null,
  empresaId: string,
  d: InsertProductoInput
): Promise<ProductoRow> {
  const body: Record<string, unknown> = {
    empresa_id: empresaId,
    nombre: d.nombre,
    sku: d.sku,
    modelo: d.modelo ?? null,
    costo_promedio: d.costo_promedio,
    precio_venta: d.precio_venta,
    stock_actual: d.stock_actual,
    stock_minimo: d.stock_minimo,
    cantidad_minima_minorista: d.cantidad_minima_minorista ?? null,
    unidad_medida: d.unidad_medida,
    metodo_valuacion: d.metodo_valuacion,
    activo: d.activo === false ? false : true,
    codigo_barras: d.codigo_barras,
    codigo_barras_interno: d.codigo_barras ? d.codigo_barras_interno : false,
    categoria_principal_id: d.categoria_principal_id ?? null,
    ubicacion_principal_id: d.ubicacion_principal_id ?? null,
    proveedor_principal_id: d.proveedor_principal_id ?? null,
    slug_web: d.slug_web ?? null,
    visible_web: d.visible_web ?? false,
    destacado_web: d.destacado_web ?? false,
    descripcion_corta: d.descripcion_corta ?? null,
    descripcion_web: d.descripcion_web ?? null,
    marca: d.marca ?? null,
    marca_id: d.marca_id ?? null,
    precio_web: d.precio_web ?? null,
    precio_mayorista: d.precio_mayorista ?? null,
    cantidad_minima_mayorista: d.cantidad_minima_mayorista ?? null,
    visible_mayorista_web: d.visible_mayorista_web === true,
    precio_oferta: d.precio_oferta ?? null,
    oferta_hasta: d.oferta_hasta ?? null,
    nuevo_hasta: d.nuevo_hasta ?? null,
    concentracion: d.concentracion ?? null,
    volumen_ml: d.volumen_ml ?? null,
    genero: d.genero ?? null,
    proximamente: d.proximamente ?? false,
    orden_web: d.orden_web ?? null,
    familia_olfativa_id: d.familia_olfativa_id ?? null,
    es_decant: d.es_decant === true,
  };
  const r = await postgrestRequest<ProductoRow>("productos", `select=${RETURNING_COLS}`, {
    method: "POST",
    role: "jwt",
    jwt,
    body,
    prefer: "return=representation",
  });
  if (!r.ok) {
    // PostgREST returns 23505 in error.code on unique violation
    if (r.error.code === "23505") throw classify23505(r.error);
    throw new Error(`PostgREST insert producto: ${r.error.status} ${r.error.message}`);
  }
  if (!r.rows[0]) throw new Error("PostgREST insert producto: no devolvió fila");
  return r.rows[0];
}

export async function updateProductoPostgrest(
  jwt: string | null,
  empresaId: string,
  id: string,
  patch: UpdateProductoInput
): Promise<ProductoRow | null> {
  const body: Record<string, unknown> = {};
  const keys: (keyof UpdateProductoInput)[] = [
    "nombre", "sku", "modelo", "costo_promedio", "precio_venta", "stock_actual", "stock_minimo",
    "cantidad_minima_minorista",
    "unidad_medida", "metodo_valuacion", "activo", "codigo_barras", "codigo_barras_interno",
    "imagen_path", "imagen_url",
    "categoria_principal_id", "ubicacion_principal_id", "proveedor_principal_id",
    "slug_web", "visible_web", "destacado_web", "descripcion_corta", "descripcion_web",
    "marca", "marca_id", "precio_web",
    "precio_mayorista", "cantidad_minima_mayorista", "visible_mayorista_web",
    "precio_oferta", "oferta_hasta", "nuevo_hasta", "concentracion", "volumen_ml",
    "genero", "proximamente", "orden_web", "familia_olfativa_id",
    "tiene_presentaciones",
    "es_decant",
  ];
  for (const k of keys) {
    if (patch[k] !== undefined) {
      // Normalizar string-vacío a null para campos opcionales tipo text
      const v = patch[k];
      body[k] = v === "" ? null : v;
    }
  }
  if (Object.keys(body).length === 0) {
    return await getProductoPostgrest(jwt, empresaId, id);
  }
  // Cuando se borra el código de barras, también limpiamos el flag interno.
  if (patch.codigo_barras !== undefined && (patch.codigo_barras === null || patch.codigo_barras === "")) {
    body.codigo_barras_interno = false;
  }

  const qs = new URLSearchParams({
    id: `eq.${id}`,
    empresa_id: `eq.${empresaId}`,
    select: RETURNING_COLS,
  });
  const r = await postgrestRequest<ProductoRow>("productos", qs.toString(), {
    method: "PATCH",
    role: "jwt",
    jwt,
    body,
    prefer: "return=representation",
  });
  if (!r.ok) {
    if (r.error.code === "23505") throw classify23505(r.error);
    throw new Error(`PostgREST update producto: ${r.error.status} ${r.error.message}`);
  }
  return r.rows[0] ?? null;
}

/**
 * Inserta movimiento de inventario inicial via PostgREST. Best-effort; el
 * caller debe wrappear en try/catch y NO interrumpir si falla.
 */
export async function insertMovimientoInicialPostgrest(
  jwt: string | null,
  empresaId: string,
  m: {
    producto_id: string;
    producto_nombre: string;
    producto_sku: string;
    cantidad: number;
    costo_unitario: number;
    created_by?: string | null;
    usuario_nombre?: string | null;
  }
): Promise<void> {
  const r = await postgrestRequest("movimientos_inventario", "", {
    method: "POST",
    role: "jwt",
    jwt,
    body: {
      empresa_id: empresaId,
      producto_id: m.producto_id,
      producto_nombre: m.producto_nombre,
      producto_sku: m.producto_sku,
      tipo: "ENTRADA",
      cantidad: m.cantidad,
      costo_unitario: m.costo_unitario,
      origen: "inventario_inicial",
      referencia: null,
      created_by: m.created_by ?? null,
      usuario_nombre: m.usuario_nombre ?? null,
    },
  });
  if (!r.ok) throw new Error(`movimiento_inicial: ${r.error.status} ${r.error.message}`);
}

/**
 * Sincroniza fila en el puente producto_categorias para que la categoría
 * principal quede como puente principal. Best-effort.
 */
export async function setCategoriaPrincipalPostgrest(
  jwt: string | null,
  empresaId: string,
  productoId: string,
  categoriaId: string | null
): Promise<void> {
  // Borrar todas las relaciones previas marcadas como principal para este producto
  const delQs = new URLSearchParams({
    producto_id: `eq.${productoId}`,
    empresa_id: `eq.${empresaId}`,
  });
  await postgrestRequest("producto_categorias", delQs.toString(), {
    method: "DELETE",
    role: "jwt",
    jwt,
  });
  if (!categoriaId) return;
  await postgrestRequest("producto_categorias", "", {
    method: "POST",
    role: "jwt",
    jwt,
    body: { producto_id: productoId, categoria_id: categoriaId, empresa_id: empresaId },
  });
}
