import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { updateUbicacionPostgrest } from "@/lib/inventario/server/catalogos-postgrest";
import { normalizeUpperText, normalizeUpperNullable } from "@/lib/text/normalize";
import { getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const jwt = await getAccessTokenForRequest(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Parameters<typeof updateUbicacionPostgrest>[3] = {};
    if (body.nombre !== undefined) patch.nombre = normalizeUpperText(body.nombre);
    if (body.codigo !== undefined) patch.codigo = normalizeUpperNullable(body.codigo);
    if (body.tipo !== undefined) patch.tipo = String(body.tipo);
    if (body.parent_id !== undefined) patch.parent_id = body.parent_id == null ? null : String(body.parent_id);
    if (body.descripcion !== undefined) patch.descripcion = normalizeUpperNullable(body.descripcion);
    if (body.activo !== undefined) patch.activo = body.activo === true;
    const row = await updateUbicacionPostgrest(jwt, ctx.auth.empresa_id, id, patch);
    if (!row) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    return NextResponse.json(successResponse({ ubicacion: row }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    console.error("[/api/inventario/ubicaciones/[id] PATCH]", err);
    return NextResponse.json(
      errorResponse(`No se pudo actualizar la ubicación. (${msg.slice(0, 140)})`),
      { status: 502 }
    );
  }
}
