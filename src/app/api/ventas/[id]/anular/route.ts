import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { anularVentaPg } from "@/lib/ventas/server/anular-venta-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/ventas/[id]/anular
 *
 * Marca la venta como anulada y reintegra stock (per sucursal si aplica).
 * Registra movimientos_inventario ENTRADA origen='ANULACION_VENTA'.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { id } = await params;
    if (!id) {
      return NextResponse.json(errorResponse("Falta el id de la venta."), { status: 400 });
    }
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const res = await anularVentaPg({
      schema,
      empresaId: ctx.auth.empresa_id,
      ventaId: id,
      usuarioNombre: ctx.auth.user?.email ?? null,
    });
    return NextResponse.json(successResponse(res));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo anular la venta.";
    console.error("[/api/ventas/[id]/anular]", msg);
    const status =
      msg.includes("no encontrada") ? 404 : msg.includes("ya estaba anulada") ? 409 : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
