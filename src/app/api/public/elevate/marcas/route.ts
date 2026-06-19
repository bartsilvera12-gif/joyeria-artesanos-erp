/**
 * GET /api/public/elevate/marcas
 *
 * Marcas visibles del catálogo Elevate. Anon vía PostgREST con Accept-Profile.
 *
 * Query params opcionales:
 *   ?categoria=slug     — devuelve solo marcas con al menos 1 producto visible
 *                         dentro de esa categoría (Fase Marcas: navegación
 *                         Categoría → Marca → Productos).
 *
 * Exposición: id, nombre, slug, descripcion, logo_url, orden. No empresa_id,
 * no created_at, no activo, no visible_web (siempre filtrado a visible_web=true
 * por la policy anon).
 */
import { NextRequest, NextResponse } from "next/server";
import { elevatePublicCorsHeaders, PUBLIC_CATALOG_CACHE } from "@/lib/public-api/cors";
import { postgrestGet } from "@/lib/elevate-public/catalog-postgrest";

const PUBLIC_SELECT = "id,nombre,slug_web,descripcion_web,logo_url,orden_web";

type MarcaRaw = {
  id: string;
  nombre: string | null;
  slug_web: string | null;
  descripcion_web: string | null;
  logo_url: string | null;
  orden_web: number | null;
};

export type MarcaPublica = {
  id: string;
  nombre: string;
  slug: string | null;
  descripcion: string | null;
  logo_url: string | null;
  orden: number | null;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: elevatePublicCorsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const categoriaSlug = url.searchParams.get("categoria")?.trim().toLowerCase() || null;

    // 1) Si vino ?categoria=, resolver las marcas asociadas. Fase Categorías↔
    //    Marcas: priorizamos la relación formal `marca_categorias`. Si la
    //    categoría no tiene relaciones formales (caso histórico), caemos al
    //    método anterior (deducir desde productos visibles en esa categoría).
    let marcaIdsFilter: string[] | null = null;
    if (categoriaSlug) {
      // 1.a) Lookup del categoria_id por slug.
      const qsCat = new URLSearchParams({
        select: "id",
        slug_web: `eq.${categoriaSlug}`,
        activo: "eq.true",
        visible_web: "eq.true",
        limit: "1",
      });
      const rCat = await postgrestGet<{ id: string }>(
        "categorias_productos",
        qsCat.toString()
      );
      if (rCat.ok && rCat.rows.length > 0) {
        const categoriaId = rCat.rows[0].id;
        // 1.b) Relación formal marca_categorias.
        const qsRel = new URLSearchParams({
          select: "marca_id",
          categoria_id: `eq.${categoriaId}`,
          limit: "500",
        });
        const rRel = await postgrestGet<{ marca_id: string }>(
          "marca_categorias",
          qsRel.toString()
        );
        if (rRel.ok && rRel.rows.length > 0) {
          marcaIdsFilter = rRel.rows.map((x) => x.marca_id);
        }
      }
      // 1.c) Fallback: si no hay relaciones formales para esta categoría
      // (legacy), deducimos por productos visibles en esa categoría — mismo
      // comportamiento que antes de la Fase Categorías↔Marcas.
      if (marcaIdsFilter === null) {
        const qsProd = new URLSearchParams({
          select: "marca_id,categoria:categoria_principal_id!inner(slug_web)",
          activo: "eq.true",
          visible_web: "eq.true",
          marca_id: "not.is.null",
          limit: "1000",
        });
        qsProd.append("categoria.slug_web", `eq.${categoriaSlug}`);
        const rProd = await postgrestGet<{ marca_id: string | null }>(
          "productos",
          qsProd.toString()
        );
        if (!rProd.ok) {
          console.error("[/api/public/elevate/marcas GET prods]", rProd.error);
          return NextResponse.json(
            { error: "No se pudieron cargar las marcas." },
            { status: 502, headers: elevatePublicCorsHeaders() }
          );
        }
        const unique = new Set<string>();
        for (const r of rProd.rows) {
          if (r.marca_id) unique.add(r.marca_id);
        }
        marcaIdsFilter = unique.size === 0 ? [] : [...unique];
      }
      if (marcaIdsFilter.length === 0) {
        return NextResponse.json(
          { marcas: [] },
          { status: 200, headers: { ...elevatePublicCorsHeaders(), ...PUBLIC_CATALOG_CACHE } }
        );
      }
    }

    // 2) Cargar las marcas. RLS+policy anon ya garantiza visible_web=true AND
    //    activo=true; no hace falta filtrar acá.
    const qs = new URLSearchParams({
      select: PUBLIC_SELECT,
      order: "orden_web.asc.nullslast,nombre.asc",
      limit: "500",
    });
    if (marcaIdsFilter) {
      qs.set("id", `in.(${marcaIdsFilter.map(encodeURIComponent).join(",")})`);
    }
    const result = await postgrestGet<MarcaRaw>("marcas", qs.toString());
    if (!result.ok) {
      console.error("[/api/public/elevate/marcas GET]", result.error);
      return NextResponse.json(
        { error: "No se pudieron cargar las marcas." },
        { status: 502, headers: elevatePublicCorsHeaders() }
      );
    }
    const marcas: MarcaPublica[] = result.rows
      .map((r) => ({
        id: r.id,
        nombre: (r.nombre ?? "").trim(),
        slug: r.slug_web,
        descripcion: r.descripcion_web,
        logo_url: r.logo_url,
        orden: r.orden_web,
      }))
      .filter((m) => m.nombre.length > 0);
    return NextResponse.json(
      { marcas },
      {
        status: 200,
        headers: { ...elevatePublicCorsHeaders(), ...PUBLIC_CATALOG_CACHE },
      }
    );
  } catch (err) {
    console.error(
      "[/api/public/elevate/marcas GET] outer",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "No se pudieron cargar las marcas." },
      { status: 500, headers: elevatePublicCorsHeaders() }
    );
  }
}
