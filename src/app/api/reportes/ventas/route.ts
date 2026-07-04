import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type {
  VentasReporte,
  VentaReporteRow,
  ItemVendidoRow,
  VentaProductoTotal,
  VentaTipoPrecioTotal,
  TipoPrecioReporte,
} from "@/lib/reportes/types";

export const dynamic = "force-dynamic";

type VentaHeader = {
  id: string;
  numero_control: string | null;
  fecha: string;
  cliente_id: string | null;
  metodo_pago: string | null;
  total: number | string;
  estado: string | null;
};

type VentaItem = {
  venta_id: string;
  producto_nombre: string | null;
  cantidad: number | string;
  precio_venta: number | string;
  subtotal: number | string;
  monto_iva: number | string;
  total_linea: number | string;
};

function monthRange(mes: string): { desde: string; hasta: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const desde = `${m[1]}-${m[2]}-01`;
  const nextY = mo === 12 ? y + 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const hasta = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
  return { desde, hasta };
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    const mes = new URL(request.url).searchParams.get("mes") ?? "";
    const range = monthRange(mes);
    if (!range) {
      return NextResponse.json(errorResponse("Parametro 'mes' invalido (YYYY-MM)."), { status: 400 });
    }

    const jwt = await getAccessTokenForRequest(request);

    // 1) Cabeceras
    const qsHead =
      `select=id,numero_control,fecha,cliente_id,metodo_pago,total,estado` +
      `&empresa_id=eq.${encodeURIComponent(empresaId)}` +
      `&fecha=gte.${encodeURIComponent(range.desde)}` +
      `&fecha=lt.${encodeURIComponent(range.hasta)}` +
      `&order=fecha.desc&limit=5000`;
    const rHead = await postgrestGet<VentaHeader>("ventas", qsHead, { role: "jwt", jwt, noStore: true });
    if (!rHead.ok) {
      console.error("[/api/reportes/ventas][ventas]", rHead.error);
      return NextResponse.json(errorResponse("No se pudo cargar el reporte de ventas."), { status: 502 });
    }
    const cabeceras = (rHead.rows ?? []).filter((v) => (v.estado ?? "activa") !== "anulada");

    // 2) Items del mes: filtrar por venta_id in.(...)
    const ids = cabeceras.map((v) => v.id);
    let items: VentaItem[] = [];
    if (ids.length > 0) {
      // PostgREST admite in.(a,b,c). UUIDs no requieren quoting.
      const qsIt =
        `select=venta_id,producto_nombre,cantidad,precio_venta,subtotal,monto_iva,total_linea` +
        `&empresa_id=eq.${encodeURIComponent(empresaId)}` +
        `&venta_id=in.(${ids.join(",")})` +
        `&limit=20000`;
      const rIt = await postgrestGet<VentaItem>("ventas_items", qsIt, { role: "jwt", jwt, noStore: true });
      if (!rIt.ok) {
        console.error("[/api/reportes/ventas][ventas_items]", rIt.error);
      } else {
        items = rIt.rows ?? [];
      }
    }

    // Contar items por venta_id.
    const itemsByVenta = new Map<string, VentaItem[]>();
    for (const it of items) {
      const arr = itemsByVenta.get(it.venta_id) ?? [];
      arr.push(it);
      itemsByVenta.set(it.venta_id, arr);
    }

    // Mapear cabeceras al formato del reporte.
    const ventas: VentaReporteRow[] = cabeceras.map((v) => ({
      id: v.id,
      numero_control: v.numero_control ?? "",
      fecha: v.fecha,
      cliente: null, // no resolvemos join aqui (opcional)
      metodo_pago: v.metodo_pago,
      items_count: itemsByVenta.get(v.id)?.length ?? 0,
      total: num(v.total),
    }));

    // Lineas planas.
    const numeroByVenta = new Map(cabeceras.map((v) => [v.id, v.numero_control ?? ""]));
    const fechaByVenta = new Map(cabeceras.map((v) => [v.id, v.fecha]));
    const itemsRep: ItemVendidoRow[] = items.map((it) => ({
      numero_control: numeroByVenta.get(it.venta_id) ?? "",
      fecha: fechaByVenta.get(it.venta_id) ?? "",
      producto_nombre: it.producto_nombre ?? "",
      cantidad: num(it.cantidad),
      precio_venta: num(it.precio_venta),
      subtotal: num(it.subtotal),
      monto_iva: num(it.monto_iva),
      total_linea: num(it.total_linea),
      tipo_precio: "minorista", // ventas_items no tiene tipo_precio en este schema
    }));

    const totalVendido = ventas.reduce((s, v) => s + v.total, 0);
    const cantidadVentas = ventas.length;
    const cantidadItems = itemsRep.length;
    const unidadesVendidas = itemsRep.reduce((s, it) => s + it.cantidad, 0);
    const ticketPromedio = cantidadVentas ? totalVendido / cantidadVentas : 0;

    const porTipoPrecio: Record<TipoPrecioReporte, VentaTipoPrecioTotal> = {
      minorista: { items: cantidadItems, total: itemsRep.reduce((s, it) => s + it.total_linea, 0) },
      mayorista: { items: 0, total: 0 },
      distribuidor: { items: 0, total: 0 },
      costo: { items: 0, total: 0 },
    };

    const prodMap = new Map<string, { cantidad: number; total: number }>();
    for (const it of itemsRep) {
      const key = it.producto_nombre || "(sin nombre)";
      const bag = prodMap.get(key) ?? { cantidad: 0, total: 0 };
      bag.cantidad += it.cantidad;
      bag.total += it.total_linea;
      prodMap.set(key, bag);
    }
    const porProducto: VentaProductoTotal[] = Array.from(prodMap.entries())
      .map(([producto_nombre, v]) => ({ producto_nombre, cantidad: v.cantidad, total: v.total }))
      .sort((a, b) => b.total - a.total);

    const reporte: VentasReporte = {
      mes,
      totalVendido,
      cantidadVentas,
      cantidadItems,
      ticketPromedio,
      unidadesVendidas,
      porTipoPrecio,
      porProducto,
      ventas,
      items: itemsRep,
    };

    return NextResponse.json(successResponse(reporte));
  } catch (err) {
    console.error("[/api/reportes/ventas] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el reporte de ventas."), { status: 500 });
  }
}
