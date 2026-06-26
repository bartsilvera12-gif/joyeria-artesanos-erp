/**
 * GET /api/public/joyeria/productos
 *
 * Catálogo público de Joyería Artesanos (sin auth). Lee de
 * `joyeriaartesanos.productos` con filtros activo=true AND visible_web=true.
 *
 * Sólo expone columnas seguras (no costo, no proveedor, no stock numérico).
 *
 * CORS: lee dominio permitido de JOYERIA_PUBLIC_WEB_ORIGIN. Sin esa env var,
 * permite "*" (útil mientras el dominio no esté fijado).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

type CategoriaJoin = { slug_web: string | null; nombre: string | null } | null;
type ProductoRow = {
  id: string;
  slug_web: string | null;
  nombre: string;
  marca: string | null;
  precio_venta: number;
  precio_web: number | null;
  precio_oferta: number | null;
  oferta_hasta: string | null;
  imagen_url: string | null;
  descripcion_corta: string | null;
  destacado_web: boolean;
  stock_actual: number;
  orden_web: number | null;
  categoria: CategoriaJoin;
};

export async function GET() {
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
      "id,slug_web,nombre,marca,precio_venta,precio_web,precio_oferta,oferta_hasta,imagen_url,descripcion_corta,destacado_web,stock_actual,orden_web,categoria:categoria_principal_id(slug_web,nombre)",
    )
    .eq("activo", true)
    .eq("visible_web", true)
    .gt("stock_actual", 0)
    .order("orden_web", { ascending: true, nullsFirst: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders() },
    );
  }

  const productos = ((data ?? []) as unknown as ProductoRow[]).map((p) => ({
    id: p.id,
    slug: p.slug_web,
    nombre: p.nombre,
    marca: p.marca,
    categoria: p.categoria?.slug_web ?? null,
    categoria_nombre: p.categoria?.nombre ?? null,
    precio: Number(p.precio_web ?? p.precio_venta ?? 0),
    precio_oferta: p.precio_oferta != null ? Number(p.precio_oferta) : null,
    oferta_hasta: p.oferta_hasta,
    imagen_url: p.imagen_url,
    descripcion: p.descripcion_corta,
    destacado: p.destacado_web,
    disponible: Number(p.stock_actual ?? 0) > 0,
  }));

  return NextResponse.json(
    { productos },
    {
      headers: {
        ...corsHeaders(),
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
      },
    },
  );
}
