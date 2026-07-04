import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { ymdInicioFinMesLocal } from "@/lib/fechas/calendario";

/**
 * GET /api/dashboard/tenant-tables
 *
 * Filas de tablas operativas para el dashboard.
 *
 * IMPORTANTE: en runtime Hostinger, supabase.from(...) con service_role
 * devolvía 401 "Unauthorized" para todas las queries (service_role JWT
 * desfasada respecto al JWT_SECRET de los containers). Eso dejaba el
 * dashboard con todos los KPIs en 0. El fallback pg.Pool tampoco
 * funcionaba (puerto 5432 firewalled). Migrado a PostgREST HTTPS con
 * el JWT del usuario logueado — RLS por empresa cubre autorización.
 *
 * Solo lectura. No toca productos, stock, ventas ni nada.
 */
type RowMap = Record<string, unknown>;
type QueryResult = { rows: RowMap[]; error?: string };

async function safeGet(
  jwt: string | null,
  resource: string,
  query: string
): Promise<QueryResult> {
  const r = await postgrestGet<RowMap>(resource, query, {
    role: "jwt",
    jwt,
    noStore: true,
  });
  if (!r.ok) return { rows: [], error: r.error.message };
  return { rows: r.rows };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const now = new Date();
    const { inicioYmd: inicioMes, finYmd: finMes } = ymdInicioFinMesLocal(now);
    const empFilter = `empresa_id=eq.${empresaId}`;

    const [
      clientesQ,
      facturasQ,
      pagosQ,
      tipificacionesQ,
      productosQ,
      ventasQ,
      ventasItemsQ,
      comprasQ,
      gastosQ,
      suscripcionesDashQ,
      bajasQ,
      suscBajasQ,
      notaCreditoQ,
    ] = await Promise.all([
      safeGet(jwt, "clientes", `select=*&${empFilter}&limit=10000`),
      safeGet(jwt, "facturas", `select=*&${empFilter}&limit=10000`),
      safeGet(jwt, "pagos", `select=id,factura_id,monto,fecha_pago&${empFilter}&limit=10000`),
      safeGet(jwt, "tipificaciones", `select=*&${empFilter}&limit=10000`),
      safeGet(jwt, "productos", `select=*&${empFilter}&activo=eq.true&limit=10000`),
      safeGet(jwt, "ventas", `select=*&${empFilter}&limit=10000`),
      safeGet(jwt, "ventas_items", `select=*&${empFilter}&limit=10000`),
      safeGet(jwt, "compras", `select=*&${empFilter}&limit=10000`),
      safeGet(jwt, "gastos", `select=id,monto,fecha&${empFilter}&limit=10000`),
      safeGet(
        jwt,
        "suscripciones",
        `select=id,cliente_id,precio,moneda,fecha_inicio,created_at&${empFilter}&limit=10000`
      ),
      safeGet(
        jwt,
        "clientes",
        `select=id&${empFilter}&baja_operativa_at=not.is.null&baja_operativa_at=gte.${inicioMes}&baja_operativa_at=lte.${encodeURIComponent(
          finMes + "T23:59:59.999Z"
        )}&limit=10000`
      ),
      safeGet(jwt, "suscripciones", `select=cliente_id,precio&${empFilter}&estado=eq.cancelada&limit=10000`),
      safeGet(jwt, "nota_credito", `select=id,factura_id,monto,estado_erp&${empFilter}&limit=10000`),
    ]);

    const queryErrors: Record<string, string> = {};
    function take(key: string, q: QueryResult): RowMap[] {
      if (q.error) queryErrors[key] = q.error;
      return q.rows;
    }

    const payload = {
      clientes: take("clientes", clientesQ),
      facturas: take("facturas", facturasQ),
      pagos: take("pagos", pagosQ),
      tipificaciones: take("tipificaciones", tipificacionesQ),
      productos: take("productos", productosQ),
      ventas: take("ventas", ventasQ),
      ventas_items: take("ventas_items", ventasItemsQ),
      compras: take("compras", comprasQ),
      gastos: take("gastos", gastosQ),
      suscripciones: take("suscripciones", suscripcionesDashQ),
      clientes_baja_mes: take("clientes_baja_mes", bajasQ),
      suscripciones_canceladas: take("suscripciones_canceladas", suscBajasQ),
      notas_credito: take("notas_credito", notaCreditoQ),
      ...(Object.keys(queryErrors).length > 0 ? { query_errors: queryErrors } : {}),
    };

    return NextResponse.json(successResponse(payload));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("[/api/dashboard/tenant-tables]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
