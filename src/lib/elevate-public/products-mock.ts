/**
 * Mock de productos Elevate — FALLBACK VISUAL TEMPORAL.
 *
 * Port directo del archivo `src/data/products.ts` de la repo
 * `C:\NEURA\elevate-fragrance-boutique`. Se usa para que las secciones
 * (Bestsellers, Promos, NewArrivals, Catálogo, Detalle) tengan contenido
 * mientras el catálogo real desde `/api/public/elevate/productos` no tenga
 * filas publicadas.
 *
 * Cuando el endpoint público devuelva productos reales, esos van a
 * reemplazar este mock a nivel page (decisión en cada page server-side
 * sobre si fetchea real o usa mock). El mock se mantiene en repo como
 * referencia visual y como red de seguridad si el endpoint se rompe.
 *
 * NO usar este mock para datos sensibles. Es solo presentación.
 */

export type ProductStatus = "available" | "low" | "out" | "soon";
// Categorías legacy del mock; los productos reales aceptan cualquier string
// (las nuevas se crean desde el ERP y vienen de elevate.categorias_productos).
export type LegacyProductCategory = "Nicho" | "Ultranicho" | "Diseñador" | "Árabe Premium";
export type ProductCategory = LegacyProductCategory | (string & {});

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: ProductCategory;
  type: string;
  price: number;
  oldPrice?: number;
  image: string;
  status: ProductStatus;
  bestseller?: boolean;
  isNew?: boolean;
  promo?: string;
  description: string;
  notes: { top: string[]; heart: string[]; base: string[] };
  concentration: string;
  size: string;
  /** SKU de inventario. Opcional para no romper mocks legacy sin SKU. */
  sku?: string;
  /** Slug de la marca formal (Fase Marcas). Permite navegar Categoría → Marca → Productos. */
  marca_slug?: string | null;
  /** Galería de imágenes (Fase Galería). Ordenadas con principal primero.
   *  Si está vacío, la web usa `image` legacy. */
  gallery?: { url: string; alt: string | null }[];
  /** Precio mayorista informativo (Fase Mayorista). Null/undefined = no mostrar. */
  mayorista?: { precio: number; cantidad_minima: number } | null;
  /** Fase Presentaciones: si true, el detalle obliga a elegir un ml. */
  tienePresentaciones?: boolean;
  /** Precio mínimo entre presentaciones visibles, para mostrar "Desde Gs. X" en cards. */
  precioDesde?: number | null;
  /** Listado completo para el selector en el detalle. */
  presentaciones?: WebPresentacion[];
}

/** Shape simplificado de una presentación expuesto al cliente público. */
export interface WebPresentacion {
  id: string;
  sku: string | null;
  volumen_ml: number | null;
  precio: number;
  precio_normal: number;
  precio_oferta: number | null;
  stock_actual: number;
  disponible: boolean;
  imagen_url: string | null;
  mayorista: { precio: number; cantidad_minima: number } | null;
}

const IMG = "/brand/elevate";

