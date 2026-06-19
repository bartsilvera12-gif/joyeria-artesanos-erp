/**
 * Storage helpers para imagenes de producto.
 *
 * Bucket: `productos-imagenes` (privado).
 * Path:   `{empresa_id}/{producto_id}/principal.{ext}`
 *
 * Aislamiento por tenant: el primer segmento del path es `empresa_id` y los
 * endpoints siempre validan el `empresa_id` del usuario antes de leer/escribir.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const PRODUCTOS_IMAGENES_BUCKET = "productos-imagenes";

/**
 * URL pública directa al objeto del bucket. Requiere que el bucket esté
 * marcado como `public=true` en `storage.buckets`. Se usa en endpoints
 * públicos (catálogo web) donde NO queremos firmar en cada request
 * (rompería el cache del CDN).
 *
 * Devuelve null si falta config o si imagen_path está vacío.
 */
export function publicProductoImagenUrl(imagenPath: string | null | undefined): string | null {
  if (!imagenPath) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!base) return null;
  const clean = base.replace(/\/$/, "");
  // Path safe: imagen_path = "{empresa_id}/{producto_id}/principal.{ext}"
  const encoded = imagenPath.split("/").map(encodeURIComponent).join("/");
  return `${clean}/storage/v1/object/public/${PRODUCTOS_IMAGENES_BUCKET}/${encoded}`;
}

export const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ALLOWED_IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

let bucketEnsured = false;

/**
 * Crea el bucket privado si no existe. Idempotente. Cachea el flag en memoria
 * del proceso para no llamar listBuckets en cada request.
 *
 * Requiere un cliente con service role (puede ser el del tenant ya que las
 * operaciones de storage usan la misma key).
 */
export async function ensureProductosImagenesBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data: existing } = await supabase.storage.getBucket(PRODUCTOS_IMAGENES_BUCKET);
    if (existing) {
      bucketEnsured = true;
      return;
    }
  } catch {
    // fallthrough — intentar crear
  }
  const { error: createErr } = await supabase.storage.createBucket(PRODUCTOS_IMAGENES_BUCKET, {
    public: false,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
    throw new Error(`No se pudo crear el bucket: ${createErr.message}`);
  }
  bucketEnsured = true;
}

export function buildProductoImagenPath(empresaId: string, productoId: string, mime: string): string {
  const ext = ALLOWED_IMAGE_EXT[mime] ?? "bin";
  return `${empresaId}/${productoId}/principal.${ext}`;
}

/**
 * Genera URL firmada para visualizar la imagen. TTL por defecto 1h.
 * Devuelve null si el path es inválido o si falla.
 */
export async function signProductoImagen(
  supabase: AppSupabaseClient,
  imagenPath: string | null | undefined,
  ttlSeconds = 3600
): Promise<string | null> {
  if (!imagenPath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(PRODUCTOS_IMAGENES_BUCKET)
      .createSignedUrl(imagenPath, ttlSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Valida que el path pertenezca a la empresa indicada (primer segmento).
 * Previene cross-tenant en operaciones que reciben paths arbitrarios.
 */
export function pathBelongsToEmpresa(path: string | null | undefined, empresaId: string): boolean {
  if (!path) return false;
  const seg = path.split("/")[0];
  return seg === empresaId;
}

/**
 * Valida que el path corresponde a un objeto gestionado por nosotros en el
 * bucket `productos-imagenes`:
 *
 *   - NO empieza con http:// ni https:// (descarta URLs absolutas).
 *   - NO empieza con `/` (descarta assets estáticos de Next como
 *     `/brand/elevate/...` que pueden quedar en filas legacy/backfill).
 *   - El primer segmento es el empresa_id (aislamiento por tenant).
 *   - Hay al menos un segundo segmento (producto_id) y un archivo.
 *
 * Usar esta función ANTES de llamar a `storage.remove(...)` o de propagar
 * un path a `productos.imagen_path`. Para los paths que no pasan, se debe
 * borrar la fila DB pero NO tocar storage, y al mirrorear a productos se
 * usa `null` en `imagen_path` (manteniendo `imagen_url` legacy).
 */
export function isManagedBucketPath(
  path: string | null | undefined,
  empresaId: string
): boolean {
  if (!path) return false;
  if (/^https?:\/\//i.test(path)) return false;
  if (path.startsWith("/")) return false;
  const parts = path.split("/").filter((s) => s.length > 0);
  if (parts.length < 3) return false; // empresa_id/producto_id/archivo (mínimo)
  return parts[0] === empresaId;
}
