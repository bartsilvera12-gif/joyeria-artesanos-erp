import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getCajaAbiertaPg } from "@/lib/caja/server/caja-pg";
import { resolveSucursalIdForUserPg } from "@/lib/sucursales/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** GET /api/caja/abierta — caja abierta actual de la empresa (o null). */
export async function GET(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const sucursalId = await resolveSucursalIdForUserPg(
      schema,
      auth.empresa_id,
      auth.sucursal_id ?? null,
    );
    const caja = await getCajaAbiertaPg(schema, auth.empresa_id, sucursalId);
    return NextResponse.json(successResponse({ caja }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo obtener la caja.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
