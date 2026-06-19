/**
 * GET /api/productos/[id]/catalogo-extras
 *
 * Endpoint privado del ERP. Devuelve los datos asociados a un producto que
 * NO son columnas directas en productos: nombre de la familia olfativa y
 * notas top/heart/base ordenadas. Usado por el form de editar para
 * precargar los inputs de "Catálogo web".
 *
 * Transporte: PostgREST HTTPS con JWT del usuario. RLS por empresa.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";

type ProductoExtrasRow = {
  id: string;
  empresa_id: string;
  familia: { nombre: string | null } | null;
  notas: Array<{
    posicion: "top" | "heart" | "base";
    orden: number | null;
    nota: { nombre: string | null } | null;
  }> | null;
};

function pickNotas(
  rows: NonNullable<ProductoExtrasRow["notas"]>,
  pos: "top" | "heart" | "base"
): string[] {
  return rows
    .filter((n) => n && n.posicion === pos && n.nota?.nombre)
    .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999))
    .map((n) => n.nota!.nombre as string);
}

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const qs = new URLSearchParams({
      select:
        "id,empresa_id," +
        "familia:familias_olfativas(nombre)," +
        "notas:producto_notas(posicion,orden,nota:notas_olfativas(nombre))",
      id: `eq.${id}`,
      empresa_id: `eq.${empresaId}`,
      limit: "1",
    });
    const r = await postgrestGet<ProductoExtrasRow>("productos", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/productos/[id]/catalogo-extras]", r.error);
      return NextResponse.json(
        errorResponse("No se pudieron cargar los datos del catálogo web."),
        { status: 502 }
      );
    }
    const row = r.rows[0];
    if (!row) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }

    const notas = row.notas ?? [];
    return NextResponse.json(
      successResponse({
        familia_olfativa_nombre: row.familia?.nombre ?? null,
        notas_top: pickNotas(notas, "top"),
        notas_heart: pickNotas(notas, "heart"),
        notas_base: pickNotas(notas, "base"),
      })
    );
  } catch (err) {
    console.error(
      "[/api/productos/[id]/catalogo-extras] uncaught",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      errorResponse("No se pudieron cargar los datos del catálogo web."),
      { status: 500 }
    );
  }
}
