/**
 * PATCH /api/caja/pedidos-web/[id]/cerrar
 *
 * Marca un pedido web como confirmado manual (cobrado desde Caja).
 * Setea estado='confirmado_manual' y, opcionalmente, venta_id.
 *
 * Idempotente: si el pedido ya esta cerrado, devuelve OK sin tocar.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json(errorResponse("id requerido"), { status: 400 });

  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

  let body: { venta_id?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    // body vacio es valido
  }

  const empresaId = ctx.auth.empresa_id;
  const supabase = ctx.supabase;

  const update: Record<string, unknown> = {
    estado: "confirmado_manual",
    updated_at: new Date().toISOString(),
  };
  if (body.venta_id) update.venta_id = body.venta_id;

  const { data, error } = await supabase
    .from("pedidos_web")
    .update(update)
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .select("id,numero,estado,venta_id")
    .maybeSingle();

  if (error) {
    console.error("[/api/caja/pedidos-web/[id]/cerrar]", error);
    return NextResponse.json(errorResponse(error.message), { status: 500 });
  }
  if (!data) {
    return NextResponse.json(errorResponse("Pedido no encontrado"), { status: 404 });
  }

  return NextResponse.json(successResponse({ pedido: data }));
}
