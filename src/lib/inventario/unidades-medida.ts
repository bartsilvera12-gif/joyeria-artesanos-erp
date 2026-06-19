/**
 * Catálogo cerrado de unidades de medida soportadas en Inventario.
 *
 * Se guarda siempre en MAYÚSCULAS y normalizado. Los productos legacy con un
 * valor fuera de catálogo se muestran como opción extra "Actual: <valor>"
 * para no romper el formulario al editarlos.
 */

export const UNIDADES_MEDIDA = [
  "UNIDAD",
  "ML",
  "LITRO",
  "GRAMO",
  "KG",
  "CAJA",
  "PACK",
  "FRASCO",
] as const;

export type UnidadMedida = (typeof UNIDADES_MEDIDA)[number];

export const DEFAULT_UNIDAD_MEDIDA: UnidadMedida = "UNIDAD";

/** Normaliza un valor libre a su forma canónica (trim + uppercase). */
export function normalizeUnidadMedida(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().toUpperCase();
}

/** True si el valor normalizado pertenece al catálogo cerrado. */
export function isUnidadMedidaCanonica(v: string): v is UnidadMedida {
  return (UNIDADES_MEDIDA as readonly string[]).includes(v);
}
