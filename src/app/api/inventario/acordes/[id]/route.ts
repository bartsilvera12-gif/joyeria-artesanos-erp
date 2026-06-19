/**
 * PATCH  /api/inventario/acordes/[id] → actualiza campos editables del acorde.
 * DELETE /api/inventario/acordes/[id] → soft-delete (activo=false).
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
  "id,empresa_id,nombre,slug_web,imagen_path,imagen_url,visible_web,orden_web,activo,created_at,updated_at";

type AcordeRow = Record<string, unknown> & { id: string };

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
    const r = await postgrestRequest<AcordeRow>("acordes_olfativos", qs.toString(), {
      method: "PATCH",
      role: "jwt",
      jwt,
      body: patch,
      prefer: "return=representation",
    });
    if (!r.ok) {
      if (r.error.code === "23505") {
        return NextResponse.json(
          errorResponse("Ya existe otro acorde con ese nombre o slug."),
          { status: 409 }
        );
      }
      console.error("[/api/inventario/acordes/[id] PATCH]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo actualizar el acorde. (${(r.error.message ?? "").slice(0, 140)})`),
        { status: 502 }
      );
    }
    if (!r.rows[0]) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }
    return NextResponse.json(successResponse({ acorde: r.rows[0] }));
  } catch (err) {
    console.error("[/api/inventario/acordes/[id] PATCH] uncaught", err);
    return NextResponse.json(errorResponse("No se pudo actualizar el acorde."), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const jwt = await getAccessTokenForRequest(request);
    // Soft-delete: marcamos activo=false. La FK con producto_acordes tiene
    // ON DELETE CASCADE, pero preferimos no romper asociaciones existentes.
    const qs = new URLSearchParams({
      id: `eq.${id}`,
      empresa_id: `eq.${ctx.auth.empresa_id}`,
      select: COLS,
    });
    const r = await postgrestRequest<AcordeRow>("acordes_olfativos", qs.toString(), {
      method: "PATCH",
      role: "jwt",
      jwt,
      body: { activo: false },
      prefer: "return=representation",
    });
    if (!r.ok) {
      console.error("[/api/inventario/acordes/[id] DELETE]", r.error);
      return NextResponse.json(errorResponse("No se pudo desactivar el acorde."), { status: 502 });
    }
    return NextResponse.json(successResponse({ acorde: r.rows[0] ?? null }));
  } catch (err) {
    console.error("[/api/inventario/acordes/[id] DELETE] uncaught", err);
    return NextResponse.json(errorResponse("No se pudo desactivar el acorde."), { status: 500 });
  }
}
