/**
 * GET  /api/inventario/marcas  → lista de marcas de la empresa (activas).
 * POST /api/inventario/marcas  → crear marca (nombre + slug_web).
 *
 * Auth: JWT del usuario logueado. RLS en elevate.marcas cubre autorización.
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
  "id,empresa_id,nombre,slug_web,descripcion_web,logo_url,visible_web,orden_web,activo,created_at,updated_at";

type MarcaRow = Record<string, unknown> & { id: string };

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
    const r = await postgrestGet<MarcaRow>("marcas", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/inventario/marcas GET]", r.error);
      return NextResponse.json(errorResponse("No se pudieron cargar las marcas."), { status: 502 });
    }
    return NextResponse.json(successResponse({ marcas: r.rows }));
  } catch (err) {
    console.error("[/api/inventario/marcas GET] uncaught", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las marcas."), { status: 500 });
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
      descripcion_web:
        typeof body.descripcion_web === "string" ? body.descripcion_web.trim() || null : null,
      logo_url: typeof body.logo_url === "string" ? body.logo_url.trim() || null : null,
      visible_web: body.visible_web === false ? false : true,
      orden_web:
        typeof body.orden_web === "number" && Number.isFinite(body.orden_web)
          ? Math.trunc(body.orden_web)
          : 0,
      activo: body.activo === false ? false : true,
    };
    const r = await postgrestRequest<MarcaRow>("marcas", `select=${COLS}`, {
      method: "POST",
      role: "jwt",
      jwt,
      body: insert,
      prefer: "return=representation",
    });
    if (!r.ok) {
      if (r.error.code === "23505") {
        return NextResponse.json(
          errorResponse("Ya existe una marca con ese nombre o slug en esta empresa."),
          { status: 409 }
        );
      }
      console.error("[/api/inventario/marcas POST]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo crear la marca. (${(r.error.message ?? "").slice(0, 140)})`),
        { status: 502 }
      );
    }
    return NextResponse.json(successResponse({ marca: r.rows[0] }));
  } catch (err) {
    console.error("[/api/inventario/marcas POST] uncaught", err);
    return NextResponse.json(errorResponse("No se pudo crear la marca."), { status: 500 });
  }
}
