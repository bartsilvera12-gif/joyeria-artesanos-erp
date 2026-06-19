import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  PRODUCTOS_IMAGENES_BUCKET,
  buildProductoImagenPath,
  pathBelongsToEmpresa,
  publicProductoImagenUrl,
} from "@/lib/inventario/imagen-storage";
import {
  getProductoPostgrest,
  updateProductoPostgrest,
} from "@/lib/inventario/server/productos-postgrest";

/**
 * Imagen de producto (bucket público `productos-imagenes`).
 *
 * Productos: PostgREST HTTPS con JWT del usuario (RLS por empresa).
 * Storage: cliente Supabase armado con el JWT del usuario logueado
 *   (rol `authenticated` + storage policies sobre el bucket).
 *
 * No usamos service_role para Storage porque el runtime Hostinger tiene
 * una SUPABASE_SERVICE_ROLE_KEY desfasada respecto al JWT_SECRET de
 * los containers Supabase: cualquier llamada a Storage con esa key
 * devuelve "signature verification failed". El JWT del usuario sí es
 * válido (Supabase Auth lo emite con el secret correcto).
 *
 * Como el bucket es público, las URLs se construyen directo al
 * endpoint /storage/v1/object/public/... (cacheable por CDN).
 */

function diagnostic(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

/**
 * Cliente Supabase autenticado con el JWT del usuario. Storage usa este
 * cliente para upload/delete; las policies sobre storage.objects para
 * bucket productos-imagenes habilitan al rol `authenticated`.
 */
function storageClientWithJwt(jwt: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY");
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
  });
}

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const prod = await getProductoPostgrest(jwt, empresaId, productoId);
    if (!prod) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }
    // Bucket público: devolvemos URL pública estable (no signed).
    const publicUrl = publicProductoImagenUrl(prod.imagen_path);
    return NextResponse.json(
      successResponse({ imagen_path: prod.imagen_path, imagen_url: publicUrl ?? prod.imagen_url })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/productos/[id]/imagen GET]", msg);
    return NextResponse.json(
      errorResponse(`No se pudo obtener la imagen. (${msg.slice(0, 160)})`),
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    // 1) Ownership via PostgREST (RLS por empresa).
    let prod;
    try {
      prod = await getProductoPostgrest(jwt, empresaId, productoId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[/api/productos/[id]/imagen POST] ownership", msg);
      return NextResponse.json(
        errorResponse(`No se pudo subir la imagen. (ownership_check_failed · ${msg.slice(0, 120)})`),
        { status: 502 }
      );
    }
    if (!prod) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }

    // 2) Leer archivo
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Falta el archivo (campo 'file')."), { status: 400 });
    }
    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      return NextResponse.json(
        errorResponse("Formato no permitido. Usá JPG, PNG o WebP."),
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(
        errorResponse(`Imagen demasiado grande (máx. ${mb} MB).`),
        { status: 413 }
      );
    }

    // 3) Cliente Storage con JWT del usuario (NO service_role)
    let storageSupabase;
    try {
      storageSupabase = storageClientWithJwt(jwt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[/api/productos/[id]/imagen POST] client", msg);
      return NextResponse.json(
        errorResponse(`No se pudo subir la imagen. (storage_client_init_failed · ${msg.slice(0, 120)})`),
        { status: 500 }
      );
    }

    // 4) Borrar imagen anterior si pertenece a la empresa (best-effort)
    if (prod.imagen_path && pathBelongsToEmpresa(prod.imagen_path, empresaId)) {
      await storageSupabase.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([prod.imagen_path]);
    }

    // 5) Upload nuevo
    const path = buildProductoImagenPath(empresaId, productoId, file.type);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await storageSupabase.storage
      .from(PRODUCTOS_IMAGENES_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) {
      console.error("[/api/productos/[id]/imagen POST] upload", {
        empresaId,
        productoId,
        message: up.error.message,
      });
      return NextResponse.json(
        errorResponse(`No se pudo subir la imagen. (storage_upload_failed · ${up.error.message.slice(0, 120)})`),
        { status: 502 }
      );
    }

    // 6) Persistir imagen_path + URL pública (bucket público) via PostgREST.
    const publicUrl = publicProductoImagenUrl(path);
    let updated;
    try {
      updated = await updateProductoPostgrest(jwt, empresaId, productoId, {
        imagen_path: path,
        imagen_url: publicUrl,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[/api/productos/[id]/imagen POST] persist", msg);
      return NextResponse.json(
        errorResponse(`No se pudo asociar la imagen al producto. (db_update_failed · ${msg.slice(0, 120)})`),
        { status: 502 }
      );
    }
    if (!updated) {
      return NextResponse.json(
        errorResponse("No se pudo asociar la imagen al producto."),
        { status: 500 }
      );
    }

    return NextResponse.json(
      successResponse({ imagen_path: path, imagen_url: publicUrl })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/productos/[id]/imagen POST] outer", msg);
    return NextResponse.json(
      errorResponse(`No se pudo subir la imagen. (${diagnostic([msg.slice(0, 160)])})`),
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const prod = await getProductoPostgrest(jwt, empresaId, productoId);
    if (!prod) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }

    if (prod.imagen_path && pathBelongsToEmpresa(prod.imagen_path, empresaId)) {
      const storageSupabase = storageClientWithJwt(jwt);
      await storageSupabase.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([prod.imagen_path]);
    }

    await updateProductoPostgrest(jwt, empresaId, productoId, {
      imagen_path: null,
      imagen_url: null,
    });

    return NextResponse.json(successResponse({ imagen_path: null, imagen_url: null }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/productos/[id]/imagen DELETE]", msg);
    return NextResponse.json(
      errorResponse(`No se pudo quitar la imagen. (${msg.slice(0, 160)})`),
      { status: 500 }
    );
  }
}
