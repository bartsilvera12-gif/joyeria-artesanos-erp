/**
 * GET /api/public/elevate/pedidos/[numero]?token=...
 *
 * Endpoint público (sin auth) — consulta sanitizada de un pedido por número
 * + public_token. Llama a la RPC `elevate.consultar_pedido_web(numero, token)`
 * que devuelve sólo los datos seguros (sin internos sensibles).
 *
 * Si el token no coincide, la RPC devuelve NULL → respondemos 404 genérico
 * para no filtrar existencia de pedidos.
 */
import { NextRequest, NextResponse } from "next/server";
import { elevatePublicCorsHeaders, PUBLIC_CATALOG_CACHE } from "@/lib/public-api/cors";
import { postgrestRpc } from "@/lib/supabase/postgrest-runtime";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: elevatePublicCorsHeaders() });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ numero: string }> }
) {
  const { numero } = await context.params;
  const cleanNumero = (numero ?? "").trim();
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!cleanNumero || !token) {
    return NextResponse.json(
      { error: "Pedido no encontrado." },
      { status: 404, headers: elevatePublicCorsHeaders() }
    );
  }

  const r = await postgrestRpc<unknown>(
    "consultar_pedido_web",
    { p_numero: cleanNumero, p_token: token },
    { role: "anon" }
  );

  if (!r.ok) {
    console.error("[/api/public/elevate/pedidos/[numero]]", r.error);
    return NextResponse.json(
      { error: "No se pudo consultar el pedido." },
      { status: 502, headers: elevatePublicCorsHeaders() }
    );
  }
  const payload = r.rows[0];
  if (!payload || payload === null) {
    return NextResponse.json(
      { error: "Pedido no encontrado." },
      { status: 404, headers: elevatePublicCorsHeaders() }
    );
  }

  return NextResponse.json(
    { pedido: payload },
    {
      status: 200,
      // Cache muy corto: el estado del pedido puede cambiar.
      headers: {
        "Cache-Control": "private, max-age=15",
        ...elevatePublicCorsHeaders(),
      },
    }
  );
}
