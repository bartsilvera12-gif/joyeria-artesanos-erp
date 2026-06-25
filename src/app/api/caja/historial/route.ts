import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { listarCajasPg } from "@/lib/caja/server/caja-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** GET /api/caja/historial — historial de cajas con totales calculados. */
export async function GET(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);

    const url = new URL(request.url);
    const limitRaw = parseInt(url.searchParams.get("limit") ?? "100", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 100;

    const cajas = await listarCajasPg(schema, auth.empresa_id, limit);
    return NextResponse.json(successResponse({ cajas }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cargar el historial.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
