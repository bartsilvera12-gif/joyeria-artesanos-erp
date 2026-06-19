/**
 * Capa server-side PG directo para Productos / Inventario.
 *
 * Por que: algunos tenants `erp_*` NO estan expuestos en PostgREST y un
 * cliente Supabase con `db: { schema: erp_xxx }` falla con
 * "Invalid schema" (PGRST106). Esta capa va directo via `pg` Pool + queries
 * parametrizadas, usando el mismo pool singleton que el resto del repo.
 *
 * Schema y tablas se citan con identifiers escapados; nunca se interpola
 * input del usuario en SQL. Todos los valores van por placeholders $N.
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import type { Pool } from "pg";

export class DuplicadoError extends Error {
  constructor(public campo: "codigo_barras" | "sku" | "otro", message: string) {
    super(message);
    this.name = "DuplicadoError";
  }
}

function pool(): Pool {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool de Postgres no disponible.");
  return p;
}

function tProd(schema: string): string {
  return quoteSchemaTable(schema, "productos");
}
function tMov(schema: string): string {
  return quoteSchemaTable(schema, "movimientos_inventario");
}

/** Convierte 23505 en DuplicadoError tipado. */
function classifyUnique(err: unknown): never {
  const e = err as { code?: string; message?: string; constraint?: string };
  const code = e?.code;
  const msg = e?.message ?? "";
  const ctn = e?.constraint ?? "";
  if (code === "23505") {
    if (/codigo_barras/i.test(msg) || /codigo_barras/i.test(ctn)) {
      throw new DuplicadoError(
        "codigo_barras",
        "Ya existe otro producto con el mismo código de barras en esta empresa."
      );
    }
    if (/sku/i.test(msg) || /sku/i.test(ctn)) {
      throw new DuplicadoError(
        "sku",
        "Ya existe otro producto con el mismo SKU en esta empresa."
      );
    }
    throw new DuplicadoError("otro", "Ya existe un registro con un valor único conflictivo.");
  }
  throw err as Error;
}

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface ProductoRow {
  id: string;
  empresa_id: string;
  nombre: string;
  sku: string;
  modelo: string | null;
  costo_promedio: string | number;
  precio_venta: string | number;
  stock_actual: string | number;
  stock_minimo: string | number;
  cantidad_minima_minorista: number | null;
  unidad_medida: string;
  metodo_valuacion: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
  codigo_barras: string | null;
  codigo_barras_interno: boolean;
  imagen_path: string | null;
  imagen_url: string | null;
  categoria_principal_id: string | null;
  ubicacion_principal_id: string | null;
  proveedor_principal_id: string | null;
  /* Campos web pública (Fase 1) */
  slug_web: string | null;
  visible_web: boolean;
  destacado_web: boolean;
  descripcion_corta: string | null;
  descripcion_web: string | null;
  marca: string | null;
  marca_id: string | null;
  precio_web: string | number | null;
  precio_mayorista: string | number | null;
  cantidad_minima_mayorista: number | null;
  visible_mayorista_web: boolean;
  /* Catálogo enriquecido (Fase 1 catálogo) */
  precio_oferta: string | number | null;
  oferta_hasta: string | null;
  nuevo_hasta: string | null;
  concentracion: string | null;
  volumen_ml: number | null;
  genero: string | null;
  proximamente: boolean;
  orden_web: number | null;
  familia_olfativa_id: string | null;
  tiene_presentaciones: boolean;
  es_decant: boolean;
}

