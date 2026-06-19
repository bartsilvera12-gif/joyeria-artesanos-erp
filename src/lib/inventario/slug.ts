/**
 * Genera un slug url-safe a partir de un nombre.
 *
 * Reglas:
 *   - minúsculas
 *   - sin acentos (NFD strip)
 *   - solo a-z, 0-9 y guiones
 *   - espacios y otros separadores → guion
 *   - sin guiones dobles
 *   - sin guion al inicio ni al final
 *   - máximo 80 caracteres (corte limpio en guion)
 *
 * Ejemplos:
 *   "Oud Royale"                   → "oud-royale"
 *   "Valentino Uomo Born in Roma"  → "valentino-uomo-born-in-roma"
 *   "Blanc Éternel"                → "blanc-eternel"
 *   "Soleil d'Arabia"              → "soleil-d-arabia"
 *   "  Épice  Impériale  "         → "epice-imperiale"
 */
export function slugifyNombre(input: string): string {
  if (!input) return "";
  const norm = input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (norm.length <= 80) return norm;
  const cut = norm.slice(0, 80);
  // Corte limpio en el último guion (evita palabras partidas a la mitad).
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 40 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}
