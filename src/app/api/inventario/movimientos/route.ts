import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";

const MOVIMIENTOS_COLS =
  "id,empresa_id,producto_id,producto_nombre,producto_sku," +
  "tipo,cantidad,costo_unitario,origen,referencia,fecha,created_at,updated_at," +
  "created_by,usuario_nombre";

/**
 * GET /api/inventario/movimientos — listado vía PostgREST HTTPS (JWT).
 * Limit 500 + orden por fecha DESC (mismo contrato que el handler legacy).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);
    const qs = new URLSearchParams({
      select: MOVIMIENTOS_COLS,
      empresa_id: `eq.${empresaId}`,
      order: "fecha.desc",
      limit: "500",
    });
    const r = await postgrestGet<Record<string, unknown>>("movimientos_inventario", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/inventario/movimientos GET]", r.error);
      return NextResponse.json(errorResponse("No se pudieron cargar los movimientos."), { status: 502 });
    }
    return NextResponse.json(successResponse({ movimientos: r.rows }));
  } catch (err) {
    console.error("[/api/inventario/movimientos GET] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los movimientos."), { status: 500 });
  }
}
