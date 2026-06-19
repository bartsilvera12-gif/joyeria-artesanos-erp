/**
 * Gestión de marcas asociadas a una categoría.
 *
 *   GET  /api/inventario/categorias/[id]/marcas — lista marcas asociadas.
 *   POST /api/inventario/categorias/[id]/marcas
 *         Body A: { "marca_id": "<uuid>" } → asocia marca existente.
 *         Body B: { "nombre": "Nueva Marca" } → crea marca y asocia.
 *
 * Auth: JWT del usuario. RLS de elevate.marca_categorias cubre acceso.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import {
  getAccessTokenForRequest,
  postgrestGet,
  postgrestRequest,
} from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const MARCA_COLS = "id,nombre,slug_web,descripcion_web,logo_url,visible_web,orden_web,activo";

type MarcaRow = Record<string, unknown> & { id: string };
type RelRow = { id: string; marca_id: string };

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function ensureCategoriaOwned(
  jwt: string | null,
  empresaId: string,
  categoriaId: string
): Promise<boolean> {
  const qs = new URLSearchParams({
    select: "id",
    id: `eq.${categoriaId}`,
    empresa_id: `eq.${empresaId}`,
    limit: "1",
  });
  const r = await postgrestGet<{ id: string }>(
    "categorias_productos",
    qs.toString(),
    { role: "jwt", jwt, noStore: true }
  );
  return r.ok && r.rows.length > 0;
}

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: categoriaId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    if (!(await ensureCategoriaOwned(jwt, empresaId, categoriaId))) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }

    // Join: leemos las relaciones y embebemos los datos de la marca.
    const qs = new URLSearchParams({
      select: `id,marca_id,orden,marca:marca_id(${MARCA_COLS})`,
      categoria_id: `eq.${categoriaId}`,
      empresa_id: `eq.${empresaId}`,
      order: "orden.asc,id.asc",
      limit: "200",
    });
    const r = await postgrestGet<{
      id: string;
      marca_id: string;
      orden: number;
      marca: MarcaRow | null;
    }>("marca_categorias", qs.toString(), { role: "jwt", jwt, noStore: true });
    if (!r.ok) {
      console.error("[/api/inventario/categorias/[id]/marcas GET]", r.error);
      return NextResponse.json(errorResponse("No se pudieron cargar las marcas."), {
        status: 502,
      });
    }
    const marcas = r.rows
      .filter((x) => x.marca)
      .map((x) => ({
        ...x.marca,
        // id de la relación, para poder borrar puntualmente.
        relacion_id: x.id,
        orden: x.orden,
      }));
    return NextResponse.json(successResponse({ marcas }));
  } catch (err) {
    console.error("[/api/inventario/categorias/[id]/marcas GET] outer", err);
    return NextResponse.json(errorResponse("Error al cargar marcas."), { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: categoriaId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    if (!(await ensureCategoriaOwned(jwt, empresaId, categoriaId))) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      marca_id?: unknown;
      nombre?: unknown;
    };

    let marcaIdFinal: string | null = null;

    // Caso A: asociar marca existente.
    if (typeof body.marca_id === "string" && body.marca_id.trim()) {
      const marcaIdInput = body.marca_id.trim();
      // Verificar que la marca pertenece a la empresa.
      const qsM = new URLSearchParams({
        select: "id",
        id: `eq.${marcaIdInput}`,
        empresa_id: `eq.${empresaId}`,
        limit: "1",
      });
      const rM = await postgrestGet<{ id: string }>("marcas", qsM.toString(), {
        role: "jwt",
        jwt,
        noStore: true,
      });
      if (!rM.ok || rM.rows.length === 0) {
        return NextResponse.json(errorResponse("La marca no existe en esta empresa."), {
          status: 400,
        });
      }
      marcaIdFinal = marcaIdInput;
    }
    // Caso B: crear marca nueva por nombre y asociar.
    else if (typeof body.nombre === "string" && body.nombre.trim()) {
      const nombre = body.nombre.trim();
      const slug = slugify(nombre);
      if (!slug) {
        return NextResponse.json(errorResponse("Nombre de marca inválido."), { status: 400 });
      }
      const insertMarca = {
        empresa_id: empresaId,
        nombre,
        slug_web: slug,
        visible_web: true,
        orden_web: 0,
        activo: true,
      };
      const rIns = await postgrestRequest<MarcaRow>("marcas", "select=id", {
        method: "POST",
        role: "jwt",
        jwt,
        body: insertMarca,
        prefer: "return=representation",
      });
      if (!rIns.ok) {
        if (rIns.error.code === "23505") {
          return NextResponse.json(
            errorResponse("Ya existe una marca con ese nombre o slug."),
            { status: 409 }
          );
        }
        console.error("[categorias/[id]/marcas POST] crear marca", rIns.error);
        return NextResponse.json(
          errorResponse(`No se pudo crear la marca. (${(rIns.error.message ?? "").slice(0, 120)})`),
          { status: 502 }
        );
      }
      marcaIdFinal = rIns.rows[0]?.id ?? null;
      if (!marcaIdFinal) {
        return NextResponse.json(errorResponse("No se pudo crear la marca."), { status: 502 });
      }
    } else {
      return NextResponse.json(
        errorResponse("Enviá marca_id (asociar existente) o nombre (crear y asociar)."),
        { status: 400 }
      );
    }

    // Asociar marca↔categoría (idempotente: si ya existe, devuelve la relación).
    const rRel = await postgrestRequest<RelRow>(
      "marca_categorias",
      "select=id,marca_id",
      {
        method: "POST",
        role: "jwt",
        jwt,
        body: {
          empresa_id: empresaId,
          marca_id: marcaIdFinal,
          categoria_id: categoriaId,
        },
        prefer: "return=representation",
      }
    );
    if (!rRel.ok) {
      if (rRel.error.code === "23505") {
        // Ya estaba asociada.
        return NextResponse.json(
          successResponse({ ok: true, ya_asociada: true, marca_id: marcaIdFinal })
        );
      }
      console.error("[categorias/[id]/marcas POST] asociar", rRel.error);
      return NextResponse.json(
        errorResponse(`No se pudo asociar. (${(rRel.error.message ?? "").slice(0, 120)})`),
        { status: 502 }
      );
    }
    return NextResponse.json(
      successResponse({ marca_id: marcaIdFinal, relacion: rRel.rows[0] }),
      { status: 201 }
    );
  } catch (err) {
    console.error("[/api/inventario/categorias/[id]/marcas POST] outer", err);
    return NextResponse.json(errorResponse("Error al asociar marca."), { status: 500 });
  }
}
