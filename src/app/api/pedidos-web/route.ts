/**
 * GET /api/pedidos-web — listado privado para el ERP.
 *
 * Lee vía PostgREST HTTPS con JWT del usuario. RLS por empresa
 * (`puede_acceder_empresa`) acota a la empresa del admin.
 * Filtros: estado, q (busca en número / cliente_snapshot->nombre o teléfono).
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";

export const dynamic = "force-dynamic";

const COLS =
  "id,numero,empresa_id,cliente_snapshot,estado,subtotal,total,payment_method," +
  "notas,created_at,updated_at";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const url = new URL(request.url);
    const estado = url.searchParams.get("estado") ?? "";
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 500);

    const qs = new URLSearchParams({
      select: COLS,
      empresa_id: `eq.${empresaId}`,
      order: "created_at.desc",
      limit: String(limit),
    });
    if (estado) qs.set("estado", `eq.${estado}`);
    if (q) {
      // Buscar en número (text) — PostgREST ilike acepta wildcards
      qs.set("numero", `ilike.%${q}%`);
      // Notar: buscar en cliente_snapshot JSON requeriría otra estrategia
      // (RPC). Para MVP, la búsqueda por número alcanza; el filtro de
      // teléfono/nombre se hace client-side sobre el set ya cargado.
    }

    const r = await postgrestGet<Record<string, unknown>>("pedidos_web", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/pedidos-web GET]", r.error);
      return NextResponse.json(errorResponse("No se pudieron cargar los pedidos."), { status: 502 });
    }
    return NextResponse.json(successResponse({ pedidos: r.rows }));
  } catch (err) {
    console.error("[/api/pedidos-web GET] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los pedidos."), { status: 500 });
  }
}
