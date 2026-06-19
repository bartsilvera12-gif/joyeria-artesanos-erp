/**
 * Cotización del dólar (USD/PYG) manual — endpoints autenticados del ERP.
 *
 *   GET  /api/inventario/cotizacion-dolar
 *     Devuelve la cotización vigente para la empresa actual (la más reciente
 *     en elevate.cotizaciones_dolar). Si no hay filas, devuelve cotizacion=null.
 *
 *   POST /api/inventario/cotizacion-dolar
 *     Body: { cotizacion: number, notas?: string }
 *     Inserta una nueva fila (append-only). El historial queda preservado.
 *
 * Auth: bearer del usuario (mismo patrón que /api/inventario/web-top-products).
 */
import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";

export const dynamic = "force-dynamic";

interface CotizacionRow {
  id: string;
  cotizacion: string; // pg numeric llega como string
  vigente_desde: Date | string;
}

interface CotizacionPayload {
  id: string;
  cotizacion: number;
  vigente_desde: string;
}

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json(
        errorResponse("Servicio no disponible (SUPABASE_DB_URL)."),
        { status: 503 }
      );
    }
    const tabla = quoteSchemaTable(SUPABASE_APP_SCHEMA, "cotizaciones_dolar");
    const sql = `
      SELECT id, cotizacion, vigente_desde
        FROM ${tabla}
       WHERE empresa_id = $1
       ORDER BY vigente_desde DESC, created_at DESC
       LIMIT 1
    `;
    const r = await pool.query<CotizacionRow>(sql, [auth.empresa_id]);
    if (r.rows.length === 0) {
      return NextResponse.json(successResponse({ cotizacion: null as CotizacionPayload | null }));
    }
    const row = r.rows[0];
    const payload: CotizacionPayload = {
      id: row.id,
      cotizacion: Number(row.cotizacion),
      vigente_desde: toIso(row.vigente_desde),
    };
    return NextResponse.json(successResponse({ cotizacion: payload }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al consultar la cotización.";
    console.error("[cotizacion-dolar GET]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const body = (await request.json().catch(() => null)) as
      | { cotizacion?: unknown; notas?: unknown }
      | null;
    const valor = Number(body?.cotizacion);
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json(
        errorResponse("La cotización debe ser un número mayor a 0."),
        { status: 400 }
      );
    }
    const notas =
      typeof body?.notas === "string" && body.notas.trim().length > 0
        ? body.notas.trim().slice(0, 500)
        : null;

    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json(
        errorResponse("Servicio no disponible (SUPABASE_DB_URL)."),
        { status: 503 }
      );
    }
    const tabla = quoteSchemaTable(SUPABASE_APP_SCHEMA, "cotizaciones_dolar");
    const sql = `
      INSERT INTO ${tabla} (empresa_id, cotizacion, creado_por, notas)
      VALUES ($1, $2, $3, $4)
      RETURNING id, cotizacion, vigente_desde
    `;
    const r = await pool.query<CotizacionRow>(sql, [
      auth.empresa_id,
      valor,
      auth.user.id,
      notas,
    ]);
    const row = r.rows[0];
    const payload: CotizacionPayload = {
      id: row.id,
      cotizacion: Number(row.cotizacion),
      vigente_desde: toIso(row.vigente_desde),
    };
    return NextResponse.json(successResponse({ cotizacion: payload }), { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al guardar la cotización.";
    console.error("[cotizacion-dolar POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
