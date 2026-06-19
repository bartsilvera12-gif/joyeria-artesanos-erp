/**
 * POST /api/public/elevate/product-events
 *
 * Endpoint público (sin auth) para registrar eventos de comportamiento web
 * del catálogo Elevate: product_view, product_click, add_to_cart,
 * whatsapp_click.
 *
 * Seguridad:
 *   - Whitelist estricta de `event_type`.
 *   - Validación UUID de `product_id` + existencia en elevate.productos
 *     con visible_web=true.
 *   - Rate-limit en memoria por hash IP+UA: 60 eventos/min por cliente.
 *   - Sin lectura ni escritura de IP cruda en DB. Solo hash en memoria.
 *   - Escritura server-side via pg.Pool (rol postgres). NUNCA service_role
 *     en cliente.
 *   - CORS controlado por ELEVATE_PUBLIC_WEB_ORIGIN.
 *
 * Respuesta:
 *   - 204 No Content si todo bien (sin payload, ahorra ancho de banda).
 *   - 400 si payload inválido.
 *   - 404 si producto no existe / no visible.
 *   - 429 si rate-limit excedido.
 *   - 500/503 si DB unavailable. El front debe ignorar silenciosamente.
 */
import { NextRequest, NextResponse } from "next/server";
import { elevatePublicCorsHeaders } from "@/lib/public-api/cors";
import { checkRateLimit, clientHash, extractClientIp } from "@/lib/public-api/rate-limit";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_EVENTS = new Set([
  "product_view",
  "product_click",
  "add_to_cart",
  "whatsapp_click",
]);

const RATE_LIMIT_MAX = 60; // eventos
const RATE_LIMIT_WINDOW_MS = 60_000; // por minuto

interface IncomingEvent {
  product_id: string;
  event_type: string;
  source?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown> | null;
}

function parseBody(raw: unknown): IncomingEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const product_id = typeof o.product_id === "string" ? o.product_id.trim() : "";
  const event_type = typeof o.event_type === "string" ? o.event_type.trim() : "";
  if (!UUID_RE.test(product_id)) return null;
  if (!VALID_EVENTS.has(event_type)) return null;
  const source = typeof o.source === "string" ? o.source.slice(0, 80) : null;
  const path = typeof o.path === "string" ? o.path.slice(0, 200) : null;
  let metadata: Record<string, unknown> | null = null;
  if (o.metadata && typeof o.metadata === "object" && !Array.isArray(o.metadata)) {
    // Cap a 4KB por payload: serializa y trunca si excede.
    try {
      const s = JSON.stringify(o.metadata);
      if (s.length <= 4096) metadata = o.metadata as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  return { product_id, event_type, source, path, metadata };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: elevatePublicCorsHeaders() });
}

export async function POST(request: NextRequest) {
  const corsHeaders = elevatePublicCorsHeaders();
  try {
    // Rate-limit por hash IP+UA. Sin persistir IP cruda.
    const ip = extractClientIp(request.headers);
    const ua = request.headers.get("user-agent");
    const rl = checkRateLimit({
      key: clientHash(ip, ua),
      max: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!rl.allowed) {
      return new NextResponse(null, {
        status: 429,
        headers: {
          ...corsHeaders,
          "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
        },
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400, headers: corsHeaders });
    }

    const evt = parseBody(body);
    if (!evt) {
      return NextResponse.json(
        { error: "Payload inválido. Requeridos: product_id (uuid), event_type (whitelist)." },
        { status: 400, headers: corsHeaders }
      );
    }

    const pool = getChatPostgresPool();
    if (!pool) {
      console.error("[product-events] pg.Pool no disponible (SUPABASE_DB_URL?)");
      return NextResponse.json(
        { error: "Servicio no disponible." },
        { status: 503, headers: corsHeaders }
      );
    }

    const productosT = quoteSchemaTable(SUPABASE_APP_SCHEMA, "productos");
    const eventsT = quoteSchemaTable(SUPABASE_APP_SCHEMA, "web_product_events");

    const client = await pool.connect();
    try {
      // Verifica que el producto existe y es visible_web. Una sola query.
      const ck = await client.query<{ ok: number }>(
        `SELECT 1 AS ok FROM ${productosT}
         WHERE id = $1 AND visible_web = true AND activo = true
         LIMIT 1`,
        [evt.product_id]
      );
      if (ck.rows.length === 0) {
        return NextResponse.json(
          { error: "Producto no encontrado o no visible." },
          { status: 404, headers: corsHeaders }
        );
      }

      await client.query(
        `INSERT INTO ${eventsT} (product_id, event_type, source, path, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          evt.product_id,
          evt.event_type,
          evt.source,
          evt.path,
          evt.metadata ? JSON.stringify(evt.metadata) : null,
        ]
      );
    } finally {
      client.release();
    }

    // 204 No Content — payload mínimo, sin caching.
    return new NextResponse(null, {
      status: 204,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error(
      "[product-events POST] uncaught",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Error al registrar evento." },
      { status: 500, headers: corsHeaders }
    );
  }
}