export const products: Product[] = [
  {
    id: "1", slug: "oud-royale",
    name: "Oud Royale", brand: "Maison Élevé", category: "Ultranicho",
    type: "Amaderada · Oriental", price: 189000, oldPrice: 235000,
    image: `${IMG}/perfume-2.jpg`, status: "available", bestseller: true, promo: "Promo especial",
    description: "Una fragancia intensa, sofisticada y envolvente. El oud más puro envuelto en ámbar líquido y resinas preciosas, una declaración de presencia absoluta.",
    notes: { top: ["Azafrán", "Bergamota"], heart: ["Oud", "Rosa de Damasco"], base: ["Ámbar", "Sándalo", "Vainilla"] },
    concentration: "Extrait de Parfum", size: "100 ml",
  },
  {
    id: "2", slug: "ambre-noir",
    name: "Ambre Noir", brand: "Caelum Privé", category: "Nicho",
    type: "Oriental · Especiada", price: 142000,
    image: `${IMG}/perfume-3.jpg`, status: "available", bestseller: true,
    description: "Una composición magnética que evoca la calidez del ámbar fundido sobre piel desnuda al atardecer.",
    notes: { top: ["Pimienta Rosa", "Cardamomo"], heart: ["Ámbar", "Iris"], base: ["Cuero", "Almizcle"] },
    concentration: "Eau de Parfum", size: "75 ml",
  },
  {
    id: "3", slug: "lumiere-dore",
    name: "Lumière Doré", brand: "Atelier Solène", category: "Diseñador",
    type: "Floral · Cítrica", price: 98000, oldPrice: 119000,
    image: `${IMG}/perfume-1.jpg`, status: "low", bestseller: true, promo: "Últimas unidades",
    description: "La luz dorada del Mediterráneo capturada en cristal. Floral solar con un fondo cremoso e inolvidable.",
    notes: { top: ["Bergamota", "Neroli"], heart: ["Jazmín Sambac", "Tuberosa"], base: ["Almizcle Blanco", "Cedro"] },
    concentration: "Eau de Parfum", size: "100 ml",
  },
  {
    id: "4", slug: "velours-rouge",
    name: "Velours Rouge", brand: "Maison Élevé", category: "Ultranicho",
    type: "Gourmand · Floral", price: 215000,
    image: `${IMG}/perfume-4.jpg`, status: "available", isNew: true,
    description: "Una caricia de terciopelo rojo. Frutos del bosque, rosa búlgara y un fondo adictivo de praliné y madera.",
    notes: { top: ["Frambuesa", "Mandarina"], heart: ["Rosa Búlgara", "Pivonia"], base: ["Praliné", "Pachulí"] },
    concentration: "Extrait de Parfum", size: "75 ml",
  },
  {
    id: "5", slug: "noir-absolu",
    name: "Noir Absolu", brand: "Atelier Solène", category: "Diseñador",
    type: "Amaderada · Cuero", price: 87000,
    image: `${IMG}/perfume-3.jpg`, status: "available", isNew: true,
    description: "Un cuero noble vestido de noche. Elegancia masculina sin esfuerzo, profunda y silenciosa.",
    notes: { top: ["Pimienta Negra"], heart: ["Cuero", "Iris"], base: ["Vetiver", "Tabaco"] },
    concentration: "Eau de Parfum", size: "100 ml",
  },
  {
    id: "6", slug: "soleil-d-arabia",
    name: "Soleil d'Arabia", brand: "Hareem Al Sultan", category: "Árabe Premium",
    type: "Oriental · Dulce", price: 76000, oldPrice: 95000,
    image: `${IMG}/perfume-2.jpg`, status: "available", promo: "Oferta limitada",
    description: "Un viaje a los bazares dorados. Miel, dátiles y oud envueltos en una nube de incienso sagrado.",
    notes: { top: ["Dátil", "Miel"], heart: ["Oud", "Rosa"], base: ["Incienso", "Vainilla"] },
    concentration: "Eau de Parfum", size: "100 ml",
  },
  {
    id: "7", slug: "blanc-eternel",
    name: "Blanc Éternel", brand: "Caelum Privé", category: "Nicho",
    type: "Floral Blanca", price: 134000,
    image: `${IMG}/perfume-1.jpg`, status: "soon",
    description: "Flores blancas en plena floración nocturna. Pureza, sensualidad y una estela inolvidable.",
    notes: { top: ["Pera", "Bergamota"], heart: ["Tuberosa", "Gardenia"], base: ["Sándalo", "Almizcle"] },
    concentration: "Eau de Parfum", size: "75 ml",
  },
  {
    id: "8", slug: "epice-imperiale",
    name: "Épice Impériale", brand: "Hareem Al Sultan", category: "Árabe Premium",
    type: "Especiada · Amaderada", price: 92000,
    image: `${IMG}/perfume-4.jpg`, status: "out",
    description: "Especias preciosas, maderas oscuras y un toque de oud para los espíritus indomables.",
    notes: { top: ["Azafrán", "Cardamomo"], heart: ["Oud", "Cuero"], base: ["Sándalo", "Ámbar"] },
    concentration: "Extrait de Parfum", size: "50 ml",
  },
];

export const brands = [
  { name: "Maison Élevé", category: "Ultranicho", description: "Composiciones excepcionales en tiradas limitadas." },
  { name: "Caelum Privé", category: "Nicho", description: "Perfumería de autor con carácter editorial." },
  { name: "Atelier Solène", category: "Diseñador", description: "Clásicos contemporáneos, elegancia accesible." },
  { name: "Hareem Al Sultan", category: "Árabe Premium", description: "Tradición oriental, lujo atemporal." },
];

export const formatPrice = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

/**
 * Número de WhatsApp configurado vía env var
 * `NEXT_PUBLIC_ELEVATE_WHATSAPP_NUMBER` (client-accessible) o
 * `ELEVATE_WHATSAPP_NUMBER` (server-only fallback). Solo dígitos, formato
 * E.164 sin `+`. String vacío si no está configurado — los componentes que
 * lo usan deben tratar `""` como "ocultar CTA".
 *
 * NOTA: Para nuevos sitios usar `getElevateWhatsappNumber()` desde
 * `@/lib/elevate-public/whatsapp`. Este export se mantiene para no romper
 * imports legacy (Footer, checkout).
 */
const RAW_WA =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_ELEVATE_WHATSAPP_NUMBER?.trim() ||
      process.env.ELEVATE_WHATSAPP_NUMBER?.trim())) ||
  "";
export const WHATSAPP_NUMBER = RAW_WA.replace(/\D/g, "");
