import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type {
  ComprasReporte,
  CompraReporteRow,
  ItemCompradoRow,
  CompraProveedorTotal,
  CompraProductoTotal,
} from "@/lib/reportes/types";

export const dynamic = "force-dynamic";

type CompraRow = {
  id: string;
  numero_control: string | null;
  fecha: string;
  proveedor_nombre: string | null;
  producto_nombre: string | null;
  cantidad: number | string;
  costo_unitario: number | string;
  subtotal: number | string;
  monto_iva: number | string;
  total: number | string;
  tipo_pago: string | null;
  nro_timbrado: string | null;
  estado: string | null;
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
    // PostgREST admite doble filtro sobre la misma columna repitiendo la clave:
    const qs =
      `select=id,numero_control,fecha,proveedor_nombre,producto_nombre,cantidad,costo_unitario,` +
      `subtotal,monto_iva,total,tipo_pago,nro_timbrado,estado` +
      `&empresa_id=eq.${encodeURIComponent(empresaId)}` +
      `&fecha=gte.${encodeURIComponent(range.desde)}` +
      `&fecha=lt.${encodeURIComponent(range.hasta)}` +
      `&order=fecha.desc&limit=5000`;

    const r = await postgrestGet<CompraRow>("compras", qs, { role: "jwt", jwt, noStore: true });
    if (!r.ok) {
      console.error("[/api/reportes/compras]", r.error);
      return NextResponse.json(errorResponse("No se pudo cargar el reporte de compras."), { status: 502 });
    }
    const rows = (r.rows ?? []).filter((row) => (row.estado ?? "activa") !== "anulada");

    // Items: una fila por linea de compra.
    const items: ItemCompradoRow[] = rows.map((row) => ({
      numero_control: row.numero_control ?? "",
      fecha: row.fecha,
      proveedor_nombre: row.proveedor_nombre ?? "",
      producto_nombre: row.producto_nombre ?? "",
      cantidad: num(row.cantidad),
      costo_unitario: num(row.costo_unitario),
      total_linea: num(row.total),
    }));

    // Agrupar por numero_control para las cabeceras de "compras".
    const byNC = new Map<string, CompraReporteRow>();
    for (const row of rows) {
      const nc = row.numero_control ?? row.id;
      const prev = byNC.get(nc);
      if (!prev) {
        byNC.set(nc, {
          numero_control: nc,
          fecha: row.fecha,
          proveedor_nombre: row.proveedor_nombre ?? "",
          items_count: 1,
          subtotal: num(row.subtotal),
          monto_iva: num(row.monto_iva),
          total: num(row.total),
          tipo_pago: row.tipo_pago ?? "contado",
          nro_timbrado: row.nro_timbrado,
          tiene_comprobante: !!row.nro_timbrado,
        });
      } else {
        prev.items_count += 1;
        prev.subtotal += num(row.subtotal);
        prev.monto_iva += num(row.monto_iva);
        prev.total += num(row.total);
        if (row.nro_timbrado) prev.tiene_comprobante = true;
      }
    }
    const compras = Array.from(byNC.values()).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    const totalComprado = compras.reduce((s, c) => s + c.total, 0);
    const cantidad = compras.length;
    const cantidadItems = items.length;

    // Compra mas alta (por total de cabecera).
    const compraMasAlta = compras.reduce<CompraReporteRow | null>(
      (max, c) => (!max || c.total > max.total ? c : max),
      null,
    );

    // Por proveedor.
    const provMap = new Map<string, { compras: Set<string>; total: number }>();
    for (const c of compras) {
      const key = c.proveedor_nombre || "(sin nombre)";
      const bag = provMap.get(key) ?? { compras: new Set(), total: 0 };
      bag.compras.add(c.numero_control);
      bag.total += c.total;
      provMap.set(key, bag);
    }
    const porProveedor: CompraProveedorTotal[] = Array.from(provMap.entries())
      .map(([proveedor_nombre, v]) => ({
        proveedor_nombre,
        compras: v.compras.size,
        total: v.total,
      }))
      .sort((a, b) => b.total - a.total);

    // Por producto.
    const prodMap = new Map<string, { cantidad: number; gasto: number }>();
    for (const it of items) {
      const key = it.producto_nombre || "(sin nombre)";
      const bag = prodMap.get(key) ?? { cantidad: 0, gasto: 0 };
      bag.cantidad += it.cantidad;
      bag.gasto += it.total_linea;
      prodMap.set(key, bag);
    }
    const porProducto: CompraProductoTotal[] = Array.from(prodMap.entries())
      .map(([producto_nombre, v]) => ({ producto_nombre, cantidad: v.cantidad, gasto: v.gasto }))
      .sort((a, b) => b.gasto - a.gasto);

    const proveedorMayor = porProveedor[0]
      ? { proveedor_nombre: porProveedor[0].proveedor_nombre, total: porProveedor[0].total }
      : null;
    const productoMasComprado = porProducto.slice().sort((a, b) => b.cantidad - a.cantidad)[0]
      ? {
          producto_nombre: porProducto.slice().sort((a, b) => b.cantidad - a.cantidad)[0].producto_nombre,
          cantidad: porProducto.slice().sort((a, b) => b.cantidad - a.cantidad)[0].cantidad,
        }
      : null;
    const productoMayorGasto = porProducto[0]
      ? { producto_nombre: porProducto[0].producto_nombre, gasto: porProducto[0].gasto }
      : null;

    const reporte: ComprasReporte = {
      mes,
      totalComprado,
      cantidad,
      cantidadItems,
      compraMasAlta: compraMasAlta
        ? {
            numero_control: compraMasAlta.numero_control,
            proveedor_nombre: compraMasAlta.proveedor_nombre,
            total: compraMasAlta.total,
          }
        : null,
      proveedorMayor,
      productoMasComprado,
      productoMayorGasto,
      porProveedor,
      porProducto,
      compras,
      items,
    };

    return NextResponse.json(successResponse(reporte));
  } catch (err) {
    console.error("[/api/reportes/compras] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el reporte de compras."), { status: 500 });
  }
}
