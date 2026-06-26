import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/sucursales — lista de sucursales activas de la empresa del usuario.
 *
 * Si el schema no tiene la tabla `sucursales` (deploys Elevate viejos),
 * devuelve un array vacío sin error.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    try {
      const { data, error } = await ctx.supabase
        .from("sucursales")
        .select("id,nombre,slug,es_principal,activo")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("es_principal", { ascending: false })
        .order("nombre", { ascending: true });
      if (error) {
        return NextResponse.json(successResponse({ sucursales: [] }));
      }
      return NextResponse.json(successResponse({ sucursales: data ?? [] }));
    } catch {
      return NextResponse.json(successResponse({ sucursales: [] }));
    }
  } catch (err) {
    console.error("[/api/sucursales GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las sucursales."), { status: 500 });
  }
}
