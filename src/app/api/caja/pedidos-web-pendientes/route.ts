/**
 * GET /api/caja/pedidos-web-pendientes
 *
 * Lista los pedidos creados desde la web (joyeriaartesanos.pedidos_web)
 * que aun no fueron facturados (estado='pendiente_pago'). Lectura para
 * que Caja muestre la cola entrante.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

type PedidoRow = {
  id: string;
  numero: string;
  cliente_snapshot: { nombre?: string; telefono?: string; notas?: string } | null;
  subtotal: number | string;
  total: number | string;
  created_at: string;
  notas: string | null;
};

type PedidoItemRow = {
  pedido_id: string;
  producto_id: string;
  producto_snapshot: { nombre?: string } | null;
  cantidad: number;
  precio_unitario: number | string;
  subtotal: number | string;
};

const PEDIDO_COLS = "id,numero,cliente_snapshot,subtotal,total,created_at,notas";
const ITEM_COLS = "pedido_id,producto_id,producto_snapshot,cantidad,precio_unitario,subtotal";

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

  const empresaId = ctx.auth.empresa_id;
  const jwt = await getAccessTokenForRequest(request);

  const pedidosQ = new URLSearchParams({
    select: PEDIDO_COLS,
    empresa_id: `eq.${empresaId}`,
    estado: "eq.pendiente_pago",
    order: "created_at.desc",
    limit: "100",
  });
  const pedidosRes = await postgrestGet<PedidoRow>("pedidos_web", pedidosQ.toString(), {
    role: "jwt",
    jwt,
    noStore: true,
  });
  if (!pedidosRes.ok) {
    console.error("[caja/pedidos-web-pendientes] pedidos", pedidosRes.error);
    return NextResponse.json(errorResponse("No se pudieron cargar los pedidos."), { status: 502 });
  }

  const pedidos = pedidosRes.rows ?? [];
  if (!pedidos.length) {
    return NextResponse.json(successResponse({ pedidos: [] }));
  }

  const ids = pedidos.map((p) => p.id);
  const itemsQ = new URLSearchParams({
    select: ITEM_COLS,
    pedido_id: `in.(${ids.join(",")})`,
  });
  const itemsRes = await postgrestGet<PedidoItemRow>("pedidos_web_items", itemsQ.toString(), {
    role: "jwt",
    jwt,
    noStore: true,
  });
  if (!itemsRes.ok) {
    console.error("[caja/pedidos-web-pendientes] items", itemsRes.error);
    return NextResponse.json(errorResponse("No se pudieron cargar los items."), { status: 502 });
  }

  const byPedido = new Map<string, PedidoItemRow[]>();
  for (const it of itemsRes.rows ?? []) {
    const list = byPedido.get(it.pedido_id) ?? [];
    list.push(it);
    byPedido.set(it.pedido_id, list);
  }

  const respuesta = pedidos.map((p) => ({
    id: p.id,
    numero: p.numero,
    cliente_nombre: p.cliente_snapshot?.nombre ?? "Cliente web",
    cliente_telefono: p.cliente_snapshot?.telefono ?? "",
    notas: p.notas ?? p.cliente_snapshot?.notas ?? null,
    subtotal: Number(p.subtotal ?? 0),
    total: Number(p.total ?? 0),
    created_at: p.created_at,
    items: (byPedido.get(p.id) ?? []).map((it) => ({
      producto_id: it.producto_id,
      nombre: it.producto_snapshot?.nombre ?? "Producto",
      cantidad: Number(it.cantidad),
      precio_unitario: Number(it.precio_unitario ?? 0),
      subtotal: Number(it.subtotal ?? 0),
    })),
  }));

  return NextResponse.json(successResponse({ pedidos: respuesta }));
}