export interface InsertProductoInput {
  nombre: string;
  sku: string;
  modelo?: string | null;
  costo_promedio: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  cantidad_minima_minorista?: number | null;
  unidad_medida: string;
  metodo_valuacion: "CPP" | "FIFO" | "LIFO";
  activo?: boolean;
  codigo_barras: string | null;
  codigo_barras_interno: boolean;
  categoria_principal_id?: string | null;
  ubicacion_principal_id?: string | null;
  proveedor_principal_id?: string | null;
  /* Campos web pública (Fase 1) */
  slug_web?: string | null;
  visible_web?: boolean;
  destacado_web?: boolean;
  descripcion_corta?: string | null;
  descripcion_web?: string | null;
  marca?: string | null;
  marca_id?: string | null;
  precio_web?: number | null;
  precio_mayorista?: number | null;
  cantidad_minima_mayorista?: number | null;
  visible_mayorista_web?: boolean;
  /* Catálogo enriquecido (Fase 1 catálogo) */
  precio_oferta?: number | null;
  oferta_hasta?: string | null;
  nuevo_hasta?: string | null;
  concentracion?: string | null;
  volumen_ml?: number | null;
  genero?: "masculino" | "femenino" | "unisex" | null;
  proximamente?: boolean;
  orden_web?: number | null;
  familia_olfativa_id?: string | null;
  /** Fase Decants: si true, este producto puede entregarse como obsequio en ventas. */
  es_decant?: boolean;
}

const RETURNING = `
  id, empresa_id, nombre, sku, modelo, costo_promedio, precio_venta, stock_actual, stock_minimo,
  cantidad_minima_minorista,
  unidad_medida, metodo_valuacion, activo, created_at, updated_at,
  codigo_barras, codigo_barras_interno, imagen_path, imagen_url,
  categoria_principal_id, ubicacion_principal_id, proveedor_principal_id,
  slug_web, visible_web, destacado_web, descripcion_corta, descripcion_web, marca, marca_id, precio_web,
  precio_mayorista, cantidad_minima_mayorista, visible_mayorista_web,
  precio_oferta, oferta_hasta, nuevo_hasta, concentracion, volumen_ml, genero,
  proximamente, orden_web, familia_olfativa_id, tiene_presentaciones, es_decant
`;

// ─── Operaciones ──────────────────────────────────────────────────────────

export async function insertProducto(
  schemaRaw: string,
  empresaId: string,
  d: InsertProductoInput
): Promise<ProductoRow> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = tProd(schema);
  const sql = `
    INSERT INTO ${t} (
      empresa_id, nombre, sku, costo_promedio, precio_venta, stock_actual, stock_minimo,
      unidad_medida, metodo_valuacion, codigo_barras, codigo_barras_interno,
      categoria_principal_id, ubicacion_principal_id, proveedor_principal_id,
      slug_web, visible_web, destacado_web, descripcion_corta, descripcion_web, marca, marca_id, precio_web,
      precio_mayorista, cantidad_minima_mayorista, visible_mayorista_web,
      precio_oferta, oferta_hasta, nuevo_hasta, concentracion, volumen_ml, genero,
      proximamente, orden_web, familia_olfativa_id
    ) VALUES (
      $1::uuid, $2, $3, $4::numeric, $5::numeric, $6::numeric, $7::numeric,
      $8, $9, $10, COALESCE($11::boolean, false),
      $12::uuid, $13::uuid, $14::uuid,
      $15, COALESCE($16::boolean, false), COALESCE($17::boolean, false), $18, $19, $20, $21::uuid, $22::numeric,
      $23::numeric, $24::int, COALESCE($25::boolean, false),
      $26::numeric, $27::timestamptz, $28::date, $29, $30::int, $31,
      COALESCE($32::boolean, false), $33::int, $34::uuid
    )
    RETURNING ${RETURNING}
  `;
  const params = [
    empresaId,
    d.nombre,
    d.sku,
    d.costo_promedio,
    d.precio_venta,
    d.stock_actual,
    d.stock_minimo,
    d.unidad_medida,
    d.metodo_valuacion,
    d.codigo_barras,
    d.codigo_barras ? d.codigo_barras_interno : false,
    d.categoria_principal_id ?? null,
    d.ubicacion_principal_id ?? null,
    d.proveedor_principal_id ?? null,
    d.slug_web ?? null,
    d.visible_web ?? false,
    d.destacado_web ?? false,
    d.descripcion_corta ?? null,
    d.descripcion_web ?? null,
    d.marca ?? null,
    d.marca_id ?? null,
    d.precio_web ?? null,
    d.precio_mayorista ?? null,
    d.cantidad_minima_mayorista ?? null,
    d.visible_mayorista_web ?? false,
    d.precio_oferta ?? null,
    d.oferta_hasta ?? null,
    d.nuevo_hasta ?? null,
    d.concentracion ?? null,
    d.volumen_ml ?? null,
    d.genero ?? null,
    d.proximamente ?? false,
    d.orden_web ?? null,
    d.familia_olfativa_id ?? null,
  ];
  try {
    const { rows } = await pool().query<ProductoRow>(sql, params);
    return rows[0];
  } catch (err) {
    classifyUnique(err);
  }
}

