/**
 * POST /api/productos/generar-sku
 *
 * Genera atómicamente el próximo SKU disponible con formato `PREFIJO_####`
 * para la empresa del usuario logueado. Independiente del generador de
 * código de barras interno (`/api/productos/codigo-interno`) que sigue
 * operando sin cambios.
 *
 * Body opcional:
 *   { "prefijo": "ELE_PER" }   // default: ELE_PER
 *
 * Respuesta OK:
 *   { "success": true, "data": { "sku": "ELE_PER_0022" } }
 *
 * Transporte: PostgREST HTTPS → RPC elevate.generar_sku_producto
 * (SECURITY DEFINER + GRANT EXECUTE TO authenticated). No usa pg pool.
 *
 * Seguridad:
 *   - Requiere JWT del usuario.
 *   - Empresa derivada del contexto, no del body.
 *   - Prefijo validado en cliente (regex) y nuevamente en la RPC (CHECK).
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { postgrestRpc, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const DEFAULT_PREFIJO = "ELE_PER";
const PREFIJO_RE = /^[A-Z0-9_]{1,16}$/;

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const body = (await request.json().catch(() => ({}))) as { prefijo?: unknown };
    const prefijoRaw =
      typeof body.prefijo === "string" && body.prefijo.trim()
        ? body.prefijo.trim().toUpperCase()
        : DEFAULT_PREFIJO;
    if (!PREFIJO_RE.test(prefijoRaw)) {
      return NextResponse.json(
        errorResponse("Prefijo inválido. Solo A-Z, 0-9 y guion bajo (máx 16 chars)."),
        { status: 400 }
      );
    }

    const r = await postgrestRpc<string>(
      "generar_sku_producto",
      { p_empresa_id: empresaId, p_prefijo: prefijoRaw },
      { role: "jwt", jwt }
    );

    if (!r.ok) {
      console.error("[/api/productos/generar-sku]", r.error);
      const detalle = [
        r.error.status ? `status=${r.error.status}` : null,
        r.error.code ? `code=${r.error.code}` : null,
        r.error.message ? `msg=${r.error.message.slice(0, 160)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return NextResponse.json(
        errorResponse(`No se pudo generar el SKU.${detalle ? ` (${detalle})` : ""}`),
        { status: 502 }
      );
    }

    const raw = r.rows[0];
    const sku = typeof raw === "string" ? raw.trim() : "";
    if (!sku) {
      return NextResponse.json(
        errorResponse("La RPC devolvió un valor vacío."),
        { status: 502 }
      );
    }
    return NextResponse.json(successResponse({ sku }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/productos/generar-sku] outer", msg);
    return NextResponse.json(
      errorResponse(`No se pudo generar el SKU. (${msg.slice(0, 160)})`),
      { status: 500 }
    );
  }
}
