/**
 * Fetcher server-side del catálogo público Elevate.
 *
 * Fase 1 catálogo enriquecido: la API ahora expone precio_anterior (tachado),
 * promo_label, status_label, is_new, concentración, volumen, género, familia
 * olfativa y notas (en detalle). El adapter mapea al shape `Product` del mock
 * para que los componentes existentes (ProductCard, ProductDetailClient) sigan
 * funcionando sin cambios estructurales — solo extiende con los campos nuevos.
 *
 * Estrategia:
 *   - API es la fuente primaria.
 *   - Si la API devuelve [] o falla, fallback al mock visual.
 */
import {
  products as mockProducts,
  type Product,
  type ProductStatus,
  type ProductCategory,
} from "./products-mock";

type ApiListaProducto = {
  id: string;
  slug: string | null;
  nombre: string | null;
  marca: string | null;
  precio: number;
  precio_anterior: number | null;
  precio_oferta: number | null;
  oferta_hasta: string | null;
  imagen_url: string | null;
  descripcion_corta: string | null;
  destacado: boolean;
  disponible: boolean;
  is_new: boolean;
  promo_label: string | null;
  status_label: "Disponible" | "Últimas unidades" | "Sin stock" | "Próximamente";
  concentracion: string | null;
  volumen_ml: number | null;
  genero: string | null;
  familia_olfativa: string | null;
  /** Categoría web real desde DB (Fase 1 catálogo administrable). Null si el
   *  producto aún no tiene categoria_principal_id asignada. */
  categoria_nombre?: string | null;
  categoria_slug?: string | null;
  /** Marca formal (Fase Marcas). */
  marca_id?: string | null;
  marca_nombre?: string | null;
  marca_slug?: string | null;
  orden_web: number | null;
  /** Precio mayorista informativo (Fase Mayorista). Null si no debe mostrarse. */
  mayorista?: { precio: number; cantidad_minima: number } | null;
  /** Fase Presentaciones (listado). */
  tiene_presentaciones?: boolean;
  precio_desde?: number | null;
};

export type ApiDetalleProducto = ApiListaProducto & {
  /** SKU expuesto solo en detalle (no en listado), para usar en mensaje WhatsApp. */
  sku?: string | null;
  descripcion_web: string | null;
  notas_top: string[];
  notas_heart: string[];
  notas_base: string[];
  /** Galería ordenada (Fase Galería). Si no hay filas, el server devuelve un
   *  fallback con la imagen legacy. */
  imagenes?: {
    id: string;
    url: string;
    orden: number;
    es_principal: boolean;
    alt_text: string | null;
  }[];
  /** Fase Presentaciones (detalle): lista filtrada+ordenada por el server. */
  presentaciones?: ApiPresentacion[];
};

export type ApiPresentacion = {
  id: string;
  sku: string | null;
  volumen_ml: number | null;
  precio: number;
  precio_normal: number;
  precio_web: number | null;
  precio_oferta: number | null;
  stock_actual: number;
  disponible: boolean;
  imagen_url: string | null;
  visible_web: boolean;
  mayorista: { precio: number; cantidad_minima: number } | null;
};

function defaultCategoryFor(brand: string | null): ProductCategory {
  const b = (brand ?? "").toLowerCase();
  if (b.includes("hareem")) return "Árabe Premium";
  if (b.includes("élevé") || b.includes("eleve")) return "Ultranicho";
  if (b.includes("caelum")) return "Nicho";
  return "Diseñador";
}

function statusFromLabel(label: ApiListaProducto["status_label"]): ProductStatus {
  switch (label) {
    case "Próximamente":
      return "soon";
    case "Sin stock":
      return "out";
    case "Últimas unidades":
      return "low";
    case "Disponible":
    default:
      return "available";
  }
}

function buildSize(volumen_ml: number | null): string {
  return typeof volumen_ml === "number" && volumen_ml > 0 ? `${volumen_ml} ml` : "";
}

/**
 * Adapta producto del API público al shape `Product` que usan los
 * componentes web. Para campos que el mock tenía pero la API no devuelve
 * (category, type), se infiere desde marca/familia.
 */
