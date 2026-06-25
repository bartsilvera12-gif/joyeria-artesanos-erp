import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { listarCajasPg } from "@/lib/caja/server/caja-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** GET /api/reportes/cierres-caja — listado de cajas (turnos) con sus totales. */
export async function GET(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const cajas = await listarCajasPg(schema, auth.empresa_id, 300);
    return NextResponse.json(successResponse({ cajas }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudieron cargar los cierres de caja.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
