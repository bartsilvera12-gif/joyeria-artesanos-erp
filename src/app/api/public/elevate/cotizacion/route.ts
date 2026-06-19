/**
 * GET /api/public/elevate/cotizacion
 *
 * Cotización USD/PYG vigente para la web pública Elevate. Lee desde la view
 * `elevate.cotizacion_dolar_actual` (DISTINCT ON empresa_id, la más reciente).
 *
 * Instancia monocliente: la view devuelve a lo sumo una fila. Si la tabla
 * está vacía → 200 { cotizacion: null } y la web omite el USD. Nunca 4xx por
 * ausencia de cotización.
 *
 * Exposición: solo columnas seguras (cotizacion, vigente_desde, id). No
 * empresa_id, no notas, no creado_por.
 */
import { NextRequest, NextResponse } from "next/server";
import { elevatePublicCorsHeaders, PUBLIC_CATALOG_CACHE } from "@/lib/public-api/cors";
import { postgrestGet } from "@/lib/elevate-public/catalog-postgrest";

type CotizacionViewRow = {
  id: string;
  cotizacion: string | number;
  vigente_desde: string;
};

export type CotizacionPublica = {
  id: string;
  cotizacion: number;
  vigente_desde: string;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: elevatePublicCorsHeaders() });
}

export async function GET(_request: NextRequest) {
  try {
    const qs = new URLSearchParams({
      select: "id,cotizacion,vigente_desde",
      order: "vigente_desde.desc",
      limit: "1",
    });
    const result = await postgrestGet<CotizacionViewRow>(
      "cotizacion_dolar_actual",
      qs.toString()
    );
    if (!result.ok) {
      console.error("[/api/public/elevate/cotizacion GET]", result.error);
      // Degradación silenciosa: la web no muestra USD si no hay cotización.
      return NextResponse.json(
        { cotizacion: null },
        { status: 200, headers: { ...elevatePublicCorsHeaders(), ...PUBLIC_CATALOG_CACHE } }
      );
    }
    const row = result.rows[0];
    if (!row) {
      return NextResponse.json(
        { cotizacion: null },
        { status: 200, headers: { ...elevatePublicCorsHeaders(), ...PUBLIC_CATALOG_CACHE } }
      );
    }
    const valor = Number(row.cotizacion);
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json(
        { cotizacion: null },
        { status: 200, headers: { ...elevatePublicCorsHeaders(), ...PUBLIC_CATALOG_CACHE } }
      );
    }
    const cotizacion: CotizacionPublica = {
      id: row.id,
      cotizacion: valor,
      vigente_desde: row.vigente_desde,
    };
    return NextResponse.json(
      { cotizacion },
      { status: 200, headers: { ...elevatePublicCorsHeaders(), ...PUBLIC_CATALOG_CACHE } }
    );
  } catch (err) {
    console.error(
      "[/api/public/elevate/cotizacion GET] outer",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { cotizacion: null },
      { status: 200, headers: { ...elevatePublicCorsHeaders(), ...PUBLIC_CATALOG_CACHE } }
    );
  }
}
