import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { createVentaTransaccionalPg } from "@/lib/ventas/server/create-venta-pg";
import { resolveSucursalIdForUserPg } from "@/lib/sucursales/server";
import type { CreateVentaItemInput } from "@/lib/ventas/server/create-venta-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";
import { marcarPedidoFacturado } from "@/lib/pedidos-caja/server";
import type { Venta, LineaVenta } from "@/lib/ventas/types";

function asItems(body: unknown): CreateVentaItemInput[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: CreateVentaItemInput[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") return null;
    const r = x as Record<string, unknown>;
    const tipoIva = r.tipo_iva;
    if (tipoIva !== "EXENTA" && tipoIva !== "5%" && tipoIva !== "10%") return null;
    const esSinCargo = r.es_sin_cargo === true;
    const motivoRaw = r.motivo_sin_cargo;
    const motivoSinCargo =
      esSinCargo
        ? (typeof motivoRaw === "string" && motivoRaw.trim()
            ? motivoRaw.trim().slice(0, 120)
            : "decant_obsequio")
        : null;
    out.push({
      producto_id: String(r.producto_id ?? ""),
      producto_nombre: String(r.producto_nombre ?? ""),
      sku: String(r.sku ?? ""),
      cantidad: Number(r.cantidad),
      precio_venta_original: Number(r.precio_venta_original),
      precio_venta: Number(r.precio_venta),
      tipo_iva: tipoIva,
      subtotal: Number(r.subtotal),
      monto_iva: Number(r.monto_iva),
      total_linea: Number(r.total_linea),
      es_sin_cargo: esSinCargo,
      motivo_sin_cargo: motivoSinCargo,
    });
  }
  if (out.some((i) => !i.producto_id || !(i.cantidad > 0))) return null;
  // Normalización: para ítems sin_cargo forzamos precios a 0 antes de la
  // validación de totales, así el recálculo declarado vs server coincide
  // sin depender de lo que mande el cliente.
  for (const it of out) {
    if (it.es_sin_cargo === true) {
      it.precio_venta_original = 0;
      it.precio_venta = 0;
      it.subtotal = 0;
      it.monto_iva = 0;
      it.total_linea = 0;
      it.tipo_iva = "EXENTA";
    }
  }
  return out;
}

function toVentaResponse(
  items: CreateVentaItemInput[],
  meta: {
    id: string;
    numero_control: string;
    fechaIso: string;
    moneda: Venta["moneda"];
    tipo_cambio: number;
    tipo_venta: Venta["tipo_venta"];
    plazo_dias?: number;
    subtotal: number;
    monto_iva: number;
    total: number;
  }
): Venta {
  const lineas: LineaVenta[] = items.map((i) => ({
    producto_id: i.producto_id,
    producto_nombre: i.producto_nombre,
    sku: i.sku,
    cantidad: i.cantidad,
    precio_venta_original: i.precio_venta_original,
    precio_venta: i.precio_venta,
    tipo_iva: i.tipo_iva,
    subtotal: i.subtotal,
    monto_iva: i.monto_iva,
    total_linea: i.total_linea,
    es_sin_cargo: i.es_sin_cargo === true,
    motivo_sin_cargo: i.motivo_sin_cargo ?? null,
  }));
  return {
    id: meta.id,
    numero_control: meta.numero_control,
    items: lineas,
    moneda: meta.moneda,
    tipo_cambio: meta.tipo_cambio,
    subtotal: meta.subtotal,
    monto_iva: meta.monto_iva,
    total: meta.total,
    tipo_venta: meta.tipo_venta,
    plazo_dias: meta.plazo_dias,
    fecha: meta.fechaIso,
  };
}

/**
 * POST /api/ventas/create — venta + ítems + stock + movimientos (una transacción Postgres).
 */