export interface UpdateProductoInput {
  nombre?: string;
  sku?: string;
  modelo?: string | null;
  costo_promedio?: number;
  precio_venta?: number;
  stock_actual?: number;
  stock_minimo?: number;
  cantidad_minima_minorista?: number | null;
  unidad_medida?: string;
  metodo_valuacion?: "CPP" | "FIFO" | "LIFO";
  activo?: boolean;
  codigo_barras?: string | null;
  codigo_barras_interno?: boolean;
  imagen_path?: string | null;
  imagen_url?: string | null;
  categoria_principal_id?: string | null;
  ubicacion_principal_id?: string | null;
  proveedor_principal_id?: string | null;
  /* Campos web pública (Fase 1) */
  slug_web?: string | null;
  visible_web?: boolean;
  destacado_web?: boolean;
  descripcion_corta?: string | null;
  descripcion_web?: string | null;
  marca?: string | null;
  marca_id?: string | null;
  precio_web?: number | null;
  precio_mayorista?: number | null;
  cantidad_minima_mayorista?: number | null;
  visible_mayorista_web?: boolean;
  /* Catálogo enriquecido (Fase 1 catálogo) */
  precio_oferta?: number | null;
  oferta_hasta?: string | null;
  nuevo_hasta?: string | null;
  concentracion?: string | null;
  volumen_ml?: number | null;
  genero?: "masculino" | "femenino" | "unisex" | null;
  proximamente?: boolean;
  orden_web?: number | null;
  familia_olfativa_id?: string | null;
  tiene_presentaciones?: boolean;
  es_decant?: boolean;
}

