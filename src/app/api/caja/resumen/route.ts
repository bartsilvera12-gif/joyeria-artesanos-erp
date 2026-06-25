import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getResumenCajaPg, getCajaAbiertaPg } from "@/lib/caja/server/caja-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/caja/resumen?caja_id=... — arqueo/resumen de una caja.
 * Sin `caja_id` devuelve el de la caja abierta actual (o null).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);

    const url = new URL(request.url);
    let cajaId = url.searchParams.get("caja_id");
    if (!cajaId) {
      const abierta = await getCajaAbiertaPg(schema, auth.empresa_id);
      if (!abierta) return NextResponse.json(successResponse({ resumen: null }));
      cajaId = abierta.id;
    }

    const resumen = await getResumenCajaPg(schema, auth.empresa_id, cajaId);
    if (!resumen) return NextResponse.json(errorResponse("Caja no encontrada."), { status: 404 });
    return NextResponse.json(successResponse({ resumen }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo obtener el resumen.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
