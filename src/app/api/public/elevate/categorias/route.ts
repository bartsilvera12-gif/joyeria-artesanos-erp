/**
 * GET /api/public/elevate/categorias
 *
 * Listado público de categorías visibles para el catálogo web Elevate.
 *
 * Reglas de exposición:
 *   - Solo categorías de la empresa Elevate (filtrado por id en server).
 *   - Solo `activo=true AND visible_web=true`.
 *   - Devuelve: id, nombre, slug_web, descripcion_web, orden_web.
 *   - NO expone: empresa_id, codigo, parent_id, descripcion interna,
 *     timestamps administrativos.
 */
import { NextRequest, NextResponse } from "next/server";
import { elevatePublicCorsHeaders, PUBLIC_CATALOG_CACHE } from "@/lib/public-api/cors";
import { postgrestGet } from "@/lib/elevate-public/catalog-postgrest";

const PUBLIC_SELECT = "id,nombre,slug_web,descripcion_web,orden_web";

type CategoriaRaw = {
  id: string;
  nombre: string | null;
  slug_web: string | null;
  descripcion_web: string | null;
  orden_web: number | null;
};

export type CategoriaPublica = {
  id: string;
  nombre: string;
  slug: string | null;
  descripcion: string | null;
  orden: number | null;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: elevatePublicCorsHeaders() });
}

export async function GET(_request: NextRequest) {
  try {
    const qs = new URLSearchParams({
      select: PUBLIC_SELECT,
      activo: "eq.true",
      visible_web: "eq.true",
      order: "orden_web.asc.nullslast,nombre.asc",
      limit: "200",
    });
    const result = await postgrestGet<CategoriaRaw>("categorias_productos", qs.toString());
    if (!result.ok) {
      console.error("[/api/public/elevate/categorias GET]", result.error);
      return NextResponse.json(
        { error: "No se pudieron cargar las categorías." },
        { status: 502, headers: elevatePublicCorsHeaders() }
      );
    }
    const categorias: CategoriaPublica[] = result.rows
      .map((r) => ({
        id: r.id,
        nombre: (r.nombre ?? "").trim(),
        slug: r.slug_web,
        descripcion: r.descripcion_web,
        orden: r.orden_web,
      }))
      .filter((c) => c.nombre.length > 0);
    return NextResponse.json(
      { categorias },
      {
        status: 200,
        headers: { ...elevatePublicCorsHeaders(), ...PUBLIC_CATALOG_CACHE },
      }
    );
  } catch (err) {
    console.error("[/api/public/elevate/categorias GET] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "No se pudieron cargar las categorías." },
      { status: 500, headers: elevatePublicCorsHeaders() }
    );
  }
}
