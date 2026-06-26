import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { signProductoImagen } from "@/lib/inventario/imagen-storage";

interface EmbeddedNamed { nombre: string | null }
interface EmbeddedUbicacion { nombre: string | null; tipo: string | null }
interface ProductoRowEmbed {
  id: string;
  nombre: string;
  sku: string;
  codigo_barras: string | null;
  codigo_barras_interno: boolean | null;
  precio_venta: string | number | null;
  /** Precio promocional (web). Si está cargado y `oferta_hasta` es null o futuro, manda. */
  precio_oferta: string | number | null;
  /** Vigencia de la oferta. Null = vigente indefinido si precio_oferta > 0. */
  oferta_hasta: string | null;
  costo_promedio: string | number | null;
  stock_actual: string | number | null;
  stock_minimo: string | number | null;
  unidad_medida: string;
  metodo_valuacion: string;
  imagen_path: string | null;
  imagen_url: string | null;
  categoria: EmbeddedNamed | null;
  proveedor: EmbeddedNamed | null;
  ubicacion: EmbeddedUbicacion | null;
  es_decant: boolean | null;
}

interface ProductoSearchHit {
  id: string;
  nombre: string;
  sku: string;
  codigo_barras: string | null;
  codigo_barras_interno: boolean;
  precio_venta: number;
  /** Precio promocional cargado en el editor (0 si no hay). Cliente puede mostrarlo tachado. */
  precio_oferta: number;
  /** Vigencia de la oferta en ISO. null = vigente indefinido (si precio_oferta > 0). */
  oferta_hasta: string | null;
  /** Conveniencia: precio que el picker debe usar como sugerido = oferta si vigente, sino precio_venta. */
  precio_efectivo: number;
  costo_promedio: number;
  stock_actual: number;
  stock_minimo: number;
  unidad_medida: string;
  metodo_valuacion: string;
  imagen_path: string | null;
  imagen_url: string | null;
  categoria_nombre: string | null;
  proveedor_nombre: string | null;
  ubicacion_nombre: string | null;
  ubicacion_tipo: string | null;
  /** Fase Decants: producto marcado como decant — puede entregarse como obsequio. */
  es_decant: boolean;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_TOKENS = 6;
const SELECT_COLS =
  "id,nombre,sku,codigo_barras,codigo_barras_interno," +
  "precio_venta,precio_oferta,oferta_hasta," +
  "costo_promedio,stock_actual,stock_minimo," +
  "unidad_medida,metodo_valuacion,imagen_path,imagen_url,es_decant," +
  "categoria:categoria_principal_id(nombre)," +
  "proveedor:proveedor_principal_id(nombre)," +
  "ubicacion:ubicacion_principal_id(nombre,tipo)";

/** Escapa caracteres con significado especial en PostgREST ilike (* y ,). */
function escapeIlikeToken(t: string): string {
  return t.replace(/[*,()]/g, "");
}

/**
 * GET /api/productos/search?q=...&limit=30
 *
 * Búsqueda multi-token tipo POS: cada token (mínimo 2 chars) debe matchear
 * vía ILIKE en al menos una de nombre/sku/codigo_barras. Transporte
 * PostgREST HTTPS con JWT del usuario; RLS por empresa cubre autorización.
 *
 * NO usa pg.Pool — el runtime Hostinger no puede abrir el puerto 5432.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const url = new URL(request.url);
    const qRaw = (url.searchParams.get("q") ?? "").trim();
    const q = qRaw.slice(0, 100);
    const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(limitParam) ? limitParam : DEFAULT_LIMIT));

    const tokens = q
      .split(/\s+/)
      .map(escapeIlikeToken)
      .filter((t) => t.length >= 2)
      .slice(0, MAX_TOKENS);

    const qs = new URLSearchParams();
    qs.set("select", SELECT_COLS);
    qs.set("empresa_id", `eq.${empresaId}`);
    qs.set("activo", "eq.true");
    qs.set("order", "stock_actual.desc.nullslast,nombre.asc");
    qs.set("limit", String(limit));

    // Multi-token AND de OR(nombre|sku|codigo_barras ilike *tok*).
    if (tokens.length === 1) {
      const t = tokens[0];
      qs.set(
        "or",
        `(nombre.ilike.*${t}*,sku.ilike.*${t}*,codigo_barras.ilike.*${t}*)`
      );
    } else if (tokens.length > 1) {
      const parts = tokens.map(
        (t) => `or(nombre.ilike.*${t}*,sku.ilike.*${t}*,codigo_barras.ilike.*${t}*)`
      );
      qs.set("and", `(${parts.join(",")})`);
    }

    const r = await postgrestGet<ProductoRowEmbed>("productos", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/productos/search]", r.error);
      return NextResponse.json(
        errorResponse(
          `No se pudo realizar la búsqueda. Intentá nuevamente. (status=${r.error.status} code=${r.error.code ?? "-"} msg=${(r.error.message ?? "").slice(0, 140)})`
        ),
        { status: 502 }
      );
    }
    const rows = r.rows;

    // Multi-sucursal: si el usuario tiene sucursal_id, mostrar SU stock (no el
    // agregado). Best-effort: si no existe la tabla en este schema, sigue con
    // stock_actual como hoy.
    const stockBySucursalById = new Map<string, number>();
    if (auth.sucursal_id && rows.length) {
      try {
        const ids = rows.map((r) => r.id);
        const qss = new URLSearchParams();
        qss.set("select", "producto_id,stock_actual");
        qss.set("sucursal_id", `eq.${auth.sucursal_id}`);
        qss.set("producto_id", `in.(${ids.join(",")})`);
        const rs = await postgrestGet<{ producto_id: string; stock_actual: number | string }>(
          "producto_stock_sucursal",
          qss.toString(),
          { role: "jwt", jwt, noStore: true },
        );
        if (rs.ok) {
          for (const row of rs.rows) {
            stockBySucursalById.set(row.producto_id, Number(row.stock_actual ?? 0));
          }
        }
      } catch { /* schema sin sucursales: ignorar */ }
    }

    // Firmar URLs solo para los primeros 20 visibles (optimización).
    const SIGN_TOP = 20;
    const signedUrls: (string | null)[] = await Promise.all(
      rows.slice(0, SIGN_TOP).map(async (row) =>
        row.imagen_path ? await signProductoImagen(supabase, row.imagen_path, 3600) : null
      )
    );

    /**
     * Resuelve precio efectivo server-side: si la oferta está cargada y
     * vigente, manda; sino precio_venta. `oferta_hasta` null se interpreta
     * como "vigente indefinido" siempre que `precio_oferta > 0`.
     */
    const ahora = Date.now();
    function precioEfectivoOf(
      precioVenta: number,
      precioOferta: number,
      ofertaHasta: string | null
    ): number {
      if (!(precioOferta > 0)) return precioVenta;
      if (!ofertaHasta) return precioOferta;
      const t = Date.parse(ofertaHasta);
      if (!Number.isFinite(t)) return precioVenta;
      return t >= ahora ? precioOferta : precioVenta;
    }

    // Si el usuario tiene sucursal_id, descartamos los hits que no tengan
    // una fila per-sucursal asignada (no pertenecen a su inventario).
    const rowsFiltrados = auth.sucursal_id
      ? rows.filter((r) => stockBySucursalById.has(r.id))
      : rows;

    const hits: ProductoSearchHit[] = rowsFiltrados.map((row, i) => {
      const precioVenta = Number(row.precio_venta ?? 0);
      const precioOferta = Number(row.precio_oferta ?? 0);
      const ofertaHasta = row.oferta_hasta ?? null;
      const precioEfectivo = precioEfectivoOf(precioVenta, precioOferta, ofertaHasta);
      return {
        id: row.id,
        nombre: row.nombre,
        sku: row.sku,
        codigo_barras: row.codigo_barras,
        codigo_barras_interno: row.codigo_barras_interno === true,
        precio_venta: precioVenta,
        precio_oferta: precioOferta,
        oferta_hasta: ofertaHasta,
        precio_efectivo: precioEfectivo,
        costo_promedio: Number(row.costo_promedio ?? 0),
        stock_actual: auth.sucursal_id
          ? (stockBySucursalById.get(row.id) ?? 0)
          : Number(row.stock_actual ?? 0),
        stock_minimo: Number(row.stock_minimo ?? 0),
        unidad_medida: row.unidad_medida,
        metodo_valuacion: row.metodo_valuacion,
        imagen_path: row.imagen_path,
        imagen_url: (i < SIGN_TOP ? signedUrls[i] : null) ?? row.imagen_url ?? null,
        categoria_nombre: row.categoria?.nombre ?? null,
        proveedor_nombre: row.proveedor?.nombre ?? null,
        ubicacion_nombre: row.ubicacion?.nombre ?? null,
        ubicacion_tipo: row.ubicacion?.tipo ?? null,
        es_decant: row.es_decant === true,
      };
    });

    return NextResponse.json(successResponse({ items: hits, count: hits.length, q }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/productos/search] outer", msg);
    return NextResponse.json(
      errorResponse(`No se pudo realizar la búsqueda. (${msg.slice(0, 160)})`),
      { status: 500 }
    );
  }
}
