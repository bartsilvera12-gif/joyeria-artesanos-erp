/**
 * GET  /api/productos/[id]/presentaciones  — lista de presentaciones del producto.
 * POST /api/productos/[id]/presentaciones  — crea presentación.
 *
 * Auth: JWT del usuario. RLS de elevate.producto_presentaciones cubre por empresa.
 * Al crear la primera presentación, marca productos.tiene_presentaciones=true.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import {
  getAccessTokenForRequest,
  postgrestGet,
  postgrestRequest,
} from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getProductoPostgrest, updateProductoPostgrest } from "@/lib/inventario/server/productos-postgrest";

const SELECT_COLS =
  "id,empresa_id,producto_id,sku,codigo_barras,codigo_barras_interno,volumen_ml," +
  "costo_promedio,precio_venta,precio_web,precio_oferta,oferta_hasta," +
  "precio_mayorista,cantidad_minima_mayorista,visible_mayorista_web," +
  "stock_actual,stock_minimo,imagen_path,imagen_url,visible_web,activo,orden," +
  "created_at,updated_at";

type PresentacionRow = Record<string, unknown> & { id: string };

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildInsertBody(empresaId: string, productoId: string, body: Record<string, unknown>) {
  const volumen = num(body.volumen_ml);
  if (volumen == null || volumen <= 0) {
    throw new Error("volumen_ml debe ser > 0");
  }
  const sku = typeof body.sku === "string" ? body.sku.trim().toUpperCase() : "";
  if (!sku) throw new Error("sku obligatorio");
  const visibleWeb = body.visible_web === false ? false : true;
  const activo = body.activo === false ? false : true;
  if (visibleWeb && !activo) {
    throw new Error("Una presentación inactiva no puede estar visible en la web");
  }
  const out: Record<string, unknown> = {
    empresa_id: empresaId,
    producto_id: productoId,
    sku,
    codigo_barras:
      typeof body.codigo_barras === "string" && body.codigo_barras.trim()
        ? body.codigo_barras.trim()
        : null,
    codigo_barras_interno: body.codigo_barras_interno === true,
    volumen_ml: volumen,
    costo_promedio: num(body.costo_promedio) ?? 0,
    precio_venta: num(body.precio_venta) ?? 0,
    precio_web: num(body.precio_web),
    precio_oferta: num(body.precio_oferta),
    oferta_hasta:
      typeof body.oferta_hasta === "string" && body.oferta_hasta.trim()
        ? body.oferta_hasta.trim()
        : null,
    precio_mayorista: num(body.precio_mayorista),
    cantidad_minima_mayorista: (() => {
      const v = num(body.cantidad_minima_mayorista);
      return v == null ? null : Math.max(1, Math.floor(v));
    })(),
    visible_mayorista_web: body.visible_mayorista_web === true,
    stock_actual: num(body.stock_actual) ?? 0,
    stock_minimo: num(body.stock_minimo) ?? 0,
    imagen_path:
      typeof body.imagen_path === "string" && body.imagen_path.trim()
        ? body.imagen_path.trim()
        : null,
    imagen_url:
      typeof body.imagen_url === "string" && body.imagen_url.trim()
        ? body.imagen_url.trim()
        : null,
    visible_web: visibleWeb,
    activo,
    orden: (() => {
      const v = num(body.orden);
      return v == null ? 0 : Math.floor(v);
    })(),
  };
  // No-negatives defensa cliente.
  for (const k of ["costo_promedio", "precio_venta", "stock_actual", "stock_minimo"] as const) {
    if (typeof out[k] === "number" && (out[k] as number) < 0) {
      throw new Error(`${k} no puede ser negativo`);
    }
  }
  if (out.visible_mayorista_web === true) {
    if (
      out.precio_mayorista == null ||
      (out.precio_mayorista as number) <= 0 ||
      out.cantidad_minima_mayorista == null ||
      (out.cantidad_minima_mayorista as number) < 1
    ) {
      throw new Error(
        "Para mostrar mayorista en la web cargá precio > 0 y cantidad mínima >= 1"
      );
    }
  }
  return out;
}

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const jwt = await getAccessTokenForRequest(request);
    const qs = new URLSearchParams({
      select: SELECT_COLS,
      producto_id: `eq.${productoId}`,
      empresa_id: `eq.${ctx.auth.empresa_id}`,
      order: "orden.asc,volumen_ml.asc",
      limit: "50",
    });
    const r = await postgrestGet<PresentacionRow>("producto_presentaciones", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/productos/[id]/presentaciones GET]", r.error);
      return NextResponse.json(errorResponse("No se pudo cargar las presentaciones."), {
        status: 502,
      });
    }
    return NextResponse.json(successResponse({ presentaciones: r.rows }));
  } catch (err) {
    console.error("[/api/productos/[id]/presentaciones GET] outer", err);
    return NextResponse.json(errorResponse("Error al cargar presentaciones."), { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    // 1) Ownership del producto.
    const prod = await getProductoPostgrest(jwt, empresaId, productoId);
    if (!prod) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    // 2) Validar body.
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }
    let insertBody: Record<string, unknown>;
    try {
      insertBody = buildInsertBody(empresaId, productoId, body);
    } catch (e) {
      return NextResponse.json(
        errorResponse(e instanceof Error ? e.message : "Validación fallida"),
        { status: 400 }
      );
    }

    // 3) Insert.
    const r = await postgrestRequest<PresentacionRow>(
      "producto_presentaciones",
      `select=${SELECT_COLS}`,
      {
        method: "POST",
        role: "jwt",
        jwt,
        body: insertBody,
        prefer: "return=representation",
      }
    );
    if (!r.ok) {
      if (r.error.code === "23505") {
        const msg = (r.error.message ?? "").toLowerCase();
        const dup = msg.includes("sku")
          ? "Ya existe una presentación con ese SKU en esta empresa."
          : msg.includes("volumen")
            ? "Ya existe una presentación de ese volumen para este producto."
            : "Conflicto de unicidad en la presentación.";
        return NextResponse.json(errorResponse(dup), { status: 409 });
      }
      console.error("[/api/productos/[id]/presentaciones POST]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo crear la presentación. (${(r.error.message ?? "").slice(0, 140)})`),
        { status: 502 }
      );
    }

    // 4) Si era la primera, marcar productos.tiene_presentaciones=true.
    if (!prod.tiene_presentaciones) {
      try {
        await updateProductoPostgrest(jwt, empresaId, productoId, {
          tiene_presentaciones: true,
        });
      } catch (e) {
        console.warn("[presentaciones POST] no se pudo setear tiene_presentaciones", e);
      }
    }

    return NextResponse.json(successResponse({ presentacion: r.rows[0] }), { status: 201 });
  } catch (err) {
    console.error("[/api/productos/[id]/presentaciones POST] outer", err);
    return NextResponse.json(errorResponse("Error al crear presentación."), { status: 500 });
  }
}