/** Update parcial. Devuelve la fila o null si no existe / no pertenece a la empresa. */
export async function updateProductoPg(
  schemaRaw: string,
  empresaId: string,
  id: string,
  patch: UpdateProductoInput
): Promise<ProductoRow | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = tProd(schema);
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  function add(col: string, val: unknown, cast = "") {
    sets.push(`${col} = $${i}${cast}`);
    params.push(val);
    i++;
  }
  if (patch.nombre !== undefined) add("nombre", patch.nombre);
  if (patch.sku !== undefined) add("sku", patch.sku);
  if (patch.modelo !== undefined) add("modelo", patch.modelo || null);
  if (patch.costo_promedio !== undefined) add("costo_promedio", patch.costo_promedio, "::numeric");
  if (patch.precio_venta !== undefined) add("precio_venta", patch.precio_venta, "::numeric");
  if (patch.stock_actual !== undefined) add("stock_actual", patch.stock_actual, "::numeric");
  if (patch.stock_minimo !== undefined) add("stock_minimo", patch.stock_minimo, "::numeric");
  if (patch.cantidad_minima_minorista !== undefined)
    add(
      "cantidad_minima_minorista",
      patch.cantidad_minima_minorista == null ? null : patch.cantidad_minima_minorista,
      "::int"
    );
  if (patch.unidad_medida !== undefined) add("unidad_medida", patch.unidad_medida);
  if (patch.metodo_valuacion !== undefined) add("metodo_valuacion", patch.metodo_valuacion);
  if (patch.activo !== undefined) add("activo", patch.activo === true, "::boolean");
  if (patch.codigo_barras !== undefined) {
    add("codigo_barras", patch.codigo_barras || null);
    if (patch.codigo_barras_interno !== undefined) {
      add("codigo_barras_interno", patch.codigo_barras_interno, "::boolean");
    } else if (!patch.codigo_barras) {
      add("codigo_barras_interno", false, "::boolean");
    }
  } else if (patch.codigo_barras_interno !== undefined) {
    add("codigo_barras_interno", patch.codigo_barras_interno, "::boolean");
  }
  if (patch.imagen_path !== undefined) add("imagen_path", patch.imagen_path || null);
  if (patch.imagen_url !== undefined) add("imagen_url", patch.imagen_url || null);
  if (patch.categoria_principal_id !== undefined) add("categoria_principal_id", patch.categoria_principal_id || null, "::uuid");
  if (patch.ubicacion_principal_id !== undefined) add("ubicacion_principal_id", patch.ubicacion_principal_id || null, "::uuid");
  if (patch.proveedor_principal_id !== undefined) add("proveedor_principal_id", patch.proveedor_principal_id || null, "::uuid");
  // Campos web pública (Fase 1)
  if (patch.slug_web !== undefined) add("slug_web", patch.slug_web || null);
  if (patch.visible_web !== undefined) add("visible_web", patch.visible_web, "::boolean");
  if (patch.destacado_web !== undefined) add("destacado_web", patch.destacado_web, "::boolean");
  if (patch.descripcion_corta !== undefined) add("descripcion_corta", patch.descripcion_corta || null);
  if (patch.descripcion_web !== undefined) add("descripcion_web", patch.descripcion_web || null);
  if (patch.marca !== undefined) add("marca", patch.marca || null);
  if (patch.marca_id !== undefined) add("marca_id", patch.marca_id || null, "::uuid");
  if (patch.precio_web !== undefined) add("precio_web", patch.precio_web == null ? null : patch.precio_web, "::numeric");
  if (patch.precio_mayorista !== undefined) add("precio_mayorista", patch.precio_mayorista == null ? null : patch.precio_mayorista, "::numeric");
  if (patch.cantidad_minima_mayorista !== undefined) add("cantidad_minima_mayorista", patch.cantidad_minima_mayorista == null ? null : patch.cantidad_minima_mayorista, "::int");
  if (patch.visible_mayorista_web !== undefined) add("visible_mayorista_web", patch.visible_mayorista_web === true, "::boolean");
  // Catálogo enriquecido
  if (patch.precio_oferta !== undefined) add("precio_oferta", patch.precio_oferta == null ? null : patch.precio_oferta, "::numeric");
  if (patch.oferta_hasta !== undefined) add("oferta_hasta", patch.oferta_hasta || null, "::timestamptz");
  if (patch.nuevo_hasta !== undefined) add("nuevo_hasta", patch.nuevo_hasta || null, "::date");
  if (patch.concentracion !== undefined) add("concentracion", patch.concentracion || null);
  if (patch.volumen_ml !== undefined) add("volumen_ml", patch.volumen_ml == null ? null : patch.volumen_ml, "::int");
  if (patch.genero !== undefined) add("genero", patch.genero || null);
  if (patch.proximamente !== undefined) add("proximamente", patch.proximamente, "::boolean");
  if (patch.orden_web !== undefined) add("orden_web", patch.orden_web == null ? null : patch.orden_web, "::int");
  if (patch.familia_olfativa_id !== undefined) add("familia_olfativa_id", patch.familia_olfativa_id || null, "::uuid");
  if (patch.tiene_presentaciones !== undefined) add("tiene_presentaciones", patch.tiene_presentaciones === true, "::boolean");
  if (patch.es_decant !== undefined) add("es_decant", patch.es_decant === true, "::boolean");
  if (sets.length === 0) return await getProductoPg(schemaRaw, empresaId, id);

  sets.push(`updated_at = now()`);

  const idIdx = i;
  const empIdx = i + 1;
  params.push(id, empresaId);

  const sql = `
    UPDATE ${t} SET ${sets.join(", ")}
    WHERE id = $${idIdx}::uuid AND empresa_id = $${empIdx}::uuid
    RETURNING ${RETURNING}
  `;
  try {
    const { rows } = await pool().query<ProductoRow>(sql, params);
    return rows[0] ?? null;
  } catch (err) {
    classifyUnique(err);
  }
}

