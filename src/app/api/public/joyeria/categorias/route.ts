/**
 * GET /api/public/joyeria/categorias
 *
 * Listado publico de categorias visibles en la web. Lee de
 * joyeriaartesanos.categorias_productos con activo=true AND
 * visible_web=true. Devuelve el conteo de productos por categoria
 * para que la web pueda mostrar (X) al lado de cada filtro.
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

type CategoriaRow = {
  id: string;
  nombre: string;
  slug_web: string | null;
  descripcion_web: string | null;
  orden_web: number | null;
  imagen_url: string | null;
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
  const { data: cats, error } = await supabase
    .from("categorias_productos")
    .select("id,nombre,slug_web,descripcion_web,orden_web,imagen_url")
    .eq("activo", true)
    .eq("visible_web", true)
    .order("orden_web", { ascending: true, nullsFirst: false })
    .order("nombre", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders() },
    );
  }

  const lista = (cats ?? []) as CategoriaRow[];

  const ids = lista.map((c) => c.id);
  let countByCat = new Map<string, number>();
  if (ids.length) {
    // Multi-sucursal: contar SÓLO productos con stock en la sucursal Principal.
    const stockPrincipal = await getPrincipalStockMap(supabase, { soloDisponibles: true });

    const baseQuery = supabase
      .from("productos")
      .select("id, categoria_principal_id")
      .eq("activo", true)
      .eq("visible_web", true)
      .in("categoria_principal_id", ids);

    const { data: productos } = await (stockPrincipal
      ? (stockPrincipal.size > 0
          ? baseQuery.in("id", [...stockPrincipal.keys()])
          : baseQuery.in("id", ["00000000-0000-0000-0000-000000000000"]))
      : baseQuery);

    countByCat = new Map();
    for (const p of (productos ?? []) as { categoria_principal_id: string | null }[]) {
      if (!p.categoria_principal_id) continue;
      countByCat.set(
        p.categoria_principal_id,
        (countByCat.get(p.categoria_principal_id) ?? 0) + 1,
      );
    }
  }

  const categorias = lista.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    slug: c.slug_web,
    descripcion: c.descripcion_web,
    imagen_url: c.imagen_url,
    productos_count: countByCat.get(c.id) ?? 0,
  }));

  return NextResponse.json(
    { categorias },
    {
      headers: {
        ...corsHeaders(),
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
      },
    },
  );
}
