/**
 * PATCH /api/productos/[id]/imagenes/[imagenId]
 *   Body parcial: { es_principal?, orden?, alt_text? }
 *   - Si es_principal=true, el trigger DB apaga las demás. Además este
 *     handler mirrorea la URL principal a productos.imagen_url para que el
 *     catálogo/card siga usando un solo lookup.
 *
 * DELETE /api/productos/[id]/imagenes/[imagenId]
 *   Borra fila + objeto storage. Si era principal y quedan otras, promueve
 *   la siguiente por orden ascendente como nueva principal y mirrorea.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import {
  getAccessTokenForRequest,
  postgrestGet,
  postgrestRequest,
} from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { updateProductoPostgrest } from "@/lib/inventario/server/productos-postgrest";
import { PRODUCTOS_IMAGENES_BUCKET, isManagedBucketPath } from "@/lib/inventario/imagen-storage";

const SELECT_COLS = "id,producto_id,imagen_path,imagen_url,orden,es_principal,alt_text,created_at";

type ImagenRow = {
  id: string;
  producto_id: string;
  imagen_path: string;
  imagen_url: string;
  orden: number;
  es_principal: boolean;
  alt_text: string | null;
  created_at: string;
};

function storageClientWithJwt(jwt: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY");
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
  });
}

async function fetchImagen(
  jwt: string | null,
  empresaId: string,
  productoId: string,
  imagenId: string
): Promise<ImagenRow | null> {
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    id: `eq.${imagenId}`,
    producto_id: `eq.${productoId}`,
    empresa_id: `eq.${empresaId}`,
    limit: "1",
  });
  const r = await postgrestGet<ImagenRow>("producto_imagenes", qs.toString(), {
    role: "jwt",
    jwt,
    noStore: true,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.rows[0] ?? null;
}

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string; imagenId: string }> }
) {
  try {
    const { id: productoId, imagenId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const existing = await fetchImagen(jwt, empresaId, productoId, imagenId);
    if (!existing) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.es_principal !== undefined) patch.es_principal = body.es_principal === true;
    if (body.orden !== undefined) {
      const n = Number(body.orden);
      if (!Number.isFinite(n) || n < 0 || n > 4) {
        return NextResponse.json(errorResponse("orden debe ser entre 0 y 4."), { status: 400 });
      }
      patch.orden = Math.trunc(n);
    }
    if (body.alt_text !== undefined) {
      patch.alt_text = typeof body.alt_text === "string" ? body.alt_text.trim() || null : null;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(errorResponse("Nada para actualizar."), { status: 400 });
    }

    const qs = new URLSearchParams({
      id: `eq.${imagenId}`,
      empresa_id: `eq.${empresaId}`,
      select: SELECT_COLS,
    });
    const r = await postgrestRequest<ImagenRow>("producto_imagenes", qs.toString(), {
      method: "PATCH",
      role: "jwt",
      jwt,
      body: patch,
      prefer: "return=representation",
    });
    if (!r.ok) {
      console.error("[/api/productos/[id]/imagenes/[imagenId] PATCH]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo actualizar. (${(r.error.message ?? "").slice(0, 120)})`),
        { status: 502 }
      );
    }
    const row = r.rows[0];

    // Si quedó como principal, mirror a productos.imagen_url/path.
    // Defensa: si el path NO es un objeto gestionado del bucket
    // (URL externa o asset legacy `/brand/...`), NO lo propagamos a
    // productos.imagen_path — escribimos null en ese campo y solo
    // mantenemos imagen_url. Así el endpoint legacy de imagen no
    // intenta operaciones de Storage sobre paths inválidos.
    if (row?.es_principal) {
      try {
        const safePath = isManagedBucketPath(row.imagen_path, empresaId)
          ? row.imagen_path
          : null;
        await updateProductoPostgrest(jwt, empresaId, productoId, {
          imagen_path: safePath,
          imagen_url: row.imagen_url,
        });
      } catch (e) {
        console.warn("[imagenes PATCH] mirror principal fallo", e);
      }
    }

    return NextResponse.json(successResponse({ imagen: row }));
  } catch (err) {
    console.error("[/api/productos/[id]/imagenes/[imagenId] PATCH] outer", err);
    return NextResponse.json(errorResponse("No se pudo actualizar la imagen."), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string; imagenId: string }> }
) {
  try {
    const { id: productoId, imagenId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const existing = await fetchImagen(jwt, empresaId, productoId, imagenId);
    if (!existing) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const wasPrincipal = existing.es_principal;

    // 1) Borrar fila DB
    const qs = new URLSearchParams({
      id: `eq.${imagenId}`,
      empresa_id: `eq.${empresaId}`,
    });
    const r = await postgrestRequest<ImagenRow>("producto_imagenes", qs.toString(), {
      method: "DELETE",
      role: "jwt",
      jwt,
    });
    if (!r.ok) {
      console.error("[/api/productos/[id]/imagenes/[imagenId] DELETE]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo eliminar. (${(r.error.message ?? "").slice(0, 120)})`),
        { status: 502 }
      );
    }

    // 2) Borrar objeto storage SOLO si imagen_path es un objeto gestionado
    //    del bucket (no URL externa, no asset estático). Los productos
    //    backfilleados con imagen_url externa o `/brand/...` tienen filas
    //    en la galería pero NO un objeto en el bucket — saltar storage.
    if (existing.imagen_path && isManagedBucketPath(existing.imagen_path, empresaId)) {
      try {
        const storage = storageClientWithJwt(jwt);
        await storage.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([existing.imagen_path]);
      } catch (e) {
        console.warn("[imagenes DELETE] storage cleanup fallo", e);
      }
    }

    // 3) Si era principal, promover la siguiente (orden asc) como principal.
    if (wasPrincipal) {
      const qsRest = new URLSearchParams({
        select: SELECT_COLS,
        producto_id: `eq.${productoId}`,
        empresa_id: `eq.${empresaId}`,
        order: "orden.asc,created_at.asc",
        limit: "1",
      });
      const rRest = await postgrestGet<ImagenRow>("producto_imagenes", qsRest.toString(), {
        role: "jwt",
        jwt,
        noStore: true,
      });
      if (rRest.ok && rRest.rows.length > 0) {
        const next = rRest.rows[0];
        const qsPromote = new URLSearchParams({
          id: `eq.${next.id}`,
          empresa_id: `eq.${empresaId}`,
          select: SELECT_COLS,
        });
        const rPromote = await postgrestRequest<ImagenRow>(
          "producto_imagenes",
          qsPromote.toString(),
          {
            method: "PATCH",
            role: "jwt",
            jwt,
            body: { es_principal: true },
            prefer: "return=representation",
          }
        );
        if (rPromote.ok && rPromote.rows[0]) {
          try {
            const promoted = rPromote.rows[0];
            const safePath = isManagedBucketPath(promoted.imagen_path, empresaId)
              ? promoted.imagen_path
              : null;
            await updateProductoPostgrest(jwt, empresaId, productoId, {
              imagen_path: safePath,
              imagen_url: promoted.imagen_url,
            });
          } catch (e) {
            console.warn("[imagenes DELETE] mirror promoted fallo", e);
          }
        }
      } else {
        // Era la única; limpiar productos.imagen_url para que el catálogo
        // no muestre un placeholder colgado.
        try {
          await updateProductoPostgrest(jwt, empresaId, productoId, {
            imagen_path: null,
            imagen_url: null,
          });
        } catch (e) {
          console.warn("[imagenes DELETE] clear legacy fallo", e);
        }
      }
    }

    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/productos/[id]/imagenes/[imagenId] DELETE] outer", err);
    return NextResponse.json(errorResponse("No se pudo eliminar la imagen."), { status: 500 });
  }
}
