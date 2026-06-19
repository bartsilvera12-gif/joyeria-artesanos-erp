/**
 * GET  /api/inventario/acordes        → lista de acordes olfativos.
 * POST /api/inventario/acordes        → crea un acorde (nombre + slug_web).
 *
 * Auth: JWT del usuario. RLS en elevate.acordes_olfativos por empresa.
 * ?todas=1 incluye inactivos (panel admin); por defecto solo activos.
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

const COLS =
  "id,empresa_id,nombre,slug_web,imagen_path,imagen_url,visible_web,orden_web,activo,created_at,updated_at";

type AcordeRow = Record<string, unknown> & { id: string };

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const jwt = await getAccessTokenForRequest(request);
    const url = new URL(request.url);
    const todas = url.searchParams.get("todas") === "1";
    const qs = new URLSearchParams({
      select: COLS,
      empresa_id: `eq.${ctx.auth.empresa_id}`,
      order: "orden_web.asc,nombre.asc",
      limit: "1000",
    });
    if (!todas) qs.set("activo", "eq.true");
    const r = await postgrestGet<AcordeRow>("acordes_olfativos", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/inventario/acordes GET]", r.error);
      return NextResponse.json(errorResponse("No se pudieron cargar los acordes."), { status: 502 });
    }
    return NextResponse.json(successResponse({ acordes: r.rows }));
  } catch (err) {
    console.error("[/api/inventario/acordes GET] uncaught", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los acordes."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const jwt = await getAccessTokenForRequest(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) {
      return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    }
    const slugRaw =
      typeof body.slug_web === "string" && body.slug_web.trim().length > 0
        ? body.slug_web.trim().toLowerCase()
        : slugify(nombre);
    if (!slugRaw) {
      return NextResponse.json(errorResponse("Slug web inválido."), { status: 400 });
    }
    const insert = {
      empresa_id: ctx.auth.empresa_id,
      nombre,
      slug_web: slugRaw,
      visible_web: body.visible_web === false ? false : true,
      orden_web:
        typeof body.orden_web === "number" && Number.isFinite(body.orden_web)
          ? Math.trunc(body.orden_web)
          : 0,
      activo: body.activo === false ? false : true,
    };
    const r = await postgrestRequest<AcordeRow>("acordes_olfativos", `select=${COLS}`, {
      method: "POST",
      role: "jwt",
      jwt,
      body: insert,
      prefer: "return=representation",
    });
    if (!r.ok) {
      if (r.error.code === "23505") {
        return NextResponse.json(
          errorResponse("Ya existe un acorde con ese nombre o slug en esta empresa."),
          { status: 409 }
        );
      }
      console.error("[/api/inventario/acordes POST]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo crear el acorde. (${(r.error.message ?? "").slice(0, 140)})`),
        { status: 502 }
      );
    }
    return NextResponse.json(successResponse({ acorde: r.rows[0] }));
  } catch (err) {
    console.error("[/api/inventario/acordes POST] uncaught", err);
    return NextResponse.json(errorResponse("No se pudo crear el acorde."), { status: 500 });
  }
}
