import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { Venta, LineaVenta, TipoIvaVenta } from "@/lib/ventas/types";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";

interface VentaRow {
  id: string;
  empresa_id: string;
  numero_control: string;
  moneda: string;
  tipo_cambio: number | string;
  subtotal: number | string;
  monto_iva: number | string;
  total: number | string;
  tipo_venta: string;
  plazo_dias: number | null;
  fecha: string;
  sucursal_id?: string | null;
  sucursal?: { nombre?: string | null } | null;
}

interface VentaItemRow {
  venta_id: string;
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number | string;
  precio_venta_original: number | string;
  precio_venta: number | string;
  tipo_iva: string;
  subtotal: number | string;
  monto_iva: number | string;
  total_linea: number | string;
  es_sin_cargo: boolean | null;
  motivo_sin_cargo: string | null;
  costo_promocional_total: number | string | null;
}

function num(v: number | string): number {
  return typeof v === "number" ? v : Number(v);
}

function mapItems(rows: VentaItemRow[]): LineaVenta[] {
  return rows.map((r) => ({
    producto_id: r.producto_id,
    producto_nombre: r.producto_nombre,
    sku: r.sku,
    cantidad: num(r.cantidad),
    precio_venta_original: num(r.precio_venta_original),
    precio_venta: num(r.precio_venta),
    tipo_iva: r.tipo_iva as TipoIvaVenta,
    subtotal: num(r.subtotal),
    monto_iva: num(r.monto_iva),
    total_linea: num(r.total_linea),
    es_sin_cargo: r.es_sin_cargo === true,
    motivo_sin_cargo: r.motivo_sin_cargo ?? null,
    costo_promocional_total:
      r.costo_promocional_total == null ? null : num(r.costo_promocional_total),
  }));
}

/**
 * GET /api/ventas — listado vía PostgREST HTTPS (JWT). 2 queries
 * secuenciales (ventas + items) y join en app, igual contrato que antes.
 */
// VENTAS_COLS_BASE = columnas siempre presentes.
// sucursal_id + relación a sucursales son best-effort: si el schema no las
// tiene (deploys que no son Joyería) se reintenta sin esas columnas.
const VENTAS_COLS_BASE = "id,empresa_id,numero_control,moneda,tipo_cambio,subtotal,monto_iva,total,tipo_venta,plazo_dias,fecha";
const VENTAS_COLS_CON_SUCURSAL = `${VENTAS_COLS_BASE},sucursal_id,sucursal:sucursal_id(nombre)`;
const VENTAS_ITEMS_COLS = "venta_id,producto_id,producto_nombre,sku,cantidad,precio_venta_original,precio_venta,tipo_iva,subtotal,monto_iva,total_linea,es_sin_cargo,motivo_sin_cargo,costo_promocional_total";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const ventasQ = new URLSearchParams({
      select: VENTAS_COLS_CON_SUCURSAL,
      empresa_id: `eq.${empresaId}`,
      order: "fecha.desc",
      limit: "500",
    });
    let ventasRes = await postgrestGet<VentaRow>("ventas", ventasQ.toString(), { role: "jwt", jwt, noStore: true });
    if (!ventasRes.ok) {
      // Fallback para schemas sin sucursal_id/sucursales (deploys Elevate).
      const fallback = new URLSearchParams({
        select: VENTAS_COLS_BASE,
        empresa_id: `eq.${empresaId}`,
        order: "fecha.desc",
        limit: "500",
      });
      ventasRes = await postgrestGet<VentaRow>("ventas", fallback.toString(), { role: "jwt", jwt, noStore: true });
      if (!ventasRes.ok) {
        console.error("[/api/ventas GET] ventas", ventasRes.error);
        return NextResponse.json(errorResponse("No se pudieron cargar las ventas."), { status: 502 });
      }
    }

    const itemsQ = new URLSearchParams({
      select: VENTAS_ITEMS_COLS,
      empresa_id: `eq.${empresaId}`,
    });
    const itemsRes = await postgrestGet<VentaItemRow>("ventas_items", itemsQ.toString(), { role: "jwt", jwt, noStore: true });
    if (!itemsRes.ok) {
      console.error("[/api/ventas GET] items", itemsRes.error);
      return NextResponse.json(errorResponse("No se pudieron cargar las ventas."), { status: 502 });
    }

    const byVenta = new Map<string, VentaItemRow[]>();
    for (const row of itemsRes.rows) {
      const list = byVenta.get(row.venta_id) ?? [];
      list.push(row);
      byVenta.set(row.venta_id, list);
    }

    const ventas: Venta[] = ventasRes.rows.map((r) => {
      const lineRows = byVenta.get(r.id) ?? [];
      return {
        id: r.id,
        numero_control: r.numero_control,
        items: mapItems(lineRows),
        moneda: r.moneda === "USD" ? "USD" : "GS",
        tipo_cambio: num(r.tipo_cambio),
        subtotal: num(r.subtotal),
        monto_iva: num(r.monto_iva),
        total: num(r.total),
        tipo_venta: r.tipo_venta === "CREDITO" ? "CREDITO" : "CONTADO",
        plazo_dias: r.plazo_dias ?? undefined,
        fecha: r.fecha,
        sucursal_id: r.sucursal_id ?? null,
        sucursal_nombre: r.sucursal?.nombre ?? null,
      };
    });

    return NextResponse.json(successResponse({ ventas }));
  } catch (err) {
    console.error("[/api/ventas GET] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las ventas."), { status: 500 });
  }
}
