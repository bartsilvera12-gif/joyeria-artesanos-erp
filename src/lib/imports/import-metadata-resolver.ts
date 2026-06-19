/**
 * Helpers reutilizables para resolver metadata de productos importados desde
 * Excel. Toman columnas crudas + texto libre (nombre/modelo/descripción) y
 * devuelven los campos canónicos (marca_id, género, concentración, volumen_ml).
 *
 * Diseñado para inferir desde múltiples fuentes: si la columna directa está
 * vacía o usa una variante no canónica, busca en el resto del texto libre.
 *
 * Alcance estricto: este módulo NO crea marcas ni consulta DB — solo razona
 * contra catálogos que se le pasan como parámetro.
 */

import { CONCENTRACIONES } from "@/lib/inventario/concentraciones";

/**
 * Normaliza texto para comparación tolerante:
 * - NFD + strip de combining marks (quita acentos: "varón" → "varon")
 * - lowercase
 * - reemplaza puntuación común por espacio
 * - colapsa múltiples espacios
 */
export function normalizeText(s: string): string {
  if (!s) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}<>"'`/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokeniza un texto normalizado en palabras. */
export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(/[\s\-_]+/)
    .filter(Boolean);
}

/** Distancia de Levenshtein (tope práctico ~30 chars). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev: number[] = new Array(b.length + 1);
  const curr: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

// ────────────────────────────────────────────────────────────────────────────
// MARCA
// ────────────────────────────────────────────────────────────────────────────

export interface MarcaCatalogo {
  id: string;
  nombre: string;
}

export interface BrandDetectResult {
  /** UUID de la marca matcheada en el catálogo, si aplica. */
  marca_id: string | null;
  /** Nombre canónico de la marca matcheada (lo que está en `marcas.nombre`). */
  matched_name: string | null;
  /** Texto crudo legacy si no hubo match en el catálogo. */
  marca_legacy_text: string | null;
  /** Mensaje informativo (cómo se resolvió o por qué no). */
  warning: string | null;
}

/**
 * Aliases comunes de marcas. Mapea acrónimos cortos a sus nombres
 * completos (que después se buscan exactos contra el catálogo).
 */
const BRAND_ALIASES: Record<string, string[]> = {
  pdm: ["parfums de marly", "parfums de marly paris"],
  ysl: ["yves saint laurent"],
  ch: ["carolina herrera"],
  jpg: ["jean paul gaultier"],
  dg: ["dolce gabbana", "dolce & gabbana", "dolce and gabbana"],
  tf: ["tom ford"],
  ck: ["calvin klein"],
  ga: ["giorgio armani"],
  da: ["dior", "christian dior"],
};

/**
 * Detecta una marca leyendo texto crudo y comparando contra el catálogo
 * de marcas existentes (NUNCA crea marcas nuevas).
 *
 * Estrategia (en orden):
 *   1. Match exacto normalizado (case/accent insensitive).
 *   2. Match alias conocidos (PDM → Parfums de Marly).
 *   3. Match por substring sin espacios (capta "DEMARLY" → "DE MARLY").
 *   4. Fuzzy con Levenshtein <= max(2, len/8) sin espacios.
 *   5. Match por prefijo de tokens (1-3 palabras iniciales).
 *
 * Si ningún paso resuelve, devuelve `marca_legacy_text` con el texto original.
 */
