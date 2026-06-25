/**
 * POST   /api/inventario/categorias/[id]/imagen → sube/reemplaza la imagen.
 * DELETE /api/inventario/categorias/[id]/imagen → quita la imagen.
 *
 * Bucket: `productos-imagenes` (mismas policies que producto), sub-prefijo
 * `categorias/`. La URL pública se persiste en `imagen_url` como snapshot.
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
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  PRODUCTOS_IMAGENES_BUCKET,
  pathBelongsToEmpresa,
} from "@/lib/inventario/imagen-storage";
import {
  buildCategoriaImagenPath,
  publicCategoriaImagenUrl,
} from "@/lib/inventario/categoria-imagen-storage";

const COLS = "id,empresa_id,imagen_path,imagen_url";

type CategoriaRow = {
  id: string;
  empresa_id: string;
  imagen_path: string | null;
  imagen_url: string | null;
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

async function getCategoria(
  jwt: string | null,
  empresaId: string,
  id: string
): Promise<CategoriaRow | null> {
  const qs = new URLSearchParams({
    select: COLS,
    id: `eq.${id}`,
    empresa_id: `eq.${empresaId}`,
    limit: "1",
  });
  const r = await postgrestGet<CategoriaRow>("categorias_productos", qs.toString(), {
    role: "jwt",
    jwt,
    noStore: true,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.rows[0] ?? null;
}

async function patchImagen(
  jwt: string | null,
  empresaId: string,
  id: string,
  imagen_path: string | null,
  imagen_url: string | null
): Promise<void> {
  const qs = new URLSearchParams({
    id: `eq.${id}`,
    empresa_id: `eq.${empresaId}`,
    select: COLS,
  });
  const r = await postgrestRequest("categorias_productos", qs.toString(), {
    method: "PATCH",
    role: "jwt",
    jwt,
    body: { imagen_path, imagen_url },
    prefer: "return=representation",
  });
  if (!r.ok) throw new Error(r.error.message);
}

export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const cat = await getCategoria(jwt, empresaId, id);
    if (!cat) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Falta el archivo (campo 'file')."), { status: 400 });
    }
    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      return NextResponse.json(errorResponse("Formato no permitido. Usá JPG, PNG o WebP."), { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(errorResponse(`Imagen demasiado grande (máx. ${mb} MB).`), { status: 413 });
    }

    const storageSupabase = storageClientWithJwt(jwt);

    // Borrar imagen anterior si pertenece a la empresa.
    if (cat.imagen_path && pathBelongsToEmpresa(cat.imagen_path, empresaId)) {
      await storageSupabase.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([cat.imagen_path]);
    }

    const path = buildCategoriaImagenPath(empresaId, id, file.type);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await storageSupabase.storage
      .from(PRODUCTOS_IMAGENES_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) {
      console.error("[/api/inventario/categorias/[id]/imagen POST] upload", up.error.message);
      return NextResponse.json(
        errorResponse(`No se pudo subir la imagen. (${up.error.message.slice(0, 120)})`),
        { status: 502 }
      );
    }

    const publicUrl = publicCategoriaImagenUrl(path);
    await patchImagen(jwt, empresaId, id, path, publicUrl);

    return NextResponse.json(successResponse({ imagen_path: path, imagen_url: publicUrl }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/inventario/categorias/[id]/imagen POST] uncaught", msg);
    return NextResponse.json(errorResponse(`No se pudo subir la imagen. (${msg.slice(0, 140)})`), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const cat = await getCategoria(jwt, empresaId, id);
    if (!cat) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    if (cat.imagen_path && pathBelongsToEmpresa(cat.imagen_path, empresaId)) {
      const storageSupabase = storageClientWithJwt(jwt);
      await storageSupabase.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([cat.imagen_path]);
    }
    await patchImagen(jwt, empresaId, id, null, null);

    return NextResponse.json(successResponse({ imagen_path: null, imagen_url: null }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/inventario/categorias/[id]/imagen DELETE]", msg);
    return NextResponse.json(errorResponse(`No se pudo quitar la imagen. (${msg.slice(0, 140)})`), { status: 500 });
  }
}