export async function getProductoPg(
  schemaRaw: string,
  empresaId: string,
  id: string
): Promise<ProductoRow | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = tProd(schema);
  const { rows } = await pool().query<ProductoRow>(
    `SELECT ${RETURNING} FROM ${t} WHERE id = $1::uuid AND empresa_id = $2::uuid LIMIT 1`,
    [id, empresaId]
  );
  return rows[0] ?? null;
}

export interface SearchHitRow {
  id: string;
  nombre: string;
  sku: string;
  codigo_barras: string | null;
  codigo_barras_interno: boolean;
  precio_venta: string | number;
  costo_promedio: string | number;
  stock_actual: string | number;
  stock_minimo: string | number;
  unidad_medida: string;
  metodo_valuacion: string;
  imagen_path: string | null;
  imagen_url: string | null;
  categoria_nombre: string | null;
  proveedor_nombre: string | null;
  ubicacion_nombre: string | null;
  ubicacion_tipo: string | null;
}

/**
 * Busqueda multi-token tipo POS.
 * - Separa q en tokens por espacios.
 * - Cada token debe matchear (ILIKE %tok%) en al menos uno de:
 *   nombre, sku, codigo_barras, categoria.nombre, proveedor.nombre,
 *   ubicacion.nombre. Permite matches en cualquier orden.
 * - JOINs con categorias_productos / proveedores / inventario_ubicaciones
 *   para devolver nombres legibles al UI.
 * - Orden por relevancia simple: stock>0 primero, luego nombre.
 */
export async function searchProductosPg(
  schemaRaw: string,
  empresaId: string,
  q: string,
  limit: number
): Promise<SearchHitRow[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tP = tProd(schema);
  const tC = quoteSchemaTable(schema, "categorias_productos");
  const tPr = quoteSchemaTable(schema, "proveedores");
  const tU = quoteSchemaTable(schema, "inventario_ubicaciones");
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const params: unknown[] = [empresaId];

  // Token-based AND con OR de columnas por token
  const tokens = (q ?? "")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/[%_]/g, (m) => "\\" + m))
    .slice(0, 6); // max 6 tokens para limitar coste

  const whereParts: string[] = [`p.empresa_id = $1::uuid`, `p.activo = true`];
  for (const tok of tokens) {
    params.push(`%${tok}%`);
    const idx = params.length;
    whereParts.push(
      `(p.nombre ILIKE $${idx} OR p.sku ILIKE $${idx} OR p.codigo_barras ILIKE $${idx}
        OR c.nombre ILIKE $${idx} OR pr.nombre ILIKE $${idx} OR u.nombre ILIKE $${idx})`
    );
  }

  const sql = `
    SELECT p.id, p.nombre, p.sku, p.codigo_barras, p.codigo_barras_interno,
           p.precio_venta, p.costo_promedio, p.stock_actual, p.stock_minimo,
           p.unidad_medida, p.metodo_valuacion, p.imagen_path, p.imagen_url,
           c.nombre  AS categoria_nombre,
           pr.nombre AS proveedor_nombre,
           u.nombre  AS ubicacion_nombre,
           u.tipo    AS ubicacion_tipo
      FROM ${tP} p
      LEFT JOIN ${tC}  c  ON c.id = p.categoria_principal_id
      LEFT JOIN ${tPr} pr ON pr.id = p.proveedor_principal_id
      LEFT JOIN ${tU}  u  ON u.id = p.ubicacion_principal_id
     WHERE ${whereParts.join(" AND ")}
     ORDER BY (p.stock_actual > 0) DESC, p.nombre
     LIMIT ${safeLimit}
  `;
  const { rows } = await pool().query<SearchHitRow>(sql, params);
  return rows;
}

