/**
 * DELETE /api/inventario/categorias/[id]/marcas/[marcaId]
 *
 * Quita la asociación entre marca y categoría. NO borra la marca.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import {
  getAccessTokenForRequest,
  postgrestRequest,
} from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string; marcaId: string }> }
) {
  try {
    const { id: categoriaId, marcaId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const qs = new URLSearchParams({
      categoria_id: `eq.${categoriaId}`,
      marca_id: `eq.${marcaId}`,
      empresa_id: `eq.${empresaId}`,
    });
    const r = await postgrestRequest("marca_categorias", qs.toString(), {
      method: "DELETE",
      role: "jwt",
      jwt,
    });
    if (!r.ok) {
      console.error("[categorias/[id]/marcas/[marcaId] DELETE]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo quitar la asociación. (${(r.error.message ?? "").slice(0, 120)})`),
        { status: 502 }
      );
    }
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[categorias/[id]/marcas/[marcaId] DELETE] outer", err);
    return NextResponse.json(errorResponse("Error al quitar la asociación."), { status: 500 });
  }
}
