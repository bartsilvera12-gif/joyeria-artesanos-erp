/**
 * GET /api/inventario/web-top-products?range=7d|30d|all
 *
 * Endpoint autenticado del ERP. Devuelve el top 10 de productos con más
 * eventos web (product_view + product_click + add_to_cart + whatsapp_click)
 * en el rango especificado.
 *
 * Auth: requiere bearer del usuario actual (mismo patrón que /api/proveedores
 * y /api/ventas/create).
 *
 * Query params:
 *   ?range=7d       últimos 7 días (default)
 *   ?range=30d      últimos 30 días
 *   ?range=all      todo el histórico
 *
 * Respuesta:
 *   {
 *     range, since, count,
 *     items: [
 *       {
 *         product_id, nombre, sku, imagen_url,
 *         total_eventos, vistas, clicks, agregados_carrito, clicks_whatsapp
 *       }
 *     ]
 *   }
 *
 * Si no hay eventos en el rango, count=0 y items=[]. El UI debe mostrar
 * estado vacío.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";

export const dynamic = "force-dynamic";

type Range = "7d" | "30d" | "all";

function parseRange(raw: string | null): Range {
  if (raw === "30d") return "30d";
  if (raw === "all") return "all";
  return "7d"; // default
}

function rangeToSinceIso(range: Range): string | null {
  if (range === "all") return null;
  const days = range === "30d" ? 30 : 7;
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

interface RankRow {
  product_id: string;
  nombre: string;
  sku: string;
  imagen_url: string | null;
  total_eventos: string; // pg bigint llega como string
  vistas: string;
  clicks: string;
  agregados_carrito: string;
  clicks_whatsapp: string;
}

interface RankItem {
  product_id: string;
  nombre: string;
  sku: string;
  imagen_url: string | null;
  total_eventos: number;
  vistas: number;
  clicks: number;
  agregados_carrito: number;
  clicks_whatsapp: number;
}

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) {
      console.log("[web-top-products] 401 (no auth)");
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }

    const url = new URL(request.url);
    const range = parseRange(url.searchParams.get("range"));
    const since = rangeToSinceIso(range);
    console.log(`[web-top-products] GET range=${range} empresa=${auth.empresa_id}`);

    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json(
        errorResponse("Servicio no disponible (SUPABASE_DB_URL)."),
        { status: 503 }
      );
    }

    const eventsT = quoteSchemaTable(SUPABASE_APP_SCHEMA, "web_product_events");
    const productosT = quoteSchemaTable(SUPABASE_APP_SCHEMA, "productos");

    // Construcción de WHERE date opcional + bind params dinámicos.
    const whereDate = since ? `WHERE e.created_at >= $1` : "";
    const params: unknown[] = since ? [since] : [];

    // Ranking: agrega por producto, JOIN con productos para nombre/sku/imagen,
    // filtra por empresa actual + activo. Top 10 por total.
    const sql = `
      SELECT
        e.product_id,
        p.nombre,
        p.sku,
        p.imagen_url,
        COUNT(*)::bigint AS total_eventos,
        COUNT(*) FILTER (WHERE e.event_type = 'product_view')::bigint    AS vistas,
        COUNT(*) FILTER (WHERE e.event_type = 'product_click')::bigint   AS clicks,
        COUNT(*) FILTER (WHERE e.event_type = 'add_to_cart')::bigint     AS agregados_carrito,
        COUNT(*) FILTER (WHERE e.event_type = 'whatsapp_click')::bigint  AS clicks_whatsapp
      FROM ${eventsT} e
      INNER JOIN ${productosT} p
        ON p.id = e.product_id
       AND p.empresa_id = $${params.length + 1}
       AND p.activo = true
      ${whereDate}
      GROUP BY e.product_id, p.nombre, p.sku, p.imagen_url
      ORDER BY total_eventos DESC, p.nombre ASC
      LIMIT 10
    `;
    params.push(auth.empresa_id);

    const result = await pool.query<RankRow>(sql, params);
    const items: RankItem[] = result.rows.map((r) => ({
      product_id: r.product_id,
      nombre: r.nombre,
      sku: r.sku,
      imagen_url: r.imagen_url ?? null,
      total_eventos: Number(r.total_eventos),
      vistas: Number(r.vistas),
      clicks: Number(r.clicks),
      agregados_carrito: Number(r.agregados_carrito),
      clicks_whatsapp: Number(r.clicks_whatsapp),
    }));

    console.log(
      `[web-top-products] OK range=${range} count=${items.length} ms=${Date.now() - t0}`
    );
    return NextResponse.json(
      successResponse({
        range,
        since,
        count: items.length,
        items,
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al consultar top productos.";
    console.error(`[web-top-products GET] FAIL msg="${msg}" ms=${Date.now() - t0}`);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
