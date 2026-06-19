import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { buildXlsxBuffer, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";

/**
 * GET /api/inventario/productos/export
 *
 * Descarga .xlsx con productos de la empresa + nombres de categoría /
 * proveedor / ubicación principal (FK embeds via PostgREST).
 *
 * NO usa pg.Pool — RLS por empresa cubre autorización con JWT del usuario.
 */
interface NamedEmbed { nombre: string | null }
interface UbicacionEmbed { nombre: string | null; tipo: string | null }
interface Row {
  nombre: string;
  sku: string;
  codigo_barras: string | null;
  codigo_barras_interno: boolean | null;
  unidad_medida: string;
  costo_promedio: string | number;
  precio_venta: string | number;
  stock_actual: string | number;
  stock_minimo: string | number;
  metodo_valuacion: string;
  activo: boolean;
  categoria: NamedEmbed | null;
  proveedor: NamedEmbed | null;
  ubicacion: UbicacionEmbed | null;
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 20; // hasta 20 000 filas

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const empresaId = ctx.auth.empresa_id;
  const jwt = await getAccessTokenForRequest(request);

  const selectCols =
    "nombre,sku,codigo_barras,codigo_barras_interno,unidad_medida," +
    "costo_promedio,precio_venta,stock_actual,stock_minimo,metodo_valuacion,activo," +
    "categoria:categoria_principal_id(nombre)," +
    "proveedor:proveedor_principal_id(nombre)," +
    "ubicacion:ubicacion_principal_id(nombre,tipo)";

  try {
    const all: Row[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({
        select: selectCols,
        empresa_id: `eq.${empresaId}`,
        order: "nombre.asc",
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      const r = await postgrestGet<Row>("productos", qs.toString(), {
        role: "jwt",
        jwt,
        noStore: true,
      });
      if (!r.ok) {
        console.error("[/api/inventario/productos/export]", r.error);
        return new Response("No se pudo generar el Excel", { status: 502 });
      }
      all.push(...r.rows);
      if (r.rows.length < PAGE_SIZE) break;
    }

    const buf = buildXlsxBuffer<Row>(
      all,
      [
        { header: "NOMBRE", value: (r) => r.nombre, width: 38 },
        { header: "SKU", value: (r) => r.sku, width: 18 },
        { header: "CODIGO_BARRAS", value: (r) => r.codigo_barras ?? "", width: 24 },
        { header: "CODIGO_INTERNO", value: (r) => (r.codigo_barras_interno && r.codigo_barras) ? r.codigo_barras : "", width: 24 },
        { header: "CATEGORIA", value: (r) => r.categoria?.nombre ?? "", width: 22 },
        { header: "PROVEEDOR_PRINCIPAL", value: (r) => r.proveedor?.nombre ?? "", width: 28 },
        {
          header: "UBICACION_PRINCIPAL",
          value: (r) => r.ubicacion?.nombre
            ? `${r.ubicacion.nombre}${r.ubicacion.tipo ? ` (${r.ubicacion.tipo})` : ""}`
            : "",
          width: 28,
        },
        { header: "UNIDAD_MEDIDA", value: (r) => r.unidad_medida, width: 12 },
        { header: "COSTO_PROMEDIO", value: (r) => Number(r.costo_promedio), width: 14 },
        { header: "PRECIO_VENTA", value: (r) => Number(r.precio_venta), width: 14 },
        { header: "STOCK_ACTUAL", value: (r) => Number(r.stock_actual), width: 12 },
        { header: "STOCK_MINIMO", value: (r) => Number(r.stock_minimo), width: 12 },
        { header: "METODO_VALUACION", value: (r) => r.metodo_valuacion, width: 8 },
        { header: "ACTIVO", value: (r) => (r.activo ? "SI" : "NO"), width: 8 },
      ],
      { sheetName: "Productos" }
    );

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: xlsxResponseHeaders(`productos-${nowStamp()}`),
    });
  } catch (err) {
    console.error("[/api/inventario/productos/export] outer", err instanceof Error ? err.message : err);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
