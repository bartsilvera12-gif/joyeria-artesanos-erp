/**
 * GET / PATCH /api/pedidos-web/[id]
 *
 * Detalle y cambio de estado de un pedido web. Solo en schema elevate, vía
 * PostgREST HTTPS con JWT (RLS por empresa).
 *
 * PATCH solo permite cambiar `estado` y `notas`. No tocamos venta_id, total,
 * subtotal, items, ni snapshots — son inmutables desde el ERP en este MVP.
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

export const dynamic = "force-dynamic";

const PEDIDO_COLS =
  "id,numero,empresa_id,cliente_snapshot,estado,subtotal,total,payment_method," +
  "notas,ip_origen,user_agent,public_token,venta_id,created_at,updated_at," +
  "items:pedidos_web_items(id,producto_id,producto_snapshot,cantidad,precio_unitario,subtotal,created_at)";

const ESTADOS_VALIDOS = new Set([
  "pendiente_pago",
  "en_revision",
  "confirmado_manual",
  "preparando",
  "enviado",
  "entregado",
  "cancelado",
]);

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);
    const qs = new URLSearchParams({
      select: PEDIDO_COLS,
      id: `eq.${id}`,
      empresa_id: `eq.${empresaId}`,
      limit: "1",
    });
    const r = await postgrestGet<Record<string, unknown>>("pedidos_web", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/pedidos-web/[id] GET]", r.error);
      return NextResponse.json(errorResponse("No se pudo cargar el pedido."), { status: 502 });
    }
    const row = r.rows[0];
    if (!row) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    return NextResponse.json(successResponse({ pedido: row }));
  } catch (err) {
    console.error("[/api/pedidos-web/[id] GET] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el pedido."), { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.estado !== undefined) {
      const e = typeof body.estado === "string" ? body.estado.trim() : "";
      if (!ESTADOS_VALIDOS.has(e)) {
        return NextResponse.json(errorResponse("Estado inválido."), { status: 400 });
      }
      patch.estado = e;
    }
    if (body.notas !== undefined) {
      const n = typeof body.notas === "string" ? body.notas.trim() : "";
      patch.notas = n || null;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(errorResponse("Nada que actualizar."), { status: 400 });
    }
    patch.updated_at = new Date().toISOString();

    const qs = new URLSearchParams({
      id: `eq.${id}`,
      empresa_id: `eq.${empresaId}`,
      select: PEDIDO_COLS,
    });
    const r = await postgrestRequest<Record<string, unknown>>("pedidos_web", qs.toString(), {
      method: "PATCH",
      role: "jwt",
      jwt,
      body: patch,
      prefer: "return=representation",
    });
    if (!r.ok) {
      console.error("[/api/pedidos-web/[id] PATCH]", r.error);
      return NextResponse.json(errorResponse("No se pudo actualizar el pedido."), { status: 502 });
    }
    const row = r.rows[0];
    if (!row) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    return NextResponse.json(successResponse({ pedido: row }));
  } catch (err) {
    console.error("[/api/pedidos-web/[id] PATCH] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo actualizar el pedido."), { status: 500 });
  }
}
