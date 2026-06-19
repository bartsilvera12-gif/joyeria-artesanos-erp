/**
 * Catálogo cerrado de concentraciones para perfumes.
 *
 * Evita texto libre en `productos.concentracion`. Para legacy con valores
 * fuera de catálogo se renderiza una opción extra "Actual: …" en el select
 * y el valor se preserva tal cual hasta que el usuario lo normalice.
 */

export const CONCENTRACIONES = [
  "Parfum / Extrait de Parfum",
  "Eau de Parfum",
  "Eau de Toilette",
  "Eau de Cologne",
  "Eau Fraîche",
  "Body Mist",
  "Perfume Oil",
] as const;

export type Concentracion = (typeof CONCENTRACIONES)[number];

/** Comparación case/spacing insensitive contra el catálogo. */
export function isConcentracionCanonica(v: string): v is Concentracion {
  const norm = v.trim().toLowerCase();
  return (CONCENTRACIONES as readonly string[]).some(
    (c) => c.toLowerCase() === norm
  );
}
