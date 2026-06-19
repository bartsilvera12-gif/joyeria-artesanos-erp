/**
 * PATCH /api/productos/[id]/presentaciones/[presentacionId] — editar presentación.
 * DELETE /api/productos/[id]/presentaciones/[presentacionId] — eliminar.
 *
 * Al borrar la última presentación, marca productos.tiene_presentaciones=false.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import {
  getAccessTokenForRequest,
  postgrestGet,
  postgrestRequest,
} from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { updateProductoPostgrest } from "@/lib/inventario/server/productos-postgrest";

const SELECT_COLS =
  "id,empresa_id,producto_id,sku,codigo_barras,codigo_barras_interno,volumen_ml," +
  "costo_promedio,precio_venta,precio_web,precio_oferta,oferta_hasta," +
  "precio_mayorista,cantidad_minima_mayorista,visible_mayorista_web," +
  "stock_actual,stock_minimo,imagen_path,imagen_url,visible_web,activo,orden," +
  "created_at,updated_at";

type PresentacionRow = Record<string, unknown> & {
  id: string;
  visible_web?: boolean;
  activo?: boolean;
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchPres(
  jwt: string | null,
  empresaId: string,
  productoId: string,
  presentacionId: string
): Promise<PresentacionRow | null> {
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    id: `eq.${presentacionId}`,
    producto_id: `eq.${productoId}`,
    empresa_id: `eq.${empresaId}`,
    limit: "1",
  });
  const r = await postgrestGet<PresentacionRow>("producto_presentaciones", qs.toString(), {
    role: "jwt",
    jwt,
    noStore: true,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.rows[0] ?? null;
}

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string; presentacionId: string }> }
) {
  try {
    const { id: productoId, presentacionId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const existing = await fetchPres(jwt, empresaId, productoId, presentacionId);
    if (!existing) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (typeof body.sku === "string") {
      const v = body.sku.trim().toUpperCase();
      if (!v) return NextResponse.json(errorResponse("sku no puede estar vacío"), { status: 400 });
      patch.sku = v;
    }
    if (body.codigo_barras !== undefined) {
      patch.codigo_barras =
        typeof body.codigo_barras === "string" && body.codigo_barras.trim()
          ? body.codigo_barras.trim()
          : null;
    }
    if (body.codigo_barras_interno !== undefined)
      patch.codigo_barras_interno = body.codigo_barras_interno === true;
    if (body.volumen_ml !== undefined) {
      const v = num(body.volumen_ml);
      if (v == null || v <= 0)
        return NextResponse.json(errorResponse("volumen_ml debe ser > 0"), { status: 400 });
      patch.volumen_ml = v;
    }
    for (const k of ["costo_promedio", "precio_venta", "stock_actual", "stock_minimo"] as const) {
      if (body[k] !== undefined) {
        const v = num(body[k]);
        if (v == null || v < 0)
          return NextResponse.json(errorResponse(`${k} inválido`), { status: 400 });
        patch[k] = v;
      }
    }
    for (const k of ["precio_web", "precio_oferta", "precio_mayorista"] as const) {
      if (body[k] !== undefined) {
        const v = num(body[k]);
        patch[k] = v == null || v < 0 ? null : v;
      }
    }
    if (body.cantidad_minima_mayorista !== undefined) {
      const v = num(body.cantidad_minima_mayorista);
      patch.cantidad_minima_mayorista = v == null || v < 1 ? null : Math.floor(v);
    }
    if (body.visible_mayorista_web !== undefined)
      patch.visible_mayorista_web = body.visible_mayorista_web === true;
    if (body.oferta_hasta !== undefined)
      patch.oferta_hasta =
        typeof body.oferta_hasta === "string" && body.oferta_hasta.trim()
          ? body.oferta_hasta.trim()
          : null;
    if (body.imagen_path !== undefined)
      patch.imagen_path =
        typeof body.imagen_path === "string" && body.imagen_path.trim()
          ? body.imagen_path.trim()
          : null;
    if (body.imagen_url !== undefined)
      patch.imagen_url =
        typeof body.imagen_url === "string" && body.imagen_url.trim()
          ? body.imagen_url.trim()
          : null;
    if (body.visible_web !== undefined) patch.visible_web = body.visible_web === true;
    if (body.activo !== undefined) patch.activo = body.activo === true;
    if (body.orden !== undefined) {
      const v = num(body.orden);
      patch.orden = v == null ? 0 : Math.floor(v);
    }

    // Reglas cruzadas
    const efVisible =
      patch.visible_web !== undefined ? patch.visible_web : existing.visible_web;
    const efActivo = patch.activo !== undefined ? patch.activo : existing.activo;
    if (efVisible === true && efActivo === false) {
      return NextResponse.json(
        errorResponse("Una presentación inactiva no puede estar visible en la web"),
        { status: 400 }
      );
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(errorResponse("Nada para actualizar"), { status: 400 });
    }

    const qs = new URLSearchParams({
      id: `eq.${presentacionId}`,
      empresa_id: `eq.${empresaId}`,
      select: SELECT_COLS,
    });
    const r = await postgrestRequest<PresentacionRow>(
      "producto_presentaciones",
      qs.toString(),
      {
        method: "PATCH",
        role: "jwt",
        jwt,
        body: patch,
        prefer: "return=representation",
      }
    );
    if (!r.ok) {
      if (r.error.code === "23505") {
        const msg = (r.error.message ?? "").toLowerCase();
        return NextResponse.json(
          errorResponse(
            msg.includes("sku")
              ? "Ya existe otra presentación con ese SKU."
              : msg.includes("volumen")
                ? "Ya existe otra presentación con ese volumen."
                : "Conflicto de unicidad."
          ),
          { status: 409 }
        );
      }
      console.error("[presentaciones PATCH]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo actualizar. (${(r.error.message ?? "").slice(0, 120)})`),
        { status: 502 }
      );
    }
    return NextResponse.json(successResponse({ presentacion: r.rows[0] }));
  } catch (err) {
    console.error("[presentaciones PATCH] outer", err);
    return NextResponse.json(errorResponse("Error al actualizar."), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string; presentacionId: string }> }
) {
  try {
    const { id: productoId, presentacionId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const existing = await fetchPres(jwt, empresaId, productoId, presentacionId);
    if (!existing) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const qs = new URLSearchParams({
      id: `eq.${presentacionId}`,
      empresa_id: `eq.${empresaId}`,
    });
    const r = await postgrestRequest("producto_presentaciones", qs.toString(), {
      method: "DELETE",
      role: "jwt",
      jwt,
    });
    if (!r.ok) {
      console.error("[presentaciones DELETE]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo eliminar. (${(r.error.message ?? "").slice(0, 120)})`),
        { status: 502 }
      );
    }

    // Si era la última, vuelve productos.tiene_presentaciones=false.
    const qsRest = new URLSearchParams({
      select: "id",
      producto_id: `eq.${productoId}`,
      empresa_id: `eq.${empresaId}`,
      limit: "1",
    });
    const rRest = await postgrestGet<{ id: string }>("producto_presentaciones", qsRest.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (rRest.ok && rRest.rows.length === 0) {
      try {
        await updateProductoPostgrest(jwt, empresaId, productoId, {
          tiene_presentaciones: false,
        });
      } catch (e) {
        console.warn("[presentaciones DELETE] no se pudo limpiar tiene_presentaciones", e);
      }
    }

    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[presentaciones DELETE] outer", err);
    return NextResponse.json(errorResponse("Error al eliminar."), { status: 500 });
  }
}
