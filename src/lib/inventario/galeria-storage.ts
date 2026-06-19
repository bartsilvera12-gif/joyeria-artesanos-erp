/**
 * Storage helpers para galería de imágenes (Fase Galería). Reusa el bucket
 * `productos-imagenes` ya configurado para imagen principal legacy.
 *
 * Path: `{empresa_id}/{producto_id}/galeria/{uuid}.{ext}`
 *
 * Diferencia con `imagen-storage.ts`:
 *   - Aquí cada imagen tiene un nombre único (UUID) — permite varias por
 *     producto sin sobreescribirse.
 *   - El helper legacy usa `principal.{ext}` (fijo por producto).
 */
import { randomUUID } from "crypto";
import {
  ALLOWED_IMAGE_EXT,
  PRODUCTOS_IMAGENES_BUCKET,
  publicProductoImagenUrl,
} from "./imagen-storage";

export { PRODUCTOS_IMAGENES_BUCKET, publicProductoImagenUrl };

export function buildGaleriaImagenPath(
  empresaId: string,
  productoId: string,
  mime: string
): string {
  const ext = ALLOWED_IMAGE_EXT[mime] ?? "bin";
  return `${empresaId}/${productoId}/galeria/${randomUUID()}.${ext}`;
}
