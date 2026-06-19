import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { updateCategoriaProductoPostgrest } from "@/lib/inventario/server/catalogos-postgrest";
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
    const patch: Parameters<typeof updateCategoriaProductoPostgrest>[3] = {};
    if (body.nombre !== undefined) patch.nombre = normalizeUpperText(body.nombre);
    if (body.codigo !== undefined) patch.codigo = normalizeUpperNullable(body.codigo);
    if (body.descripcion !== undefined) patch.descripcion = normalizeUpperNullable(body.descripcion);
    if (body.parent_id !== undefined) patch.parent_id = body.parent_id == null ? null : String(body.parent_id);
    if (body.activo !== undefined) patch.activo = body.activo === true;
    if (body.slug_web !== undefined) patch.slug_web = typeof body.slug_web === "string" ? body.slug_web.trim() || null : null;
    if (body.visible_web !== undefined) patch.visible_web = body.visible_web === true;
    if (body.orden_web !== undefined) {
      const n = typeof body.orden_web === "number" ? body.orden_web : Number(body.orden_web);
      patch.orden_web = Number.isFinite(n) ? Math.trunc(n) : null;
    }
    if (body.descripcion_web !== undefined) patch.descripcion_web = typeof body.descripcion_web === "string" ? body.descripcion_web : null;
    const row = await updateCategoriaProductoPostgrest(jwt, ctx.auth.empresa_id, id, patch);
    if (!row) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    return NextResponse.json(successResponse({ categoria: row }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const code = (err as { pgCode?: string })?.pgCode;
    if (code === "23505" || /uq_categorias_productos_empresa_nombre|duplicate/i.test(msg)) {
      return NextResponse.json(errorResponse("Ya existe una categoría con ese nombre."), { status: 409 });
    }
    console.error("[/api/inventario/categorias/[id] PATCH]", err);
    return NextResponse.json(
      errorResponse(`No se pudo actualizar la categoría. (${msg.slice(0, 140)})`),
      { status: 502 }
    );
  }
}
