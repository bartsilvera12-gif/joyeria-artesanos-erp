/**
 * GET /api/productos/[id]/acordes → acordes asignados al producto (con datos
 *   del catálogo para mostrar nombre/imagen sin un segundo fetch).
 * PUT /api/productos/[id]/acordes → reemplaza la selección completa de acordes
 *   del producto. body: { acorde_ids: string[] }.
 *
 * Auth: JWT del usuario. RLS de producto_acordes + acordes_olfativos.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  postgrestGet,
  postgrestRequest,
  getAccessTokenForRequest,
} from "@/lib/supabase/postgrest-runtime";

type PivotRow = {
  producto_id: string;
  acorde_id: string;
  orden: number;
  acorde?: {
    id: string;
    nombre: string;
    slug_web: string;
    imagen_path: string | null;
    imagen_url: string | null;
    visible_web: boolean;
    activo: boolean;
  } | null;
};

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const jwt = await getAccessTokenForRequest(request);
    const empresaId = ctx.auth.empresa_id;

    const qs = new URLSearchParams({
      select:
        "producto_id,acorde_id,orden,acorde:acordes_olfativos(id,nombre,slug_web,imagen_path,imagen_url,visible_web,activo)",
      producto_id: `eq.${productoId}`,
      empresa_id: `eq.${empresaId}`,
      order: "orden.asc",
    });
    const r = await postgrestGet<PivotRow>("producto_acordes", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/productos/[id]/acordes GET]", r.error);
      return NextResponse.json(errorResponse("No se pudieron cargar los acordes."), { status: 502 });
    }
    return NextResponse.json(successResponse({ acordes: r.rows }));
  } catch (err) {
    console.error("[/api/productos/[id]/acordes GET] uncaught", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los acordes."), { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const jwt = await getAccessTokenForRequest(request);
    const empresaId = ctx.auth.empresa_id;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const idsRaw = Array.isArray(body.acorde_ids) ? body.acorde_ids : [];
    const ids = idsRaw
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .slice(0, 24);

    // Borrar selección actual
    const delQs = new URLSearchParams({
      producto_id: `eq.${productoId}`,
      empresa_id: `eq.${empresaId}`,
    });
    const delR = await postgrestRequest("producto_acordes", delQs.toString(), {
      method: "DELETE",
      role: "jwt",
      jwt,
    });
    if (!delR.ok) {
      console.error("[/api/productos/[id]/acordes PUT] delete prev", delR.error);
      return NextResponse.json(errorResponse("No se pudieron actualizar los acordes."), { status: 502 });
    }

    if (ids.length === 0) {
      return NextResponse.json(successResponse({ inserted: 0 }));
    }

    // Insertar nueva selección con orden 0..N. Hacemos un POST con array para
    // ahorrar round-trips. PostgREST acepta bulk insert.
    const rows = ids.map((acorde_id, idx) => ({
      empresa_id: empresaId,
      producto_id: productoId,
      acorde_id,
      orden: idx,
    }));
    const insR = await postgrestRequest("producto_acordes", "", {
      method: "POST",
      role: "jwt",
      jwt,
      body: rows,
    });
    if (!insR.ok) {
      console.error("[/api/productos/[id]/acordes PUT] insert", insR.error);
      return NextResponse.json(
        errorResponse(`No se pudieron asignar los acordes. (${(insR.error.message ?? "").slice(0, 140)})`),
        { status: 502 }
      );
    }
    return NextResponse.json(successResponse({ inserted: rows.length }));
  } catch (err) {
    console.error("[/api/productos/[id]/acordes PUT] uncaught", err);
    return NextResponse.json(errorResponse("No se pudieron actualizar los acordes."), { status: 500 });
  }
}