export function detectBrandFromText(
  raw: string,
  brands: MarcaCatalogo[]
): BrandDetectResult {
  const result: BrandDetectResult = {
    marca_id: null,
    matched_name: null,
    marca_legacy_text: null,
    warning: null,
  };
  if (!raw || !raw.trim()) return result;
  const rawTrim = raw.trim();
  const norm = normalizeText(rawTrim);
  if (!norm) return result;
  const normNoSpaces = norm.replace(/\s+/g, "");

  // 1) Match exacto normalizado
  for (const b of brands) {
    if (normalizeText(b.nombre) === norm) {
      result.marca_id = b.id;
      result.matched_name = b.nombre;
      return result;
    }
  }

  // 2) Alias conocidos
  const tokens = tokenize(rawTrim);
  for (const [alias, expansions] of Object.entries(BRAND_ALIASES)) {
    if (norm === alias || tokens.includes(alias)) {
      for (const exp of expansions) {
        const target = brands.find((b) => normalizeText(b.nombre) === exp);
        if (target) {
          result.marca_id = target.id;
          result.matched_name = target.nombre;
          result.warning = `Marca "${rawTrim}" mapeada por alias a "${target.nombre}".`;
          return result;
        }
      }
    }
  }

  // 3) Substring sin espacios ("parfumsdemarlyparis" contiene "parfumsdemarly")
  for (const b of brands) {
    const bNoSpace = normalizeText(b.nombre).replace(/\s+/g, "");
    if (bNoSpace.length < 4) continue;
    if (normNoSpaces.includes(bNoSpace) || bNoSpace.includes(normNoSpaces)) {
      result.marca_id = b.id;
      result.matched_name = b.nombre;
      result.warning = `Marca "${rawTrim}" mapeada a "${b.nombre}" por similitud.`;
      return result;
    }
  }

  // 4) Fuzzy sobre versiones sin espacios
  let best: { brand: MarcaCatalogo; dist: number } | null = null;
  for (const b of brands) {
    const bNoSpace = normalizeText(b.nombre).replace(/\s+/g, "");
    if (Math.abs(bNoSpace.length - normNoSpaces.length) > 3) continue;
    const d = levenshtein(normNoSpaces, bNoSpace);
    const threshold = Math.max(2, Math.floor(bNoSpace.length / 8));
    if (d <= threshold && (!best || d < best.dist)) {
      best = { brand: b, dist: d };
    }
  }
  if (best) {
    result.marca_id = best.brand.id;
    result.matched_name = best.brand.nombre;
    result.warning = `Marca "${rawTrim}" mapeada a "${best.brand.nombre}" (typo, distancia ${best.dist}).`;
    return result;
  }

  // 5) Prefijo de tokens (ej "Versace Eros EDT" → marca "Versace")
  for (const len of [3, 2, 1]) {
    if (tokens.length < len) continue;
    const prefix = tokens.slice(0, len).join(" ");
    for (const b of brands) {
      if (normalizeText(b.nombre) === prefix) {
        result.marca_id = b.id;
        result.matched_name = b.nombre;
        result.warning = `Marca "${b.nombre}" inferida del inicio del texto.`;
        return result;
      }
    }
  }

  // Sin match — legacy
  result.marca_legacy_text = rawTrim;
  result.warning = `Marca "${rawTrim}" no encontrada en catálogo — queda como texto legacy.`;
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// GÉNERO
// ────────────────────────────────────────────────────────────────────────────

export type Gender = "masculino" | "femenino" | "unisex" | null;

const GENDER_PHRASES_FEM = [
  "for her", "for women", "for woman",
  "pour femme", "pour femmes",
  "para ella", "para mujer", "para mujeres",
  "para dama", "para damas",
  "de mujer", "de dama",
  "women's", "womens",
];

const GENDER_PHRASES_MASC = [
  "for him", "for men", "for man",
  "pour homme", "pour hommes",
  "para el", "para hombre", "para hombres",
  "para caballero", "para caballeros",
  "de hombre", "de caballero",
  "men's", "mens",
];

const GENDER_PHRASES_UNI = [
  "para todos", "for all",
  "unisex",
  "compartido", "compartida", "shared",
];

const GENDER_TOKENS_FEM = new Set([
  "mujer", "mujeres", "femenino", "femenina", "feminine",
  "fem", "woman", "women", "womens", "ladies", "lady",
  "girl", "girls", "ella", "ellas", "her", "hers",
  "femme", "femmes", "donna", "donne", "dama", "damas",
]);

const GENDER_TOKENS_MASC = new Set([
  "hombre", "hombres", "varon", "varones",
  "masculino", "masculina", "masculine", "masc",
  "man", "men", "mens", "gentleman", "gentlemen",
  "caballero", "caballeros", "boy", "boys",
  "ellos", "him", "his", "homme", "hommes",
  "uomo", "uomini",
]);

const GENDER_TOKENS_UNI = new Set([
  "unisex", "u", "x", "ambos", "ambas",
  "neutral", "neutro", "mixto", "mixta",
]);

/**
 * Detecta género desde texto libre. Estrategia:
 *   1. Frases compuestas ("for her", "pour homme", "para ella").
 *   2. Tokens sueltos contra sets ES/EN/FR/IT.
 *   3. Si aparecen ambos géneros → unisex con warning.
 */
export function detectGenderFromText(raw: string): {
  genero: Gender;
  warning: string | null;
} {
  if (!raw || !raw.trim()) return { genero: null, warning: null };
  const norm = normalizeText(raw);
  if (!norm) return { genero: null, warning: null };

  // 1) Frases compuestas. Unisex tiene prioridad.
  if (GENDER_PHRASES_UNI.some((p) => norm.includes(p))) {
    return { genero: "unisex", warning: null };
  }
  const phraseFem = GENDER_PHRASES_FEM.some((p) => norm.includes(p));
  const phraseMasc = GENDER_PHRASES_MASC.some((p) => norm.includes(p));
  if (phraseFem && phraseMasc) {
    return {
      genero: "unisex",
      warning: "Texto con marcadores de ambos géneros — interpretado como unisex.",
    };
  }
  if (phraseFem) return { genero: "femenino", warning: null };
  if (phraseMasc) return { genero: "masculino", warning: null };

  // 2) Tokens
  const tokens = tokenize(raw);
  if (tokens.some((t) => GENDER_TOKENS_UNI.has(t))) {
    return { genero: "unisex", warning: null };
  }
  const tokFem = tokens.some((t) => GENDER_TOKENS_FEM.has(t));
  const tokMasc = tokens.some((t) => GENDER_TOKENS_MASC.has(t));
  if (tokFem && tokMasc) {
    return {
      genero: "unisex",
      warning: "Texto con tokens de ambos géneros — interpretado como unisex.",
    };
  }
  if (tokFem) return { genero: "femenino", warning: null };
  if (tokMasc) return { genero: "masculino", warning: null };

  return { genero: null, warning: null };
}

// ────────────────────────────────────────────────────────────────────────────
// CONCENTRACIÓN
// ────────────────────────────────────────────────────────────────────────────

/**
 * Patrones de concentración mapeados al casing canónico del catálogo
 * CONCENTRACIONES. El orden importa: patrones más específicos primero
 * para evitar que "parfum" pise "eau de parfum".
 */
const CONCENTRATION_PATTERNS: Array<{
  patterns: RegExp[];
  canonical: string;
}> = [
  {
    patterns: [/\beau de parfum\b/, /\beau de parfun\b/, /\bedp\b/],
    canonical: "Eau de Parfum",
  },
  {
    patterns: [/\beau de toilette\b/, /\beau de toillete\b/, /\bedt\b/],
    canonical: "Eau de Toilette",
  },
  {
    patterns: [/\beau de cologne\b/, /\bedc\b/, /\bcologne\b/],
    canonical: "Eau de Cologne",
  },
  {
    patterns: [
      /\bextrait de parfum\b/,
      /\bextrait\b/,
      /\bpure parfum\b/,
      /\bperfume puro\b/,
      // "parfum" suelto solo si NO va seguido de "de toilette"
      /\bparfum\b(?!\s+de\s+toilette)/,
    ],
    canonical: "Parfum / Extrait de Parfum",
  },
  {
    patterns: [/\beau fraiche\b/, /\bfraiche\b/],
    canonical: "Eau Fraîche",
  },
  {
    patterns: [/\bbody mist\b/, /\bsplash\b/, /\bbody splash\b/, /\bmist\b/],
    canonical: "Body Mist",
  },
  {
    patterns: [/\bperfume oil\b/, /\bparfum oil\b/, /\baceite\b/, /\boil\b/],
    canonical: "Perfume Oil",
  },
];

/**
 * Detecta concentración desde texto libre y la mapea al casing canónico
 * del catálogo CONCENTRACIONES (para que el `<select>` del form la matchee).
 */
export function detectConcentrationFromText(raw: string): {
  concentracion: string | null;
  warning: string | null;
} {
  if (!raw || !raw.trim()) return { concentracion: null, warning: null };
  const norm = normalizeText(raw);
  if (!norm) return { concentracion: null, warning: null };

  for (const { patterns, canonical } of CONCENTRATION_PATTERNS) {
    for (const p of patterns) {
      if (p.test(norm)) {
        return { concentracion: canonical, warning: null };
      }
    }
  }

  // Fallback: si el texto crudo coincide con un valor del catálogo
  // case-insensitive, devolver el casing canónico.
  for (const c of CONCENTRACIONES) {
    if (normalizeText(c) === norm) {
      return { concentracion: c, warning: null };
    }
  }

  return { concentracion: null, warning: null };
}

// ────────────────────────────────────────────────────────────────────────────
// VOLUMEN ML
// ────────────────────────────────────────────────────────────────────────────

/**
 * Conversión aproximada oz → ml. Mantiene los valores comerciales típicos
 * de perfumería (3.4 oz = 100 ml, 1.7 oz = 50 ml, 1 oz = 30 ml).
 * Para otros valores aplica 1 oz ≈ 30 ml (round).
 */
function ozToMl(oz: number): number {
  if (Math.abs(oz - 3.4) < 0.2) return 100;
  if (Math.abs(oz - 1.7) < 0.2) return 50;
  if (Math.abs(oz - 1.0) < 0.2) return 30;
  if (Math.abs(oz - 6.7) < 0.2) return 200;
  if (Math.abs(oz - 0.5) < 0.1) return 15;
  if (Math.abs(oz - 0.34) < 0.1) return 10;
  return Math.round(oz * 30);
}

/**
 * Detecta volumen en ml desde texto libre. Maneja:
 *   - "100", "100ml", "100 ml", "100ML", "30 cc"
 *   - "3.4 oz", "1.7 fl oz", "100 ml"
 *
 * Si hay múltiples valores (ej. "100ml + muestra 5ml") prioriza el mayor —
 * asumiendo que muestras son <20ml y el principal es el grande.
 */
export function detectVolumeMlFromText(raw: string): {
  volumen_ml: number | null;
  warning: string | null;
} {
  if (!raw || !raw.trim()) return { volumen_ml: null, warning: null };
  // Normalización local que PRESERVA el punto decimal — `normalizeText` lo
  // reemplaza por espacio y rompe "3.4 oz" → "3 4 oz" haciendo que el regex
  // capture "4 oz" en vez de "3.4 oz".
  const norm = String(raw)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[,;:!?()[\]{}<>"'`/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!norm) return { volumen_ml: null, warning: null };

  const candidates: number[] = [];

  // 1) Números con unidad ml/cc
  const reMl = /(\d+(?:[.,]\d+)?)\s*(?:m\s*l|cc)\b/g;
  let m: RegExpExecArray | null;
  while ((m = reMl.exec(norm)) !== null) {
    const n = Number(m[1].replace(",", "."));
    if (Number.isFinite(n) && n >= 1 && n <= 5000) {
      candidates.push(Math.round(n));
    }
  }

  // 2) Números con unidad oz/fl oz → convertir a ml
  const reOz = /(\d+(?:[.,]\d+)?)\s*(?:fl\s*oz|oz)\b/g;
  while ((m = reOz.exec(norm)) !== null) {
    const oz = Number(m[1].replace(",", "."));
    if (Number.isFinite(oz) && oz > 0 && oz <= 200) {
      candidates.push(ozToMl(oz));
    }
  }

  if (candidates.length > 0) {
    const principal = Math.max(...candidates);
    let warning: string | null = null;
    if (candidates.length > 1) {
      const otros = candidates.filter((v) => v !== principal);
      if (otros.length > 0) {
        warning = `Múltiples volúmenes detectados (${candidates.join(", ")} ml) — se priorizó ${principal} ml.`;
      }
    }
    return { volumen_ml: principal, warning };
  }

  // 3) Solo número sin unidad (aceptamos solo si la celda es un número limpio)
  const onlyNum = norm.match(/^(\d+(?:[.,]\d+)?)$/);
  if (onlyNum) {
    const n = Number(onlyNum[1].replace(",", "."));
    if (Number.isFinite(n) && n >= 1 && n <= 5000) {
      return { volumen_ml: Math.round(n), warning: null };
    }
  }

  return { volumen_ml: null, warning: null };
}

// ────────────────────────────────────────────────────────────────────────────
// RESOLVE METADATA (orquesta todo)
// ────────────────────────────────────────────────────────────────────────────

export interface ResolveInput {
  /** Valor crudo de la columna MARCA. "" si está vacía. */
  marcaColumn: string;
  /** Valor crudo de la columna GENERO. */
  generoColumn: string;
  /** Valor crudo de la columna CONCENTRACION. */
  concentracionColumn: string;
  /** Valor crudo de la columna VOLUMEN_ML / VOLUMEN (ML) / ML. */
  volumenColumn: string;
  /** Nombre del producto (columna NOMBRE o derivado). */
  nombre: string;
  /** Modelo del producto. */
  modelo: string;
  /** Descripción corta (SKU DESCRIPCION). */
  descripcion: string;
}

export interface ResolveOutput {
  marca_id: string | null;
  marca_legacy_text: string | null;
  /** Nombre canónico (lo que tiene el catálogo). Útil para registrar
   *  `productos.marca` consistente con `marcas.nombre`. */
  marca_canonical_name: string | null;
  genero: Gender;
  concentracion: string | null;
  volumen_ml: number | null;
  warnings: string[];
}

/**
 * Orquesta detectBrand/Gender/Concentration/VolumeMl combinando datos de
 * columnas dedicadas y texto libre. Las columnas tienen prioridad — solo
 * busca en nombre/modelo/descripción si la columna está vacía o no se pudo
 * resolver.
 */
export function resolveImportedProductMetadata(
  input: ResolveInput,
  brands: MarcaCatalogo[]
): ResolveOutput {
  const warnings: string[] = [];
  const freeText = [input.nombre, input.modelo, input.descripcion]
    .filter((s) => s && s.trim())
    .join(" ");

  // MARCA — columna primero; si no resuelve, texto libre
  let brand: BrandDetectResult = {
    marca_id: null,
    matched_name: null,
    marca_legacy_text: null,
    warning: null,
  };
  if (input.marcaColumn.trim()) {
    brand = detectBrandFromText(input.marcaColumn, brands);
  }
  if (!brand.marca_id && freeText.trim()) {
    // Buscamos marca en texto libre solo si columna no resolvió
    const fromText = detectBrandFromText(freeText, brands);
    if (fromText.marca_id) {
      brand = fromText;
      if (fromText.warning) {
        warnings.push(`Marca inferida del texto: ${fromText.matched_name}.`);
      }
    }
  }
  if (brand.warning && brand.marca_id) {
    // Solo logueamos warning de marca cuando hubo match (no para "no encontrada")
    warnings.push(brand.warning);
  } else if (!brand.marca_id && brand.marca_legacy_text) {
    warnings.push(`Marca "${brand.marca_legacy_text}" no encontrada en catálogo — queda como texto legacy. Asignala manualmente.`);
  }

  // GÉNERO — columna primero, después texto libre
  let gender: { genero: Gender; warning: string | null } = { genero: null, warning: null };
  if (input.generoColumn.trim()) {
    gender = detectGenderFromText(input.generoColumn);
    if (!gender.genero) {
      warnings.push(`Género "${input.generoColumn}" no reconocido — se intenta inferir del texto.`);
    }
  }
  if (!gender.genero && freeText.trim()) {
    const r = detectGenderFromText(freeText);
    if (r.genero) {
      gender = r;
      warnings.push(`Género inferido del texto: ${r.genero}.`);
    } else if (r.warning) {
      warnings.push(r.warning);
    }
  }
  if (gender.warning && !warnings.includes(gender.warning)) {
    warnings.push(gender.warning);
  }

  // CONCENTRACIÓN — columna primero
  let conc: { concentracion: string | null; warning: string | null } = {
    concentracion: null,
    warning: null,
  };
  if (input.concentracionColumn.trim()) {
    conc = detectConcentrationFromText(input.concentracionColumn);
    if (!conc.concentracion) {
      // Preservar legacy si no matchea catálogo
      conc.concentracion = input.concentracionColumn.trim();
      warnings.push(
        `Concentración "${input.concentracionColumn.trim()}" fuera del catálogo — se preserva como legacy.`
      );
    }
  }
  if (!conc.concentracion && freeText.trim()) {
    const r = detectConcentrationFromText(freeText);
    if (r.concentracion) {
      conc = r;
      warnings.push(`Concentración inferida del texto: ${r.concentracion}.`);
    }
  }

  // VOLUMEN — columna primero
  let vol: { volumen_ml: number | null; warning: string | null } = {
    volumen_ml: null,
    warning: null,
  };
  if (input.volumenColumn.trim()) {
    vol = detectVolumeMlFromText(input.volumenColumn);
  }
  if (vol.volumen_ml == null && freeText.trim()) {
    const r = detectVolumeMlFromText(freeText);
    if (r.volumen_ml != null) {
      vol = r;
      warnings.push(`Volumen inferido del texto: ${r.volumen_ml} ml.`);
    }
  }
  if (vol.warning && !warnings.includes(vol.warning)) {
    warnings.push(vol.warning);
  }

  return {
    marca_id: brand.marca_id,
    marca_canonical_name: brand.matched_name,
    marca_legacy_text: brand.marca_legacy_text,
    genero: gender.genero,
    concentracion: conc.concentracion,
    volumen_ml: vol.volumen_ml,
    warnings,
  };
}
