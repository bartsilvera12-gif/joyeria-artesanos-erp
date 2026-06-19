/**
 * Galería de imágenes de producto (hasta 5).
 *
 *   GET  /api/productos/[id]/imagenes        — lista
 *   POST /api/productos/[id]/imagenes        — sube nueva (formdata `file`)
 *                                              Body opcional: `es_principal`
 *
 * Auth: JWT del usuario. RLS de elevate.producto_imagenes cubre autorización.
 * Storage: bucket `productos-imagenes` con JWT del usuario (mismo patrón que
 *   el endpoint legacy `/imagen`).
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
import { getProductoPostgrest, updateProductoPostgrest } from "@/lib/inventario/server/productos-postgrest";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  PRODUCTOS_IMAGENES_BUCKET,
  publicProductoImagenUrl,
  isManagedBucketPath,
} from "@/lib/inventario/imagen-storage";
import { buildGaleriaImagenPath } from "@/lib/inventario/galeria-storage";

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

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const jwt = await getAccessTokenForRequest(request);
    const qs = new URLSearchParams({
      select: SELECT_COLS,
      producto_id: `eq.${productoId}`,
      empresa_id: `eq.${ctx.auth.empresa_id}`,
      order: "orden.asc,created_at.asc",
      limit: "10",
    });
    const r = await postgrestGet<ImagenRow>("producto_imagenes", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      console.error("[/api/productos/[id]/imagenes GET]", r.error);
      return NextResponse.json(errorResponse("No se pudo cargar la galería."), { status: 502 });
    }
    return NextResponse.json(successResponse({ imagenes: r.rows }));
  } catch (err) {
    console.error("[/api/productos/[id]/imagenes GET] outer", err);
    return NextResponse.json(errorResponse("No se pudo cargar la galería."), { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    // 1) Ownership del producto
    const prod = await getProductoPostgrest(jwt, empresaId, productoId);
    if (!prod) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    // 2) Conteo actual (gate temprano antes de subir bytes)
    const qsCount = new URLSearchParams({
      select: "id",
      producto_id: `eq.${productoId}`,
      empresa_id: `eq.${empresaId}`,
    });
    const rCount = await postgrestGet<{ id: string }>("producto_imagenes", qsCount.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!rCount.ok) {
      return NextResponse.json(errorResponse("No se pudo verificar la galería."), { status: 502 });
    }
    if (rCount.rows.length >= 5) {
      return NextResponse.json(
        errorResponse("La galería ya tiene 5 imágenes. Eliminá una antes de subir otra."),
        { status: 409 }
      );
    }

    // 3) Validar archivo
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
      return NextResponse.json(
        errorResponse(`Imagen demasiado grande (máx. ${mb} MB).`),
        { status: 413 }
      );
    }

    // 4) Upload al storage
    const path = buildGaleriaImagenPath(empresaId, productoId, file.type);
    const storage = storageClientWithJwt(jwt);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await storage.storage
      .from(PRODUCTOS_IMAGENES_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: false });
    if (up.error) {
      console.error("[/api/productos/[id]/imagenes POST] upload", up.error.message);
      return NextResponse.json(
        errorResponse(`No se pudo subir la imagen. (storage_upload_failed · ${up.error.message.slice(0, 120)})`),
        { status: 502 }
      );
    }
    const publicUrl = publicProductoImagenUrl(path) ?? "";

    // 5) Insert en producto_imagenes
    // Si no hay imágenes previas, ésta nace como principal y orden=0.
    // Si ya hay, va al final (orden = count, máx 4) y NO principal.
    const yaTiene = rCount.rows.length;
    const setPrincipal = form.get("es_principal") === "true" || yaTiene === 0;
    const orden = yaTiene; // 0..4
    const insertBody = {
      empresa_id: empresaId,
      producto_id: productoId,
      imagen_path: path,
      imagen_url: publicUrl,
      orden,
      es_principal: setPrincipal,
    };
    const r = await postgrestRequest<ImagenRow>(
      "producto_imagenes",
      `select=${SELECT_COLS}`,
      {
        method: "POST",
        role: "jwt",
        jwt,
        body: insertBody,
        prefer: "return=representation",
      }
    );
    if (!r.ok) {
      // Si falla la persistencia, intentar limpiar el objeto storage.
      try {
        await storage.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([path]);
      } catch {
        // best-effort
      }
      console.error("[/api/productos/[id]/imagenes POST] insert", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo registrar la imagen. (${(r.error.message ?? "").slice(0, 120)})`),
        { status: 502 }
      );
    }
    const row = r.rows[0];

    // 6) Si la nueva fila quedó como principal, mirror a productos.imagen_url
    //    para que catálogo/card lo refleje sin tocar el endpoint listing.
    //    Defensa simétrica al PATCH/DELETE: solo propagar imagen_path si es
    //    objeto gestionado del bucket (siempre lo es en este path porque lo
    //    acabamos de construir con buildGaleriaImagenPath, pero el guard
    //    defensivo evita cualquier accidente futuro).
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
        console.warn("[/api/productos/[id]/imagenes POST] mirror principal fallo", e);
      }
    }

    return NextResponse.json(successResponse({ imagen: row }), { status: 201 });
  } catch (err) {
    console.error("[/api/productos/[id]/imagenes POST] outer", err);
    return NextResponse.json(errorResponse("No se pudo subir la imagen."), { status: 500 });
  }
}
