import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { updateCategoriaProductoPostgrest } from "@/lib/inventario/server/catalogos-postgrest";
import { getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { fetchDataSchemaForEmpresaId, createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";

// Categorías: preservar mayúsculas/minúsculas como las escribió el usuario.
function trimText(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}
function trimNullable(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

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
    if (body.nombre !== undefined) patch.nombre = trimText(body.nombre);
    if (body.codigo !== undefined) patch.codigo = trimNullable(body.codigo);
    if (body.descripcion !== undefined) patch.descripcion = trimNullable(body.descripcion);
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

/**
 * DELETE /api/inventario/categorias/[id] — borrado físico.
 *
 * Falla con 409 si hay productos referenciando la categoría (FK), para no
 * romper datos. En ese caso se le sugiere al usuario desactivarla en su lugar.
 */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    if (!id) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const sb = createServiceRoleClientWithDbSchema(schema);

    // Verificar si hay productos usando esta categoría como principal.
    const productosQ = await sb
      .from("productos")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("categoria_principal_id", id);
    if (productosQ.error) {
      return NextResponse.json(errorResponse(productosQ.error.message), { status: 502 });
    }
    if ((productosQ.count ?? 0) > 0) {
      return NextResponse.json(
        errorResponse(
          `No se puede borrar: hay ${productosQ.count} producto(s) usando esta categoría. Reasignalos o desactivá la categoría.`
        ),
        { status: 409 }
      );
    }

    // Verificar si tiene subcategorías (parent_id apuntando acá).
    const hijasQ = await sb
      .from("categorias_productos")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("parent_id", id);
    if (!hijasQ.error && (hijasQ.count ?? 0) > 0) {
      return NextResponse.json(
        errorResponse(
          `No se puede borrar: tiene ${hijasQ.count} subcategoría(s). Reasigná su padre primero.`
        ),
        { status: 409 }
      );
    }

    const del = await sb
      .from("categorias_productos")
      .delete()
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id);
    if (del.error) {
      const msg = del.error.message ?? "";
      if (del.error.code === "23503" || /violates foreign key/i.test(msg)) {
        return NextResponse.json(
          errorResponse("No se puede borrar: la categoría está referenciada por otros registros."),
          { status: 409 }
        );
      }
      return NextResponse.json(errorResponse(msg || "No se pudo borrar."), { status: 502 });
    }
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo borrar la categoría.";
    console.error("[/api/inventario/categorias/[id] DELETE]", err);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