export interface MovimientoInicialInput {
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
  cantidad: number;
  costo_unitario: number;
  created_by?: string | null;
  usuario_nombre?: string | null;
}

export async function insertMovimientoInicial(
  schemaRaw: string,
  empresaId: string,
  m: MovimientoInicialInput
): Promise<void> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = tMov(schema);
  await pool().query(
    `
    INSERT INTO ${t} (
      empresa_id, producto_id, producto_nombre, producto_sku,
      tipo, cantidad, costo_unitario, origen, referencia, fecha,
      created_by, usuario_nombre
    ) VALUES (
      $1::uuid, $2::uuid, $3, $4, 'ENTRADA', $5::numeric, $6::numeric,
      'inventario_inicial', NULL, now(),
      $7::uuid, $8
    )
  `,
    [
      empresaId,
      m.producto_id,
      m.producto_nombre,
      m.producto_sku,
      m.cantidad,
      m.costo_unitario,
      m.created_by ?? null,
      m.usuario_nombre ?? null,
    ]
  );
}

/**
 * Atomicamente incrementa la secuencia por empresa y devuelve el nuevo valor.
 * Usa la funcion plpgsql instalada por la migracion F3 en cada schema.
 */
export async function incrementarSecuenciaPg(
  schemaRaw: string,
  empresaId: string
): Promise<number> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  // El nombre de la funcion lo construimos con identifier escapado.
  const sch = `"${schema.replace(/"/g, '""')}"`;
  const { rows } = await pool().query<{ v: string }>(
    `SELECT ${sch}.incrementar_secuencia_producto($1::uuid) AS v`,
    [empresaId]
  );
  return Number(rows[0]?.v ?? 0);
}

export function rowToProductoApi(r: ProductoRow): Record<string, unknown> {
  return {
    id: r.id,
    empresa_id: r.empresa_id,
    nombre: r.nombre,
    sku: r.sku,
    modelo: r.modelo ?? null,
    costo_promedio: Number(r.costo_promedio),
    precio_venta: Number(r.precio_venta),
    stock_actual: Number(r.stock_actual),
    stock_minimo: Number(r.stock_minimo),
    cantidad_minima_minorista:
      r.cantidad_minima_minorista == null ? null : Number(r.cantidad_minima_minorista),
    unidad_medida: r.unidad_medida,
    metodo_valuacion: r.metodo_valuacion,
    activo: r.activo,
    created_at: r.created_at,
    updated_at: r.updated_at,
    codigo_barras: r.codigo_barras,
    codigo_barras_interno: r.codigo_barras_interno,
    imagen_path: r.imagen_path,
    imagen_url: r.imagen_url,
    categoria_principal_id: r.categoria_principal_id ?? null,
    ubicacion_principal_id: r.ubicacion_principal_id ?? null,
    proveedor_principal_id: r.proveedor_principal_id ?? null,
    slug_web: r.slug_web ?? null,
    visible_web: r.visible_web,
    destacado_web: r.destacado_web,
    descripcion_corta: r.descripcion_corta ?? null,
    descripcion_web: r.descripcion_web ?? null,
    marca: r.marca ?? null,
    marca_id: r.marca_id ?? null,
    precio_web: r.precio_web == null ? null : Number(r.precio_web),
    precio_mayorista: r.precio_mayorista == null ? null : Number(r.precio_mayorista),
    cantidad_minima_mayorista:
      r.cantidad_minima_mayorista == null ? null : Number(r.cantidad_minima_mayorista),
    visible_mayorista_web: r.visible_mayorista_web === true,
    precio_oferta: r.precio_oferta == null ? null : Number(r.precio_oferta),
    oferta_hasta: r.oferta_hasta ?? null,
    nuevo_hasta: r.nuevo_hasta ?? null,
    concentracion: r.concentracion ?? null,
    volumen_ml: r.volumen_ml ?? null,
    genero: r.genero ?? null,
    proximamente: !!r.proximamente,
    orden_web: r.orden_web ?? null,
    familia_olfativa_id: r.familia_olfativa_id ?? null,
  };
}
