import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { abrirCajaPg } from "@/lib/caja/server/caja-pg";
import { resolveSucursalIdForUserPg } from "@/lib/sucursales/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** POST /api/caja/abrir — abre una caja con monto inicial. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }
    const o = (body ?? {}) as Record<string, unknown>;
    const montoApertura = Number(o.monto_apertura);
    if (!Number.isFinite(montoApertura) || montoApertura < 0) {
      return NextResponse.json(errorResponse("Monto de apertura inválido."), { status: 400 });
    }
    const observacion =
      o.observacion == null || o.observacion === "" ? null : String(o.observacion).slice(0, 2000);

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    // Si el body trae sucursal_id explicito (admin eligiendo sucursal), lo usamos.
    // Si no, resolvemos por el sucursal_id del usuario (o Principal si es admin).
    const sucursalIdRaw =
      typeof o.sucursal_id === "string" && o.sucursal_id.trim() ? o.sucursal_id.trim() : null;
    const sucursalId =
      sucursalIdRaw ??
      (await resolveSucursalIdForUserPg(schema, auth.empresa_id, auth.sucursal_id ?? null));
    const caja = await abrirCajaPg({
      schema,
      empresaId: auth.empresa_id,
      montoApertura,
      observacion,
      usuarioId: auth.usuarioCatalogId ?? null,
      sucursalId,
    });
    return NextResponse.json(successResponse({ caja }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo abrir la caja.";
    const status = msg.includes("Ya hay una caja abierta") ? 409 : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
