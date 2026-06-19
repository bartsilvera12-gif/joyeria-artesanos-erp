/**
 * POST /api/public/elevate/pedidos
 *
 * Endpoint público (sin auth) — recibe un pedido del checkout web y llama
 * a la RPC `elevate.crear_pedido_web` que recalcula precios server-side,
 * valida visibilidad/stock/proximamente, snapshot de cliente/productos,
 * genera número (EL-YYMMDD-####) y public_token.
 *
 * Reglas:
 *   - NO confía en precios/totales enviados por el cliente.
 *   - NO descuenta stock (Fase Pedidos Web MVP).
 *   - NO crea ventas ni movimientos.
 *   - Rate-limit IP simple en memoria del proceso.
 *   - Payload máximo razonable (Next.js default).
 */
import { NextRequest, NextResponse } from "next/server";
import { elevatePublicCorsHeaders } from "@/lib/public-api/cors";
import { postgrestRpc } from "@/lib/supabase/postgrest-runtime";

export const dynamic = "force-dynamic";

/** empresa_id fijo de Elevate (instancia monocliente). NO se acepta del cliente. */
const ELEVATE_EMPRESA_ID = "00000000-0000-0000-0000-00000000e1e7";

/** Rate-limit in-memory: máx 6 pedidos por IP en 5 min. Suficiente para MVP. */
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 6;
const rateMap = new Map<string, number[]>();

function rateLimitOk(ip: string): boolean {
  const now = Date.now();
  const arr = (rateMap.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    rateMap.set(ip, arr);
    return false;
  }
  arr.push(now);
  rateMap.set(ip, arr);
  return true;
}

function clientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return "unknown";
}

type ItemIn = {
  producto_id?: unknown;
  presentacion_id?: unknown;
  cantidad?: unknown;
};

function sanitizeStr(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: elevatePublicCorsHeaders() });
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!rateLimitOk(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá unos minutos." },
      { status: 429, headers: elevatePublicCorsHeaders() }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "JSON inválido." },
      { status: 400, headers: elevatePublicCorsHeaders() }
    );
  }

  const cliente = body.cliente as Record<string, unknown> | undefined;
  if (!cliente || typeof cliente !== "object") {
    return NextResponse.json(
      { error: "Faltan datos del cliente." },
      { status: 400, headers: elevatePublicCorsHeaders() }
    );
  }
  const clienteSanit = {
    nombre: sanitizeStr(cliente.nombre, 200),
    email: sanitizeStr(cliente.email, 200),
    telefono: sanitizeStr(cliente.telefono, 50),
    direccion: sanitizeStr(cliente.direccion, 300),
    ciudad: sanitizeStr(cliente.ciudad, 100),
    zip: sanitizeStr(cliente.zip, 20),
  };
  if (!clienteSanit.nombre) {
    return NextResponse.json(
      { error: "El nombre del cliente es obligatorio." },
      { status: 400, headers: elevatePublicCorsHeaders() }
    );
  }
  if (!clienteSanit.telefono && !clienteSanit.email) {
    return NextResponse.json(
      { error: "Necesitamos teléfono o email para contactarte." },
      { status: 400, headers: elevatePublicCorsHeaders() }
    );
  }

  const itemsRaw = body.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
    return NextResponse.json(
      { error: "El carrito está vacío." },
      { status: 400, headers: elevatePublicCorsHeaders() }
    );
  }
  if (itemsRaw.length > 30) {
    return NextResponse.json(
      { error: "Máximo 30 productos por pedido." },
      { status: 400, headers: elevatePublicCorsHeaders() }
    );
  }
  // Fase Presentaciones: el cliente puede pasar `presentacion_id` opcional.
  // El RPC valida pertenencia (empresa + producto) y recalcula precio/stock
  // desde la presentación. NUNCA aceptamos precio del cliente.
  const items = (itemsRaw as ItemIn[])
    .map((i) => ({
      producto_id: typeof i.producto_id === "string" ? i.producto_id : null,
      presentacion_id:
        typeof i.presentacion_id === "string" && i.presentacion_id.length > 0
          ? i.presentacion_id
          : null,
      cantidad: typeof i.cantidad === "number" ? i.cantidad : Number(i.cantidad ?? 0),
    }))
    .filter((i) => i.producto_id && i.cantidad > 0);
  if (items.length === 0) {
    return NextResponse.json(
      { error: "Items inválidos." },
      { status: 400, headers: elevatePublicCorsHeaders() }
    );
  }

  const paymentRaw = sanitizeStr(body.payment_method, 30) ?? "whatsapp";
  const payment_method = ["transferencia", "tarjeta", "whatsapp"].includes(paymentRaw)
    ? paymentRaw
    : "whatsapp";

  const ua = sanitizeStr(request.headers.get("user-agent"), 300);

  const rpcArgs = {
    payload: {
      empresa_id: ELEVATE_EMPRESA_ID,
      cliente: clienteSanit,
      items,
      payment_method,
      notas: sanitizeStr(body.notas, 1000),
      ip_origen: ip,
      user_agent: ua,
    },
  };

  const r = await postgrestRpc<{
    pedido_id: string;
    numero: string;
    estado: string;
    total: number;
    public_token: string;
  }>("crear_pedido_web", rpcArgs, { role: "anon" });

  if (!r.ok) {
    const status = r.error.status === 400 || r.error.status === 22023 ? 400 : 502;
    console.error("[/api/public/elevate/pedidos]", r.error);
    return NextResponse.json(
      { error: r.error.message || "No se pudo crear el pedido." },
      { status, headers: elevatePublicCorsHeaders() }
    );
  }

  // PostgREST devuelve [resultado_jsonb] como array de filas. El helper unifica.
  const result = (r.rows[0] ?? {}) as {
    pedido_id?: string;
    numero?: string;
    estado?: string;
    total?: number;
    public_token?: string;
  };

  return NextResponse.json(
    {
      pedido_id: result.pedido_id,
      numero: result.numero,
      estado: result.estado,
      total: result.total,
      public_token: result.public_token,
    },
    { status: 201, headers: elevatePublicCorsHeaders() }
  );
}
