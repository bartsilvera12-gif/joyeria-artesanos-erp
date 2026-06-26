/**
 * GET /api/public/joyeria/productos/[slug]
 *
 * Detalle de un producto del catalogo (sin auth). Lee de
 * joyeriaartesanos.productos buscando por slug_web. Mismas columnas safe
 * que el listado + descripcion_web extendida.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPrincipalStockMap } from "@/lib/public/joyeria-sucursal";

export const dynamic = "force-dynamic";

function corsHeaders(): Record<string, string> {
  const origin = (process.env.JOYERIA_PUBLIC_WEB_ORIGIN ?? "*").trim();
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders() });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json(
      { error: "slug requerido" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase no configurado" },
      { status: 500, headers: corsHeaders() },
    );
  }

  const supabase = createClient(url, key, { db: { schema: "joyeriaartesanos" } });
  const { data, error } = await supabase
    .from("productos")
    .select(
      "id,slug_web,nombre,marca,precio_venta,precio_web,precio_oferta,oferta_hasta,imagen_url,descripcion_corta,descripcion_web,destacado_web,stock_actual",
    )
    .eq("activo", true)
    .eq("visible_web", true)
    .eq("slug_web", slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders() },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "Producto no encontrado" },
      { status: 404, headers: corsHeaders() },
    );
  }

  // Multi-sucursal: disponibilidad = stock en la sucursal Principal.
  const stockPrincipal = await getPrincipalStockMap(supabase);
  const stockSucursal = stockPrincipal
    ? (stockPrincipal.get(data.id) ?? 0)
    : Number(data.stock_actual ?? 0);

  const producto = {
    id: data.id,
    slug: data.slug_web,
    nombre: data.nombre,
    marca: data.marca,
    precio: Number(data.precio_web ?? data.precio_venta ?? 0),
    precio_oferta: data.precio_oferta != null ? Number(data.precio_oferta) : null,
    oferta_hasta: data.oferta_hasta,
    imagen_url: data.imagen_url,
    descripcion_corta: data.descripcion_corta,
    descripcion: data.descripcion_web ?? data.descripcion_corta,
    destacado: data.destacado_web,
    disponible: stockSucursal > 0,
  };

  return NextResponse.json(
    { producto },
    {
      headers: {
        ...corsHeaders(),
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
