/**
 * PATCH /api/inventario/marcas/[id] → editar campos de una marca.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  postgrestRequest,
  getAccessTokenForRequest,
} from "@/lib/supabase/postgrest-runtime";

const COLS =
  "id,empresa_id,nombre,slug_web,descripcion_web,logo_url,visible_web,orden_web,activo,created_at,updated_at";

type MarcaRow = Record<string, unknown> & { id: string };

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

    const patch: Record<string, unknown> = {};
    if (typeof body.nombre === "string") {
      const v = body.nombre.trim();
      if (!v) return NextResponse.json(errorResponse("El nombre no puede estar vacío."), { status: 400 });
      patch.nombre = v;
    }
    if (body.slug_web !== undefined) {
      const v = typeof body.slug_web === "string" ? body.slug_web.trim().toLowerCase() : "";
      if (!v) return NextResponse.json(errorResponse("Slug web inválido."), { status: 400 });
      patch.slug_web = v;
    }
    if (body.descripcion_web !== undefined) {
      patch.descripcion_web =
        typeof body.descripcion_web === "string" ? body.descripcion_web.trim() || null : null;
    }
    if (body.logo_url !== undefined) {
      patch.logo_url = typeof body.logo_url === "string" ? body.logo_url.trim() || null : null;
    }
    if (body.visible_web !== undefined) patch.visible_web = body.visible_web === true;
    if (body.activo !== undefined) patch.activo = body.activo === true;
    if (body.orden_web !== undefined) {
      const n = typeof body.orden_web === "number" ? body.orden_web : Number(body.orden_web);
      patch.orden_web = Number.isFinite(n) ? Math.trunc(n) : 0;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(errorResponse("No hay campos para actualizar."), { status: 400 });
    }

    const qs = new URLSearchParams({
      id: `eq.${id}`,
      empresa_id: `eq.${ctx.auth.empresa_id}`,
      select: COLS,
    });
    const r = await postgrestRequest<MarcaRow>("marcas", qs.toString(), {
      method: "PATCH",
      role: "jwt",
      jwt,
      body: patch,
      prefer: "return=representation",
    });
    if (!r.ok) {
      if (r.error.code === "23505") {
        return NextResponse.json(
          errorResponse("Ya existe otra marca con ese nombre o slug."),
          { status: 409 }
        );
      }
      console.error("[/api/inventario/marcas/[id] PATCH]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo actualizar la marca. (${(r.error.message ?? "").slice(0, 140)})`),
        { status: 502 }
      );
    }
    if (!r.rows[0]) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }
    return NextResponse.json(successResponse({ marca: r.rows[0] }));
  } catch (err) {
    console.error("[/api/inventario/marcas/[id] PATCH] uncaught", err);
    return NextResponse.json(errorResponse("No se pudo actualizar la marca."), { status: 500 });
  }
}
