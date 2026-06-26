/**
 * POST /api/public/joyeria/pedidos
 *
 * Crea un pedido web desde el catalogo publico. La web manda:
 *   {
 *     cliente: { nombre, telefono, email?, direccion?, notas? },
 *     items:   [{ producto_id, cantidad }],
 *     payment_method?: string,
 *   }
 *
 * El servidor:
 *   - Valida productos contra joyeriaartesanos.productos (activo + visible_web + stock)
 *   - Toma el precio CANONICO de la DB (nunca confia en lo que manda la web)
 *   - Inserta pedidos_web + pedidos_web_items
 *   - Devuelve { numero, estado, total }
 *
 * Estado inicial: 'pendiente_pago'. El operador de Caja en el ERP lo procesa.
 */
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function corsHeaders(): Record<string, string> {
  const origin = (process.env.JOYERIA_PUBLIC_WEB_ORIGIN ?? "*").trim();
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders() });
}

type Body = {
  cliente?: {
    nombre?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    notas?: string;
  };
  items?: { producto_id?: string; cantidad?: number }[];
  payment_method?: string;
};

type ProductoDb = {
  id: string;
  nombre: string;
  precio_venta: number;
  precio_web: number | null;
  precio_oferta: number | null;
  stock_actual: number;
};

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: corsHeaders() });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nextNumero(supabase: SupabaseClient<any, any, any>, empresaId: string): Promise<string> {
  const hoy = new Date();
  const ymd = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  // upsert pedidos_web_secuencia y devuelve nuevo ultimo
  const { data: existing } = await supabase
    .from("pedidos_web_secuencia")
    .select("ultimo")
    .eq("empresa_id", empresaId)
    .eq("fecha", ymd)
    .maybeSingle();
  const next = (existing?.ultimo ?? 0) + 1;
  await supabase
    .from("pedidos_web_secuencia")
    .upsert({ empresa_id: empresaId, fecha: ymd, ultimo: next });
  const ymdCompact = ymd.replace(/-/g, "");
  return `WEB-${ymdCompact}-${String(next).padStart(4, "0")}`;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("body JSON invalido");
  }

  const nombre = (body.cliente?.nombre ?? "").trim();
  const telefono = (body.cliente?.telefono ?? "").trim();
  if (!nombre) return bad("cliente.nombre requerido");
  if (!telefono) return bad("cliente.telefono requerido");
  const items = (body.items ?? []).filter(
    (it): it is { producto_id: string; cantidad: number } =>
      typeof it?.producto_id === "string" &&
      Number.isFinite(it?.cantidad) &&
      (it.cantidad ?? 0) > 0,
  );
  if (!items.length) return bad("items vacio");
  if (items.length > 50) return bad("demasiados items");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return bad("Supabase service role no configurado", 500);
  }
  const supabase = createClient(url, key, { db: { schema: "joyeriaartesanos" } });

  // Tomar primera empresa (single-tenant joyeria)
  const { data: empresa, error: errEmp } = await supabase
    .from("empresas")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (errEmp || !empresa?.id) return bad("Empresa no encontrada", 500);
  const empresaId = empresa.id;

  // Lookup productos
  const ids = items.map((it) => it.producto_id);
  const { data: productosRaw, error: errProd } = await supabase
    .from("productos")
    .select("id,nombre,precio_venta,precio_web,precio_oferta,stock_actual")
    .eq("activo", true)
    .eq("visible_web", true)
    .in("id", ids);
  if (errProd) return bad("error consultando productos: " + errProd.message, 500);
  const productos = (productosRaw ?? []) as ProductoDb[];
  const byId = new Map(productos.map((p) => [p.id, p]));

  // Multi-sucursal: validar stock con la sucursal Principal (la que despacha la web).
  const { data: sucPrincipal } = await supabase
    .from("sucursales")
    .select("id")
    .eq("es_principal", true)
    .limit(1)
    .maybeSingle();
  const principalId = (sucPrincipal as { id?: string } | null)?.id ?? null;
  let stockPrincipal: Map<string, number> | null = null;
  if (principalId) {
    const { data: stocksRaw } = await supabase
      .from("producto_stock_sucursal")
      .select("producto_id, stock_actual")
      .eq("sucursal_id", principalId)
      .in("producto_id", ids);
    stockPrincipal = new Map(
      ((stocksRaw ?? []) as { producto_id: string; stock_actual: number | string }[])
        .map((r) => [r.producto_id, Number(r.stock_actual)]),
    );
  }

  let subtotal = 0;
  const itemsInsert: {
    producto_id: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    producto_snapshot: { nombre: string; precio: number };
  }[] = [];

  for (const it of items) {
    const p = byId.get(it.producto_id);
    if (!p) return bad(`producto ${it.producto_id} no disponible`);
    const stockDisp = stockPrincipal
      ? (stockPrincipal.get(it.producto_id) ?? 0)
      : Number(p.stock_actual ?? 0);
    if (stockDisp < it.cantidad) {
      return bad(`stock insuficiente para ${p.nombre}`);
    }
    const precio = Number(p.precio_oferta ?? p.precio_web ?? p.precio_venta ?? 0);
    const subItem = precio * it.cantidad;
    subtotal += subItem;
    itemsInsert.push({
      producto_id: p.id,
      cantidad: it.cantidad,
      precio_unitario: precio,
      subtotal: subItem,
      producto_snapshot: { nombre: p.nombre, precio },
    });
  }

  const numero = await nextNumero(supabase, empresaId);

  const clienteSnapshot = {
    nombre,
    telefono,
    email: body.cliente?.email?.trim() || null,
    direccion: body.cliente?.direccion?.trim() || null,
    notas: body.cliente?.notas?.trim() || null,
  };

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent") || null;

  const { data: pedido, error: errPedido } = await supabase
    .from("pedidos_web")
    .insert({
      numero,
      empresa_id: empresaId,
      cliente_snapshot: clienteSnapshot,
      estado: "pendiente_pago",
      subtotal,
      total: subtotal,
      payment_method: body.payment_method ?? null,
      notas: clienteSnapshot.notas,
      ip_origen: ip,
      user_agent: ua,
    })
    .select("id,numero")
    .single();
  if (errPedido || !pedido) return bad("no se pudo crear pedido: " + (errPedido?.message ?? ""), 500);

  const { error: errItems } = await supabase
    .from("pedidos_web_items")
    .insert(itemsInsert.map((it) => ({ ...it, pedido_id: pedido.id })));
  if (errItems) {
    await supabase.from("pedidos_web").delete().eq("id", pedido.id);
    return bad("no se pudo guardar items: " + errItems.message, 500);
  }

  return NextResponse.json(
    { numero: pedido.numero, estado: "pendiente_pago", total: subtotal },
    { status: 201, headers: corsHeaders() },
  );
}
