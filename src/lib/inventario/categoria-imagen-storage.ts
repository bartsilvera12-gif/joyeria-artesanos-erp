/**
 * Storage helpers para imágenes de categorías de productos.
 *
 * Reusamos el bucket `productos-imagenes` (mismas policies que producto e
 * imágenes de acordes) con sub-prefijo `categorias/`:
 *
 *   Path: `{empresa_id}/categorias/{categoria_id}/principal.{ext}`
 *
 * El primer segmento sigue siendo `empresa_id`, así que `pathBelongsToEmpresa`
 * valida correctamente paths de categorías.
 */
import {
  PRODUCTOS_IMAGENES_BUCKET,
  ALLOWED_IMAGE_EXT,
} from "@/lib/inventario/imagen-storage";

export function buildCategoriaImagenPath(
  empresaId: string,
  categoriaId: string,
  mime: string
): string {
  const ext = ALLOWED_IMAGE_EXT[mime] ?? "bin";
  return `${empresaId}/categorias/${categoriaId}/principal.${ext}`;
}

export function publicCategoriaImagenUrl(imagenPath: string | null | undefined): string | null {
  if (!imagenPath) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!base) return null;
  const clean = base.replace(/\/$/, "");
  const encoded = imagenPath.split("/").map(encodeURIComponent).join("/");
  return `${clean}/storage/v1/object/public/${PRODUCTOS_IMAGENES_BUCKET}/${encoded}`;
}
