/**
 * GET /api/inventario/imagenes-principales
 *
 * Devuelve la imagen principal (o la de menor `orden` si no hay marcada) de
 * cada producto de la empresa, leyendo de `producto_imagenes` (galería —
 * misma tabla que usa el catálogo web).
 *
 * Response: { items: { producto_id, imagen_url, imagen_path }[] }
 *
 * Pensado para la lista del ERP: en una sola request trae las miniaturas
 * de todos los productos sin hacer N llamadas a /api/productos/[id]/imagenes.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { publicProductoImagenUrl } from "@/lib/inventario/imagen-storage";

export const dynamic = "force-dynamic";

type Row = {
  producto_id: string;
  imagen_url: string | null;
  imagen_path: string | null;
  es_principal: boolean | null;
  orden: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const jwt = await getAccessTokenForRequest(request);
    const qs = new URLSearchParams({
      select: "producto_id,imagen_url,imagen_path,es_principal,orden",
      empresa_id: `eq.${ctx.auth.empresa_id}`,
      // Ordenamos por es_principal DESC (true primero) y luego orden ASC para
      // poder quedarnos con la primera ocurrencia por producto_id (la "mejor").
      order: "producto_id.asc,es_principal.desc,orden.asc",
      limit: "5000",
    });
    const r = await postgrestGet<Row>("producto_imagenes", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/inventario/imagenes-principales]", r.error);
      return NextResponse.json(errorResponse("No se pudo cargar las imágenes."), { status: 502 });
    }

    // Primera ocurrencia por producto_id == la principal/mejor (gracias al order).
    const seen = new Set<string>();
    const items: { producto_id: string; imagen_url: string | null }[] = [];
    for (const row of r.rows) {
      if (seen.has(row.producto_id)) continue;
      seen.add(row.producto_id);
      const url = row.imagen_url ?? publicProductoImagenUrl(row.imagen_path);
      if (!url) continue;
      items.push({ producto_id: row.producto_id, imagen_url: url });
    }

    return NextResponse.json(successResponse({ items }));
  } catch (err) {
    console.error("[/api/inventario/imagenes-principales] outer", err);
    return NextResponse.json(errorResponse("No se pudo cargar las imágenes."), { status: 500 });
  }
}
