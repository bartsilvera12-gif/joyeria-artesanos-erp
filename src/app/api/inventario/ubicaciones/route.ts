import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { insertUbicacionPostgrest } from "@/lib/inventario/server/catalogos-postgrest";
import { normalizeUpperText, normalizeUpperNullable } from "@/lib/text/normalize";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";

const UBICACIONES_COLS =
  "id,empresa_id,nombre,codigo,tipo,parent_id,descripcion,activo,created_at,updated_at";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);
    const url = new URL(request.url);
    const todas = url.searchParams.get("todas") === "1";
    const qs = new URLSearchParams({
      select: UBICACIONES_COLS,
      empresa_id: `eq.${empresaId}`,
      order: "nombre.asc",
      limit: "1000",
    });
    if (!todas) qs.set("activo", "eq.true");
    const r = await postgrestGet<Record<string, unknown>>(
      "inventario_ubicaciones",
      qs.toString(),
      { role: "jwt", jwt, noStore: true }
    );
    if (!r.ok) {
      console.error("[/api/inventario/ubicaciones GET]", r.error);
      return NextResponse.json(errorResponse("No se pudieron cargar las ubicaciones."), { status: 502 });
    }
    return NextResponse.json(successResponse({ ubicaciones: r.rows }));
  } catch (err) {
    console.error("[/api/inventario/ubicaciones GET] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las ubicaciones."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const jwt = await getAccessTokenForRequest(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = normalizeUpperText(body.nombre);
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    try {
      const row = await insertUbicacionPostgrest(jwt, ctx.auth.empresa_id, {
        nombre,
        codigo: normalizeUpperNullable(body.codigo),
        tipo: body.tipo == null ? "deposito" : String(body.tipo),
        parent_id: body.parent_id == null ? null : String(body.parent_id),
        descripcion: normalizeUpperNullable(body.descripcion),
        activo: body.activo === false ? false : true,
      });
      return NextResponse.json(successResponse({ ubicacion: row }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const code = (e as { pgCode?: string })?.pgCode;
      if (code === "23505" || /uq_ubicaciones_empresa_codigo|duplicate/i.test(msg)) {
        return NextResponse.json(
          errorResponse("Ya existe una ubicación con ese código."),
          { status: 409 }
        );
      }
      console.error("[/api/inventario/ubicaciones POST]", msg);
      return NextResponse.json(
        errorResponse(`No se pudo crear la ubicación. (${msg.slice(0, 140)})`),
        { status: 502 }
      );
    }
  } catch (err) {
    console.error("[/api/inventario/ubicaciones POST] outer", err);
    return NextResponse.json(errorResponse("No se pudo crear la ubicación."), { status: 500 });
  }
}