export function apiToMockProduct(api: ApiListaProducto): Product {
  const fromMock = mockProducts.find((m) => m.slug === api.slug);
  // Resolución de categoría:
  //   1. categoria_nombre REAL de DB (Fase 1: cualquier categoría que el
  //      cliente cree desde el ERP). Se usa cruda — no se normaliza a un set
  //      cerrado para no descartar categorías nuevas.
  //   2. Fallback al mock por slug (compat con productos seed).
  //   3. Inferencia legacy por marca solo si no hay categoría DB ni mock.
  const categoriaDb = (api.categoria_nombre ?? "").trim();
  const category: ProductCategory =
    categoriaDb || fromMock?.category || defaultCategoryFor(api.marca);
  return {
    id: api.id,
    slug: api.slug ?? "",
    name: api.nombre ?? "",
    // Si llega marca formal (Fase Marcas), preferirla — su nombre está
    // saneado por el ERP. Fallback a marca text legacy.
    brand: api.marca_nombre ?? api.marca ?? "",
    marca_slug: api.marca_slug ?? null,
    category,
    type: api.familia_olfativa ?? fromMock?.type ?? "",
    price: api.precio,
    oldPrice: api.precio_anterior ?? undefined,
    image: api.imagen_url ?? fromMock?.image ?? "",
    status: statusFromLabel(api.status_label),
    bestseller: api.destacado || fromMock?.bestseller,
    isNew: api.is_new || undefined,
    promo: api.promo_label ?? undefined,
    description: fromMock?.description ?? api.descripcion_corta ?? "",
    notes: fromMock?.notes ?? { top: [], heart: [], base: [] },
    concentration: api.concentracion ?? fromMock?.concentration ?? "",
    size: buildSize(api.volumen_ml) || fromMock?.size || "",
    mayorista: api.mayorista ?? null,
    tienePresentaciones: api.tiene_presentaciones === true,
    precioDesde:
      typeof api.precio_desde === "number" && api.precio_desde > 0
        ? api.precio_desde
        : null,
  };
}

/**
 * Adapta detalle del API al shape `Product` con notas pobladas desde DB.
 * Si las notas del API están vacías, mantiene las del mock (compat visual
 * mientras se cargan datos reales).
 */
export function apiDetalleToMockProduct(api: ApiDetalleProducto): Product {
  const base = apiToMockProduct(api);
  const apiNotas = {
    top: api.notas_top ?? [],
    heart: api.notas_heart ?? [],
    base: api.notas_base ?? [],
  };
  const totalApi = apiNotas.top.length + apiNotas.heart.length + apiNotas.base.length;
  const gallery = Array.isArray(api.imagenes)
    ? api.imagenes
        .filter((x) => x && x.url)
        .map((x) => ({ url: x.url, alt: x.alt_text }))
    : [];
  const presentaciones = Array.isArray(api.presentaciones)
    ? api.presentaciones.map((p) => ({
        id: p.id,
        sku: p.sku,
        volumen_ml: p.volumen_ml,
        precio: p.precio,
        precio_normal: p.precio_normal,
        precio_oferta: p.precio_oferta,
        stock_actual: p.stock_actual,
        disponible: p.disponible,
        imagen_url: p.imagen_url,
        mayorista: p.mayorista,
      }))
    : [];
  return {
    ...base,
    sku: api.sku ?? undefined,
    description: api.descripcion_web ?? api.descripcion_corta ?? base.description,
    notes: totalApi > 0 ? apiNotas : base.notes,
    gallery,
    presentaciones,
    tienePresentaciones: api.tiene_presentaciones === true,
  };
}

function resolveOriginEnv(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (fromEnv) return fromEnv;
  return "https://elevate.neura.com.py";
}

async function getOrigin(): Promise<string> {
  // Antes leía `headers()` para inferir el host actual. Eso opta out del
  // Data Cache de Next y obliga a SSR por request. La API pública vive en
  // un host estable (NEXT_PUBLIC_BASE_URL o `https://elevate.neura.com.py`),
  // así que con el env alcanza y la página queda cacheable por revalidate.
  return resolveOriginEnv();
}

export type CatalogFetchResult = {
  products: Product[];
  source: "api" | "mock";
};

/**
 * Timeout corto para self-fetch durante build/SSR. Sin timeout, si el Node
 * está bajo carga, la página espera 60s+ a sí misma y arrastra al server.
 */
const FETCH_TIMEOUT_MS = 5000;

function fetchWithTimeout(url: string, init: RequestInit, ms = FETCH_TIMEOUT_MS): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...init, signal: ac.signal }).finally(() => clearTimeout(t));
}

