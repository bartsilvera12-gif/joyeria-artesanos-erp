import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { postgrestRpc, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** Prefijo de los códigos internos EAN-13 generados por el sistema. */
export const INTERNAL_EAN13_PREFIX = "20";

/**
 * POST /api/productos/codigo-interno
 *
 * Genera atómicamente un código de barras interno EAN-13 numérico (13
 * dígitos, checksum válido) con prefijo "20…" reservado para uso interno.
 *
 * Transporte: PostgREST HTTPS → RPC elevate.generar_codigo_producto_interno.
 * NO usa pg pool directo: el runtime Hostinger no tiene acceso al puerto 5432.
 *
 * Auth a PostgREST: JWT del usuario logueado. La RPC tiene
 *   GRANT EXECUTE … TO authenticated  y es SECURITY DEFINER, así que NO
 * dependemos de SUPABASE_SERVICE_ROLE_KEY en runtime (que puede no estar
 * presente en el entorno hPanel del frontend).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const r = await postgrestRpc<string>(
      "generar_codigo_producto_interno",
      { p_empresa_id: empresaId },
      { role: "jwt", jwt }
    );

    if (!r.ok) {
      console.error("[/api/productos/codigo-interno]", r.error);
      // Detalle sanitizado para diagnóstico en producción (sin secretos).
      const detalle = [
        r.error.status ? `status=${r.error.status}` : null,
        r.error.code ? `code=${r.error.code}` : null,
        r.error.message ? `msg=${r.error.message.slice(0, 160)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return NextResponse.json(
        errorResponse(
          `No se pudo generar el código interno. Intentá nuevamente.${
            detalle ? ` (${detalle})` : ""
          }`
        ),
        { status: 502 }
      );
    }

    const raw = r.rows[0];
    const codigo = typeof raw === "string" ? raw.trim() : "";
    if (!codigo) {
      return NextResponse.json(
        errorResponse("La RPC devolvió un valor vacío."),
        { status: 502 }
      );
    }

    return NextResponse.json(successResponse({ codigo, interno: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/productos/codigo-interno] outer", msg);
    return NextResponse.json(
      errorResponse(`No se pudo generar el código interno. (${msg.slice(0, 160)})`),
      { status: 500 }
    );
  }
}
