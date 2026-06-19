/**
 * Storage helpers para imágenes de acordes olfativos.
 *
 * Reusamos el bucket público `productos-imagenes` (mismas policies que las
 * imágenes de producto) con un sub-prefijo `acordes/`:
 *
 *   Path: `{empresa_id}/acordes/{acorde_id}/principal.{ext}`
 *
 * Aislamiento por tenant: el primer segmento sigue siendo `empresa_id`, igual
 * que en imágenes de producto, así que `pathBelongsToEmpresa` también valida
 * paths de acordes correctamente.
 */
import {
  PRODUCTOS_IMAGENES_BUCKET,
  ALLOWED_IMAGE_EXT,
} from "@/lib/inventario/imagen-storage";

export function buildAcordeImagenPath(
  empresaId: string,
  acordeId: string,
  mime: string
): string {
  const ext = ALLOWED_IMAGE_EXT[mime] ?? "bin";
  return `${empresaId}/acordes/${acordeId}/principal.${ext}`;
}

export function publicAcordeImagenUrl(imagenPath: string | null | undefined): string | null {
  if (!imagenPath) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!base) return null;
  const clean = base.replace(/\/$/, "");
  const encoded = imagenPath.split("/").map(encodeURIComponent).join("/");
  return `${clean}/storage/v1/object/public/${PRODUCTOS_IMAGENES_BUCKET}/${encoded}`;
}
