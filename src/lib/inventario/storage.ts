import { getCurrentUser } from "@/lib/auth";
import { getBrowserSupabaseForEmpresaData } from "@/lib/supabase/browser-data-client";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type {
  Producto,
  MovimientoInventario,
  MetodoValuacion,
  TipoMovimiento,
} from "./types";

// ─── Tipos de fila Supabase ───────────────────────────────────────────────────

interface ProductoRow {
  id: string;
  empresa_id: string;
  nombre: string;
  sku: string;
  modelo?: string | null;
  costo_promedio: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  cantidad_minima_minorista?: number | null;
  unidad_medida: string;
  metodo_valuacion: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
  codigo_barras?: string | null;
  codigo_barras_interno?: boolean | null;
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
  visible_mayorista_web?: boolean | null;
  tiene_presentaciones?: boolean | null;
  es_decant?: boolean | null;
  /* Catálogo enriquecido (Fase 1 catálogo) — el endpoint singular los devuelve
   * desde el fix 519d10f; faltaba que el mapper los pasara al form. */
  precio_oferta?: number | null;
  oferta_hasta?: string | null;
  nuevo_hasta?: string | null;
  concentracion?: string | null;
  volumen_ml?: number | null;
  genero?: string | null;
  proximamente?: boolean | null;
  orden_web?: number | null;
  familia_olfativa_id?: string | null;
  /** Desglose multi-sucursal: adjuntado por /api/productos GET para admin. */
  sucursales?: Array<{ sucursal_id: string; nombre: string; es_principal: boolean; stock_actual: number }>;
}

interface MovimientoRow {
  id: string;
  empresa_id: string;
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
  tipo: string;
  cantidad: number;
  costo_unitario: number;
  origen: string;
  referencia: string | null;
  fecha: string;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  usuario_nombre?: string | null;
}

// ─── Mapeo fila → tipo ────────────────────────────────────────────────────────

function rowToProducto(row: ProductoRow): Producto {
  // Whitelist explícito de géneros válidos (la interface Producto los exige).
  const generoRaw = (row.genero ?? "").toLowerCase();
  const generoOk: Producto["genero"] =
    generoRaw === "masculino" || generoRaw === "femenino" || generoRaw === "unisex"
      ? generoRaw
      : null;
  return {
    id: row.id,
    nombre: row.nombre,
    sku: row.sku,
    modelo: row.modelo ?? null,
    activo: row.activo !== false,
    costo_promedio: Number(row.costo_promedio),
    precio_venta: Number(row.precio_venta),
    stock_actual: Number(row.stock_actual),
    stock_minimo: Number(row.stock_minimo),
    cantidad_minima_minorista:
      row.cantidad_minima_minorista == null ? null : Number(row.cantidad_minima_minorista),
    unidad_medida: row.unidad_medida,
    metodo_valuacion: row.metodo_valuacion as MetodoValuacion,
    codigo_barras: row.codigo_barras ?? null,
    codigo_barras_interno: row.codigo_barras_interno ?? false,
    imagen_path: row.imagen_path ?? null,
    imagen_url: row.imagen_url ?? null,
    categoria_principal_id: row.categoria_principal_id ?? null,
    ubicacion_principal_id: row.ubicacion_principal_id ?? null,
    proveedor_principal_id: row.proveedor_principal_id ?? null,
    slug_web: row.slug_web ?? null,
    visible_web: row.visible_web ?? false,
    destacado_web: row.destacado_web ?? false,
    descripcion_corta: row.descripcion_corta ?? null,
    descripcion_web: row.descripcion_web ?? null,
    marca: row.marca ?? null,
    marca_id: row.marca_id ?? null,
    precio_web: row.precio_web == null ? null : Number(row.precio_web),
    precio_mayorista: row.precio_mayorista == null ? null : Number(row.precio_mayorista),
    cantidad_minima_mayorista:
      row.cantidad_minima_mayorista == null ? null : Number(row.cantidad_minima_mayorista),
    visible_mayorista_web: row.visible_mayorista_web === true,
    tiene_presentaciones: row.tiene_presentaciones === true,
    es_decant: row.es_decant === true,
    // Fix: estos campos venían del backend pero el mapper los descartaba,
    // dejando el form de edición vacío aunque la DB y el endpoint los traían.
    precio_oferta: row.precio_oferta == null ? null : Number(row.precio_oferta),
    oferta_hasta: row.oferta_hasta ?? null,
    nuevo_hasta: row.nuevo_hasta ?? null,
    concentracion: row.concentracion ?? null,
    volumen_ml: row.volumen_ml == null ? null : Number(row.volumen_ml),
    genero: generoOk,
    proximamente: row.proximamente === true,
    orden_web: row.orden_web == null ? null : Number(row.orden_web),
    familia_olfativa_id: row.familia_olfativa_id ?? null,
    sucursales: Array.isArray(row.sucursales)
      ? row.sucursales.map((s) => ({
          sucursal_id: s.sucursal_id,
          nombre: s.nombre,
          es_principal: s.es_principal === true,
          stock_actual: Number(s.stock_actual ?? 0),
        }))
      : undefined,
  };
}