export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const bearerPresent = !!request.headers.get("authorization");
  try {
    console.log(`[diag-venta] POST start bearer=${bearerPresent}`);
    const auth = await getUserAndEmpresa(request);
    if (!auth) {
      console.log(`[diag-venta] auth=null bearer=${bearerPresent} ms=${Date.now() - t0}`);
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    console.log(`[diag-venta] auth_ok empresa=${auth.empresa_id} bearer=${bearerPresent}`);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const items = asItems(body);
    if (!items) {
      return NextResponse.json(errorResponse("Payload inválido: items requeridos."), { status: 400 });
    }

    const o = body as Record<string, unknown>;
    const moneda = o.moneda === "USD" ? "USD" : "GS";
    const tipoCambio = Number(o.tipo_cambio) || 1;
    const tipoVenta = o.tipo_venta === "CREDITO" ? "CREDITO" : "CONTADO";
    const plazoDias =
      tipoVenta === "CREDITO" && o.plazo_dias != null && String(o.plazo_dias).trim() !== ""
        ? parseInt(String(o.plazo_dias), 10)
        : null;
    const clienteRaw = o.cliente_id;
    const clienteId =
      clienteRaw === null || clienteRaw === undefined || clienteRaw === ""
        ? null
        : String(clienteRaw);
    const observaciones =
      o.observaciones === null || o.observaciones === undefined
        ? null
        : String(o.observaciones).slice(0, 4000);

    const metodoPagoRaw = o.metodo_pago;
    const metodoPago =
      metodoPagoRaw === "efectivo" || metodoPagoRaw === "tarjeta" || metodoPagoRaw === "transferencia"
        ? metodoPagoRaw
        : null;

    const subtotalDeclarado = Number(o.subtotal);
    const montoIvaDeclarado = Number(o.monto_iva);
    const totalDeclarado = Number(o.total);

    if ([subtotalDeclarado, montoIvaDeclarado, totalDeclarado].some((n) => Number.isNaN(n))) {
      return NextResponse.json(errorResponse("Totales inválidos."), { status: 400 });
    }

    if (moneda === "USD" && tipoCambio <= 0) {
      return NextResponse.json(errorResponse("Tipo de cambio inválido para USD."), { status: 400 });
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    // Sucursal efectiva de la venta:
    //   1) si el usuario tiene sucursal fijada, esa manda.
    //   2) sino (admin global), usar la sucursal de la caja abierta actual
    //      (si el admin abrio caja en Sucursal 2, las ventas van a Sucursal 2).
    //   3) fallback a Principal.
    let sucursalId = auth.sucursal_id ?? null;
    if (!sucursalId) {
      const sb0 = createServiceRoleClientWithDbSchema(schema);
      const { data: cajaAbierta } = await sb0
        .from("cajas")
        .select("sucursal_id")
        .eq("empresa_id", auth.empresa_id)
        .eq("estado", "abierta")
        .not("sucursal_id", "is", null)
        .order("fecha_apertura", { ascending: false })
        .limit(1)
        .maybeSingle();
      sucursalId = (cajaAbierta as { sucursal_id?: string } | null)?.sucursal_id ?? null;
    }
    if (!sucursalId) {
      sucursalId = await resolveSucursalIdForUserPg(
        schema,
        auth.empresa_id,
        null,
      );
    }

    const { ventaId, numeroControl, fechaIso } = await createVentaTransaccionalPg({
      schema,
      empresaId: auth.empresa_id,
      clienteId,
      observaciones,
      moneda,
      tipoCambio,
      tipoVenta,
      plazoDias: Number.isFinite(plazoDias as number) ? plazoDias : null,
      items,
      subtotalDeclarado,
      montoIvaDeclarado,
      totalDeclarado,
      metodoPago,
      sucursalId,
    });

    let sub = 0;
    let iv = 0;
    let tot = 0;
    for (const it of items) {
      sub += it.subtotal;
      iv += it.monto_iva;
      tot += it.total_linea;
    }

    const venta = toVentaResponse(items, {
      id: ventaId,
      numero_control: numeroControl,
      fechaIso,
      moneda,
      tipo_cambio: tipoCambio,
      tipo_venta: tipoVenta,
      plazo_dias: tipoVenta === "CREDITO" ? plazoDias ?? undefined : undefined,
      subtotal: sub,
      monto_iva: iv,
      total: tot,
    });

    // Si la venta facturó un pedido del salón (módulo Consulta), marcarlo como
    // facturado. Best-effort: si falla, la venta ya está creada — solo logueamos.
    const pedidoCajaIdRaw = o.pedido_caja_id;
    const pedidoCajaId =
      pedidoCajaIdRaw == null || pedidoCajaIdRaw === "" ? null : String(pedidoCajaIdRaw);
    if (pedidoCajaId) {
      try {
        const sb = createServiceRoleClientWithDbSchema(schema);
        await marcarPedidoFacturado(sb, auth.empresa_id, pedidoCajaId, ventaId, numeroControl);
      } catch (e) {
        console.error("[diag-venta] marcarPedidoFacturado falló", e);
      }
    }

    console.log(`[diag-venta] success numero=${numeroControl} total=${tot} ms=${Date.now() - t0}`);
    return NextResponse.json(successResponse({ venta }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear la venta.";
    const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 3).join(" | ") : "";
    console.error(`[diag-venta] FAIL msg="${msg}" stack=${stack} ms=${Date.now() - t0}`);
    const status =
      msg.includes("Stock insuficiente") ||
      msg.includes("no existen") ||
      msg.includes("Cliente no encontrado") ||
      msg.includes("Totales no coinciden") ||
      msg.includes("al menos un")
        ? 400
        : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
