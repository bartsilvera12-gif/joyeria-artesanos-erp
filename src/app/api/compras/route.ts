import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { insertCompraConImpacto } from "@/lib/compras/server/compras-pg";
import { resolveSucursalIdForUserPg } from "@/lib/sucursales/server";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";

const COMPRAS_COLS =
  "id,empresa_id,proveedor_id,proveedor_nombre,producto_id,producto_nombre," +
  "cantidad,moneda,tipo_cambio,costo_unitario_original,costo_unitario," +
  "iva_tipo,subtotal,monto_iva,total,precio_venta,margen_venta,tipo_pago,plazo_dias," +
  "nro_timbrado,numero_control,estado,fecha,created_at,updated_at,created_by,usuario_nombre";

/**
 * GET /api/compras — listado vía PostgREST HTTPS (JWT).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);
    const qs = new URLSearchParams({
      select: COMPRAS_COLS,
      empresa_id: `eq.${empresaId}`,
      order: "fecha.desc",
      limit: "1000",
    });
    const r = await postgrestGet<Record<string, unknown>>("compras", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/compras GET]", r.error);
      return NextResponse.json(errorResponse("No se pudieron cargar las compras."), { status: 502 });
    }
    return NextResponse.json(successResponse({ compras: r.rows }));
  } catch (err) {
    console.error("[/api/compras GET] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las compras."), { status: 500 });
  }
}

/**
 * POST /api/compras — crea compra + movimiento ENTRADA + actualiza producto.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const req = (k: string) => body[k] != null && String(body[k]).trim() !== "";

    // Validaciones comunes (aplican al single-item legacy y al multi-item nuevo).
    if (!req("proveedor_id")) return NextResponse.json(errorResponse("Falta el proveedor."), { status: 400 });
    if (!req("nro_timbrado"))
      return NextResponse.json(errorResponse("Falta el N° de timbrado."), { status: 400 });

    // Detectar multi-item: si el body trae un array `items`, cada ítem es una
    // línea de la compra (mismo proveedor/timbrado/moneda/tipo_pago, distinto
    // producto).
    const itemsRaw = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : null;

    const sucursalId = await resolveSucursalIdForUserPg(
      schema,
      empresaId,
      ctx.auth.sucursal_id ?? null,
    );

    const moneda = body.moneda === "USD" ? "USD" : "PYG";
    const tipoCambio = Number(body.tipo_cambio) || 1;
    const tipoPago = body.tipo_pago === "credito" ? "credito" : "contado";
    const plazoDias =
      body.plazo_dias != null && String(body.plazo_dias).trim() !== ""
        ? parseInt(String(body.plazo_dias), 10) || null
        : null;
    const nroTimbrado = String(body.nro_timbrado).trim().toUpperCase();
    const proveedorId = String(body.proveedor_id);
    const proveedorNombre = String(body.proveedor_nombre ?? "");

    // Si vienen items: procesar cada uno como una compra independiente
    // (una fila por producto en la tabla compras, mismo proveedor).
    try {
      if (itemsRaw && itemsRaw.length > 0) {
        for (let i = 0; i < itemsRaw.length; i++) {
          const item = itemsRaw[i];
          if (!item.producto_id) {
            return NextResponse.json(
              errorResponse(`Ítem ${i + 1}: falta el producto.`),
              { status: 400 },
            );
          }
          if (!item.cantidad || Number(item.cantidad) <= 0) {
            return NextResponse.json(
              errorResponse(`Ítem ${i + 1}: la cantidad debe ser mayor a 0.`),
              { status: 400 },
            );
          }
          if (!item.costo_unitario || Number(item.costo_unitario) <= 0) {
            return NextResponse.json(
              errorResponse(`Ítem ${i + 1}: el costo unitario debe ser mayor a 0.`),
              { status: 400 },
            );
          }
          if (!item.precio_venta || Number(item.precio_venta) <= 0) {
            return NextResponse.json(
              errorResponse(`Ítem ${i + 1}: el precio de venta debe ser mayor a 0.`),
              { status: 400 },
            );
          }
        }

        const compras = [];
        const warnings: string[] = [];
        for (const item of itemsRaw) {
          const out = await insertCompraConImpacto(schema, empresaId, {
            proveedor_id: proveedorId,
            proveedor_nombre: proveedorNombre,
            producto_id: String(item.producto_id),
            producto_nombre: String(item.producto_nombre ?? ""),
            cantidad: Number(item.cantidad) || 0,
            moneda,
            tipo_cambio: tipoCambio,
            costo_unitario_original:
              Number(item.costo_unitario_original) || Number(item.costo_unitario) || 0,
            costo_unitario: Number(item.costo_unitario) || 0,
            iva_tipo: ["0", "5", "10"].includes(String(item.iva_tipo))
              ? String(item.iva_tipo)
              : "10",
            subtotal: Number(item.subtotal) || 0,
            monto_iva: Number(item.monto_iva) || 0,
            total: Number(item.total) || 0,
            precio_venta: Number(item.precio_venta) || 0,
            margen_venta: item.margen_venta != null ? Number(item.margen_venta) : null,
            tipo_pago: tipoPago,
            plazo_dias: plazoDias,
            nro_timbrado: nroTimbrado,
            created_by: ctx.auth.usuarioCatalogId ?? null,
            usuario_nombre: ctx.auth.user?.email ?? null,
          }, sucursalId);
          compras.push(out.compra);
          if (out.movimiento_warning) warnings.push(out.movimiento_warning);
        }
        return NextResponse.json(successResponse({
          numero_control: (compras[0] as { numero_control?: string })?.numero_control ?? null,
          compras,
          warning: warnings.length ? warnings.join(" | ") : null,
        }));
      }

      // Legacy single-item mode (backwards compat).
      if (!req("producto_id")) return NextResponse.json(errorResponse("Falta el producto."), { status: 400 });
      if (!req("cantidad") || Number(body.cantidad) <= 0)
        return NextResponse.json(errorResponse("La cantidad debe ser mayor a 0."), { status: 400 });
      if (!req("costo_unitario") || Number(body.costo_unitario) <= 0)
        return NextResponse.json(errorResponse("El costo unitario debe ser mayor a 0."), { status: 400 });
      if (!req("precio_venta") || Number(body.precio_venta) <= 0)
        return NextResponse.json(errorResponse("El precio de venta debe ser mayor a 0."), { status: 400 });

      const out = await insertCompraConImpacto(schema, empresaId, {
        proveedor_id: proveedorId,
        proveedor_nombre: proveedorNombre,
        producto_id: String(body.producto_id),
        producto_nombre: String(body.producto_nombre ?? ""),
        cantidad: Number(body.cantidad) || 0,
        moneda,
        tipo_cambio: tipoCambio,
        costo_unitario_original: Number(body.costo_unitario_original) || Number(body.costo_unitario) || 0,
        costo_unitario: Number(body.costo_unitario) || 0,
        iva_tipo: ["0", "5", "10"].includes(String(body.iva_tipo)) ? String(body.iva_tipo) : "10",
        subtotal: Number(body.subtotal) || 0,
        monto_iva: Number(body.monto_iva) || 0,
        total: Number(body.total) || 0,
        precio_venta: Number(body.precio_venta) || 0,
        margen_venta: body.margen_venta != null ? Number(body.margen_venta) : null,
        tipo_pago: tipoPago,
        plazo_dias: plazoDias,
        nro_timbrado: nroTimbrado,
        created_by: ctx.auth.usuarioCatalogId ?? null,
        usuario_nombre: ctx.auth.user?.email ?? null,
      }, sucursalId);

      return NextResponse.json(successResponse({
        compra: out.compra,
        movimiento_id: out.movimiento_id,
        warning: out.movimiento_warning,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const code = (e as { code?: string })?.code;
      const detail = (e as { detail?: string })?.detail;
      console.error("[/api/compras POST]", { schema, empresaId, msg, code, detail });
      if (code === "23503") {
        return NextResponse.json(
          errorResponse("Proveedor o producto inválido. Verificá los datos seleccionados."),
          { status: 400 }
        );
      }
      if (code === "23505") {
        return NextResponse.json(
          errorResponse("Conflicto al generar el número de control. Reintentá."),
          { status: 409 }
        );
      }
      return NextResponse.json(
        errorResponse("No se pudo guardar la compra. Revisá los datos e intentá nuevamente."),
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[/api/compras POST] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar la compra."), { status: 500 });
  }
}