/** Listado completo del catálogo público. API primaria, mock fallback. */
export async function fetchCatalog(params?: {
  destacado?: boolean;
  nuevos?: boolean;
  promos?: boolean;
  limit?: number;
  /** Filtros Fase Marcas: navegación Categoría → Marca → Productos. */
  categoria?: string | null;
  marca?: string | null;
}): Promise<CatalogFetchResult> {
  try {
    const origin = await getOrigin();
    const qs = new URLSearchParams({ limit: String(params?.limit ?? 100) });
    if (params?.destacado) qs.set("destacado", "true");
    if (params?.nuevos) qs.set("nuevos", "true");
    if (params?.promos) qs.set("promos", "true");
    if (params?.categoria) qs.set("categoria", params.categoria);
    if (params?.marca) qs.set("marca", params.marca);
    const r = await fetchWithTimeout(`${origin}/api/public/elevate/productos?${qs.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return { products: applyFallback(params), source: "mock" };
    const data = (await r.json()) as { productos?: ApiListaProducto[] };
    const list = Array.isArray(data.productos) ? data.productos : [];
    if (list.length === 0) return { products: applyFallback(params), source: "mock" };
    return { products: list.map(apiToMockProduct), source: "api" };
  } catch {
    return { products: applyFallback(params), source: "mock" };
  }
}

/** Detalle por slug. API primaria, mock fallback. Devuelve null si no existe. */
export async function fetchProductoDetalle(
  slug: string
): Promise<{ product: Product; source: "api" | "mock" } | null> {
  try {
    const origin = await getOrigin();
    const r = await fetchWithTimeout(`${origin}/api/public/elevate/productos/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (r.status === 404) {
      const fromMock = mockProducts.find((m) => m.slug === slug);
      return fromMock ? { product: fromMock, source: "mock" } : null;
    }
    if (!r.ok) {
      const fromMock = mockProducts.find((m) => m.slug === slug);
      return fromMock ? { product: fromMock, source: "mock" } : null;
    }
    const data = (await r.json()) as { producto?: ApiDetalleProducto };
    if (!data.producto) {
      const fromMock = mockProducts.find((m) => m.slug === slug);
      return fromMock ? { product: fromMock, source: "mock" } : null;
    }
    return { product: apiDetalleToMockProduct(data.producto), source: "api" };
  } catch {
    const fromMock = mockProducts.find((m) => m.slug === slug);
    return fromMock ? { product: fromMock, source: "mock" } : null;
  }
}

function applyFallback(params?: {
  destacado?: boolean;
  nuevos?: boolean;
  promos?: boolean;
}): Product[] {
  let list = [...mockProducts];
  if (params?.destacado) list = list.filter((p) => p.bestseller);
  if (params?.nuevos) list = list.filter((p) => p.isNew);
  if (params?.promos) list = list.filter((p) => p.oldPrice != null);
  return list;
}

// ─── Categorías web (Fase 1 catálogo administrable) ──────────────────────

export type CategoriaWeb = {
  id: string;
  nombre: string;
  slug: string | null;
  descripcion: string | null;
  orden: number | null;
};

// ─── Marcas web (Fase Marcas) ─────────────────────────────────────────────

export type MarcaWeb = {
  id: string;
  nombre: string;
  slug: string | null;
  descripcion: string | null;
  logo_url: string | null;
  orden: number | null;
};

/**
 * Marcas visibles. Si se pasa `categoriaSlug`, devuelve solo marcas que
 * tienen al menos un producto visible dentro de esa categoría.
 */
export async function fetchMarcasPublic(
  categoriaSlug?: string | null
): Promise<MarcaWeb[]> {
  try {
    const origin = await getOrigin();
    const qs = new URLSearchParams();
    if (categoriaSlug) qs.set("categoria", categoriaSlug);
    const url = `${origin}/api/public/elevate/marcas${qs.toString() ? "?" + qs.toString() : ""}`;
    const r = await fetchWithTimeout(url, { next: { revalidate: 60 } });
    if (!r.ok) return [];
    const data = (await r.json()) as { marcas?: MarcaWeb[] };
    return Array.isArray(data.marcas) ? data.marcas : [];
  } catch {
    return [];
  }
}

/**
 * Listado de categorías visibles del catálogo público. API primaria; si falla,
 * devolvemos el set legacy hardcodeado para no romper el filtro.
 */
export async function fetchCategoriasPublic(): Promise<CategoriaWeb[]> {
  const fallback: CategoriaWeb[] = [
    { id: "fb-nicho", nombre: "Nicho", slug: "nicho", descripcion: null, orden: 10 },
    { id: "fb-ultra", nombre: "Ultranicho", slug: "ultranicho", descripcion: null, orden: 20 },
    { id: "fb-dise", nombre: "Diseñador", slug: "disenador", descripcion: null, orden: 30 },
    { id: "fb-arab", nombre: "Árabe Premium", slug: "arabe-premium", descripcion: null, orden: 40 },
  ];
  try {
    const origin = await getOrigin();
    const r = await fetchWithTimeout(`${origin}/api/public/elevate/categorias`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return fallback;
    const data = (await r.json()) as { categorias?: CategoriaWeb[] };
    const list = Array.isArray(data.categorias) ? data.categorias : [];
    if (list.length === 0) return fallback;
    return list;
  } catch {
    return fallback;
  }
}