function rowToMovimiento(row: MovimientoRow): MovimientoInventario {
  return {
    id: row.id,
    producto_id: row.producto_id,
    producto_nombre: row.producto_nombre,
    producto_sku: row.producto_sku,
    tipo: row.tipo as TipoMovimiento,
    cantidad: Number(row.cantidad),
    costo_unitario: Number(row.costo_unitario),
    origen: row.origen as MovimientoInventario["origen"],
    referencia: row.referencia ?? undefined,
    fecha: row.fecha,
    created_by: row.created_by ?? null,
    usuario_nombre: row.usuario_nombre ?? null,
  };
}

// ─── Productos ─────────────────────────────────────────────────────────────────

/** Lista productos via API server-side (PG directo, soporta tenants erp_* no expuestos). */
export async function getProductos(): Promise<Producto[]> {
  try {
    // Usar fetchWithSupabaseSession para que adjunte Authorization: Bearer <jwt>
    // del localStorage del browser. El endpoint /api/productos hace
    // getTenantSupabaseFromAuth → resolveApiAuthContext, que prefiere el
    // bearer del header sobre las cookies (cookies pueden no estar disponibles
    // server-side en cross-domain / Supabase self-hosted con SameSite).
    const r = await fetchWithSupabaseSession("/api/productos", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) {
      console.error("[inventario] getProductos:", (j as { error?: string })?.error ?? r.status);
      return [];
    }
    const list = ((j.data as { productos?: ProductoRow[] }).productos ?? []) as ProductoRow[];
    return list.map(rowToProducto);
  } catch (err) {
    console.error("[inventario] getProductos:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Obtiene un producto por ID via API server-side. */
export async function getProducto(id: string): Promise<Producto | null> {
  try {
    const r = await fetchWithSupabaseSession(`/api/productos/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) {
      console.error("[inventario] getProducto:", (j as { error?: string })?.error ?? r.status);
      return null;
    }
    const row = (j.data as { producto?: ProductoRow }).producto;
    return row ? rowToProducto(row) : null;
  } catch (err) {
    console.error("[inventario] getProducto:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Comprueba si ya existe un producto con el mismo SKU o nombre (case-insensitive).
 * Devuelve el producto encontrado o null.
 */
export async function productoExiste(
  sku: string,
  nombre: string
): Promise<Producto | null> {
  const productos = await getProductos();
  const skuNorm = sku.toLowerCase().trim();
  const nombreNorm = nombre.toLowerCase().trim();
  return (
    productos.find(
      (p) =>
        p.sku.toLowerCase() === skuNorm ||
        p.nombre.toLowerCase() === nombreNorm
    ) ?? null
  );
}

export type NuevoProductoData = Omit<Producto, "id"> & {
  /**
   * Multi-sucursal: ids de sucursales en las que el producto debe aparecer.
   * Sólo lo manda el admin desde /inventario/nuevo. El backend crea una fila
   * en producto_stock_sucursal por cada una (stock=0, salvo la sucursal que
   * recibe el stock inicial del form).
   */
  incluir_sucursales?: string[];
  sucursal_id?: string | null;
  /**
   * Reparto explícito al crear: sucursal_id (no-principal) → stock asignado.
   * El backend descuenta esos valores de Principal automáticamente.
   */
  stock_por_sucursal?: Record<string, number>;
};

/**
 * Crea producto via API server-side (POST /api/productos).
 *
 * Se mueve a server porque el cliente browser no tiene permisos para leer
 * `zentra_erp.usuarios` (RLS / GRANT) y el patrón canonico del repo es
 * resolver auth + tenant via getTenantSupabaseFromAuth en el backend.
 * El movimiento de inventario_inicial (cuando stock_actual > 0) tambien
 * se hace server-side dentro del mismo handler.
 */
export async function saveProducto(
  datos: NuevoProductoData
): Promise<Producto | null> {
  const body: Record<string, unknown> = {
    nombre: datos.nombre,
    sku: datos.sku,
    modelo: datos.modelo ?? null,
    costo_promedio: datos.costo_promedio,
    precio_venta: datos.precio_venta,
    stock_actual: datos.stock_actual ?? 0,
    stock_minimo: datos.stock_minimo ?? 0,
    cantidad_minima_minorista: datos.cantidad_minima_minorista ?? null,
    unidad_medida: datos.unidad_medida || "Unidad",
    metodo_valuacion: datos.metodo_valuacion,
    activo: datos.activo === false ? false : true,
    codigo_barras:
      datos.codigo_barras !== undefined && datos.codigo_barras !== null && datos.codigo_barras !== ""
        ? datos.codigo_barras
        : null,
    codigo_barras_interno: datos.codigo_barras_interno === true,
    categoria_principal_id: datos.categoria_principal_id ?? null,
    ubicacion_principal_id: datos.ubicacion_principal_id ?? null,
    proveedor_principal_id: datos.proveedor_principal_id ?? null,
    // Catálogo web (Fase 1 catálogo enriquecido)
    slug_web: datos.slug_web ?? null,
    visible_web: datos.visible_web ?? false,
    destacado_web: datos.destacado_web ?? false,
    descripcion_corta: datos.descripcion_corta ?? null,
    descripcion_web: datos.descripcion_web ?? null,
    marca: datos.marca ?? null,
    marca_id: datos.marca_id ?? null,
    precio_web: datos.precio_web ?? null,
    precio_mayorista: datos.precio_mayorista ?? null,
    cantidad_minima_mayorista: datos.cantidad_minima_mayorista ?? null,
    visible_mayorista_web: datos.visible_mayorista_web === true,
    precio_oferta: datos.precio_oferta ?? null,
    oferta_hasta: datos.oferta_hasta ?? null,
    nuevo_hasta: datos.nuevo_hasta ?? null,
    concentracion: datos.concentracion ?? null,
    volumen_ml: datos.volumen_ml ?? null,
    genero: datos.genero ?? null,
    proximamente: datos.proximamente ?? false,
    orden_web: datos.orden_web ?? null,
    familia_olfativa_id: datos.familia_olfativa_id ?? null,
    // Multi-sucursal (admin only — el server descarta si no es admin
    // o pisa con la sucursal_id del operativo).
    incluir_sucursales: datos.incluir_sucursales ?? undefined,
    sucursal_id: datos.sucursal_id ?? undefined,
    stock_por_sucursal: datos.stock_por_sucursal ?? undefined,
  };

  const res = await fetchWithSupabaseSession("/api/productos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || !json?.success) {
    const msg = (json as { error?: string })?.error ?? `Error ${res.status} al guardar producto.`;
    // 409 (conflicto) o validacion: lanzar para que la UI lo muestre.
    if (res.status === 409 || res.status === 400) throw new Error(msg);
    console.error("[inventario] saveProducto:", msg);
    throw new Error(msg);
  }

  const data = (json.data as { producto?: ProductoRow } | undefined)?.producto;
  if (!data) return null;
  return rowToProducto(data);
}

/** Actualiza solo precio_venta y/o costo_promedio. Wrapper de updateProducto. */
export async function updateProductoPrecios(
  productoId: string,
  datos: { precio_venta?: number; costo_promedio?: number }
): Promise<void> {
  await updateProducto(productoId, datos);
}

/** Actualiza producto via API server-side (PATCH /api/productos/[id]). */
export async function updateProducto(
  id: string,
  datos: Partial<Omit<Producto, "id">>
): Promise<Producto | null> {
  const body: Record<string, unknown> = {};
  if (datos.nombre !== undefined) body.nombre = datos.nombre;
  if (datos.sku !== undefined) body.sku = datos.sku;
  if (datos.modelo !== undefined) body.modelo = datos.modelo ?? null;
  if (datos.activo !== undefined) body.activo = datos.activo === true;
  if (datos.costo_promedio !== undefined) body.costo_promedio = datos.costo_promedio;
  if (datos.precio_venta !== undefined) body.precio_venta = datos.precio_venta;
  if (datos.stock_actual !== undefined) body.stock_actual = datos.stock_actual;
  if (datos.stock_minimo !== undefined) body.stock_minimo = datos.stock_minimo;
  if (datos.cantidad_minima_minorista !== undefined)
    body.cantidad_minima_minorista = datos.cantidad_minima_minorista ?? null;
  if (datos.unidad_medida !== undefined) body.unidad_medida = datos.unidad_medida;
  if (datos.metodo_valuacion !== undefined) body.metodo_valuacion = datos.metodo_valuacion;
  if (datos.codigo_barras !== undefined) body.codigo_barras = datos.codigo_barras ?? null;
  if (datos.codigo_barras_interno !== undefined) body.codigo_barras_interno = datos.codigo_barras_interno;
  if (datos.imagen_path !== undefined) body.imagen_path = datos.imagen_path ?? null;
  if (datos.imagen_url !== undefined) body.imagen_url = datos.imagen_url ?? null;
  if (datos.categoria_principal_id !== undefined) body.categoria_principal_id = datos.categoria_principal_id ?? null;
  if (datos.ubicacion_principal_id !== undefined) body.ubicacion_principal_id = datos.ubicacion_principal_id ?? null;
  if (datos.proveedor_principal_id !== undefined) body.proveedor_principal_id = datos.proveedor_principal_id ?? null;
  if (datos.slug_web !== undefined) body.slug_web = datos.slug_web ?? null;
  if (datos.visible_web !== undefined) body.visible_web = datos.visible_web === true;
  if (datos.destacado_web !== undefined) body.destacado_web = datos.destacado_web === true;
  if (datos.descripcion_corta !== undefined) body.descripcion_corta = datos.descripcion_corta ?? null;
  if (datos.descripcion_web !== undefined) body.descripcion_web = datos.descripcion_web ?? null;
  if (datos.marca !== undefined) body.marca = datos.marca ?? null;
  if (datos.marca_id !== undefined) body.marca_id = datos.marca_id ?? null;
  if (datos.precio_web !== undefined) body.precio_web = datos.precio_web ?? null;
  if (datos.precio_mayorista !== undefined) body.precio_mayorista = datos.precio_mayorista ?? null;
  if (datos.cantidad_minima_mayorista !== undefined)
    body.cantidad_minima_mayorista = datos.cantidad_minima_mayorista ?? null;
  if (datos.visible_mayorista_web !== undefined)
    body.visible_mayorista_web = datos.visible_mayorista_web === true;
  if (datos.es_decant !== undefined) body.es_decant = datos.es_decant === true;
  // Catálogo enriquecido
  if (datos.precio_oferta !== undefined) body.precio_oferta = datos.precio_oferta ?? null;
  if (datos.oferta_hasta !== undefined) body.oferta_hasta = datos.oferta_hasta ?? null;
  if (datos.nuevo_hasta !== undefined) body.nuevo_hasta = datos.nuevo_hasta ?? null;
  if (datos.concentracion !== undefined) body.concentracion = datos.concentracion ?? null;
  if (datos.volumen_ml !== undefined) body.volumen_ml = datos.volumen_ml ?? null;
  if (datos.genero !== undefined) body.genero = datos.genero ?? null;
  if (datos.proximamente !== undefined) body.proximamente = datos.proximamente === true;
  if (datos.orden_web !== undefined) body.orden_web = datos.orden_web ?? null;
  if (datos.familia_olfativa_id !== undefined) body.familia_olfativa_id = datos.familia_olfativa_id ?? null;

  const res = await fetchWithSupabaseSession(`/api/productos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || !json?.success) {
    const msg = (json as { error?: string })?.error ?? `Error ${res.status} al actualizar producto.`;
    if (res.status === 409 || res.status === 400 || res.status === 404) throw new Error(msg);
    console.error("[inventario] updateProducto:", msg);
    throw new Error(msg);
  }

  const data = (json.data as { producto?: ProductoRow } | undefined)?.producto;
  if (!data) return null;
  return rowToProducto(data);
}

// ─── Movimientos ─────────────────────────────────────────────────────────────

/** Lista movimientos via API server-side (PG directo). */
export async function getMovimientos(): Promise<MovimientoInventario[]> {
  try {
    const r = await fetchWithSupabaseSession("/api/inventario/movimientos", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) {
      console.error("[inventario] getMovimientos:", (j as { error?: string })?.error ?? r.status);
      return [];
    }
    const list = ((j.data as { movimientos?: MovimientoRow[] }).movimientos ?? []) as MovimientoRow[];
    return list.map(rowToMovimiento);
  } catch (err) {
    console.error("[inventario] getMovimientos:", err instanceof Error ? err.message : err);
    return [];
  }
}

function calcularDelta(tipo: TipoMovimiento, cantidad: number): number {
  if (tipo === "ENTRADA") return Math.abs(cantidad);
  if (tipo === "SALIDA") return -Math.abs(cantidad);
  return cantidad; // AJUSTE: la cantidad ya lleva el signo
}

export type NuevoMovimientoData = Omit<MovimientoInventario, "id">;

/**
 * Registra un movimiento y actualiza stock_actual del producto.
 * empresa_id se obtiene del usuario; RLS valida acceso.
 */
export async function saveMovimiento(
  mov: NuevoMovimientoData
): Promise<MovimientoInventario | null> {
  const supabase = await getBrowserSupabaseForEmpresaData();
  const usuario = await getCurrentUser();
  if (!usuario?.empresa_id) throw new Error("Usuario no autenticado o sin empresa");

  // 1. Obtener producto actual
  const producto = await getProducto(mov.producto_id);
  if (!producto) {
    console.error("[inventario] saveMovimiento: producto no encontrado");
    return null;
  }

  const delta = calcularDelta(mov.tipo, mov.cantidad);
  const nuevoStock = Math.max(0, producto.stock_actual + delta);
  const debeActualizarStock = mov.origen !== "inventario_inicial"; // inventario_inicial ya viene del insert

  // 2. Insertar movimiento
  const insert = {
    empresa_id: usuario.empresa_id,
    producto_id: mov.producto_id,
    producto_nombre: mov.producto_nombre,
    producto_sku: mov.producto_sku,
    tipo: mov.tipo,
    cantidad: mov.cantidad,
    costo_unitario: mov.costo_unitario,
    origen: mov.origen,
    referencia: mov.referencia ?? null,
    fecha: mov.fecha,
  };

  const { data: movData, error: movError } = await supabase
    .from("movimientos_inventario")
    .insert([insert])
    .select()
    .single();

  if (movError) {
    console.error("[inventario] saveMovimiento:", movError.message);
    return null;
  }

  // 3. Actualizar stock del producto (salvo inventario_inicial, que ya está en el insert)
  if (debeActualizarStock) {
    const { error: updError } = await supabase
      .from("productos")
      .update({ stock_actual: nuevoStock })
      .eq("id", mov.producto_id);

    if (updError) {
      console.error("[inventario] saveMovimiento (update stock):", updError.message);
    }
  }

  return rowToMovimiento(movData as MovimientoRow);
}
