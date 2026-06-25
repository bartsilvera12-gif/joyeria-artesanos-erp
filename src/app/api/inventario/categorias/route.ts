import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { insertCategoriaProductoPostgrest } from "@/lib/inventario/server/catalogos-postgrest";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";

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

const CATEGORIAS_COLS =
  "id,empresa_id,nombre,codigo,descripcion,parent_id,activo,created_at,updated_at," +
  "slug_web,visible_web,orden_web,descripcion_web,imagen_path,imagen_url";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);
    const url = new URL(request.url);
    const todas = url.searchParams.get("todas") === "1";
    const qs = new URLSearchParams({
      select: CATEGORIAS_COLS,
      empresa_id: `eq.${empresaId}`,
      order: "nombre.asc",
      limit: "1000",
    });
    if (!todas) qs.set("activo", "eq.true");
    const r = await postgrestGet<Record<string, unknown>>(
      "categorias_productos",
      qs.toString(),
      { role: "jwt", jwt, noStore: true }
    );
    if (!r.ok) {
      console.error("[/api/inventario/categorias GET]", r.error);
      return NextResponse.json(errorResponse("No se pudieron cargar las categorías."), { status: 502 });
    }
    return NextResponse.json(successResponse({ categorias: r.rows }));
  } catch (err) {
    console.error("[/api/inventario/categorias GET] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las categorías."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const jwt = await getAccessTokenForRequest(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = trimText(body.nombre);
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    try {
      const slugWebRaw = typeof body.slug_web === "string" ? body.slug_web.trim() : null;
      const ordenWebRaw = body.orden_web;
      const ordenWeb = typeof ordenWebRaw === "number" && Number.isFinite(ordenWebRaw)
        ? Math.trunc(ordenWebRaw)
        : null;
      const row = await insertCategoriaProductoPostgrest(jwt, ctx.auth.empresa_id, {
        nombre,
        codigo: trimNullable(body.codigo),
        descripcion: trimNullable(body.descripcion),
        parent_id: body.parent_id == null ? null : String(body.parent_id),
        activo: body.activo === false ? false : true,
        slug_web: slugWebRaw || null,
        visible_web: body.visible_web === false ? false : true,
        orden_web: ordenWeb,
        descripcion_web: typeof body.descripcion_web === "string" ? body.descripcion_web : null,
      });
      return NextResponse.json(successResponse({ categoria: row }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const code = (e as { pgCode?: string })?.pgCode;
      if (code === "23505" || /uq_categorias_productos_empresa_nombre|duplicate/i.test(msg)) {
        return NextResponse.json(
          errorResponse("Ya existe una categoría con ese nombre."),
          { status: 409 }
        );
      }
      console.error("[/api/inventario/categorias POST]", msg);
      return NextResponse.json(
        errorResponse(`No se pudo crear la categoría. (${msg.slice(0, 140)})`),
        { status: 502 }
      );
    }
  } catch (err) {
    console.error("[/api/inventario/categorias POST] outer", err);
    return NextResponse.json(errorResponse("No se pudo crear la categoría."), { status: 500 });
  }
}
