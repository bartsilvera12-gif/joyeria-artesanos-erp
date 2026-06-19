/**
 * GET /api/public/elevate/productos
 *
 * Listado público del catálogo Elevate (sin auth). Fase 1 catálogo enriquecido:
 * incluye precio_oferta vigente, nuevo_hasta, concentración, volumen, género,
 * familia olfativa, y derivaciones de status_label / is_new / promo_label.
 *
 * Seguridad:
 *  - Whitelist estricta. Nunca `select=*`.
 *  - NO se exponen costo_promedio, proveedor_principal_id, stock_actual numérico,
 *    ni cualquier otro dato interno.
 *  - stock_actual sólo se consulta para derivar booleanos/labels; nunca se
 *    devuelve al cliente.
 *  - Filtros forzados: activo=true AND visible_web=true.
 *  - CORS controlado por ELEVATE_PUBLIC_WEB_ORIGIN.
 *
 * Query params:
 *   ?limit=20        1..100 (default 20)
 *   ?page=1          >=1 (default 1)
 *   ?destacado=true  solo destacados
 *   ?nuevos=true     solo isNew (nuevo_hasta >= hoy)
 *   ?promos=true     solo con oferta vigente
 */
import { NextRequest, NextResponse } from "next/server";
import { elevatePublicCorsHeaders, PUBLIC_CATALOG_CACHE } from "@/lib/public-api/cors";
import { postgrestGet } from "@/lib/elevate-public/catalog-postgrest";

// Sin `force-dynamic`: el endpoint público respeta su Cache-Control
// (`public, s-maxage=300, stale-while-revalidate=120`) y queda apto para
// caché del CDN/browser. Los filtros `activo=true AND visible_web=true`
// más el strip de costo/stock numérico garantizan que el cache nunca
// expone datos privados.

/**
 * Columnas crudas pedidas a PostgREST. stock_actual + stock_minimo +
 * proximamente quedan SOLO en server-side; se eliminan antes de responder.
 */
const PUBLIC_SELECT =
  "id," +
  "slug:slug_web," +
  "nombre," +
  "marca," +
  "precio_web," +
  "precio_venta," +
  "precio_oferta," +
  "oferta_hasta," +
  "nuevo_hasta," +
  "imagen_url," +
  "descripcion_corta," +
  "destacado:destacado_web," +
  "stock_actual," +
  "stock_minimo," +
  "proximamente," +
  "concentracion," +
  "volumen_ml," +
  "genero," +
  "orden_web," +
  "precio_mayorista," +
  "cantidad_minima_mayorista," +
  "visible_mayorista_web," +
  "tiene_presentaciones," +
  "presentaciones:producto_presentaciones(precio_venta,precio_web,precio_oferta,oferta_hasta,activo,visible_web,stock_actual)," +
  "familia:familias_olfativas(nombre)," +
  "categoria:categoria_principal_id(nombre,slug_web,visible_web,activo)," +
  "marca_ref:marca_id(id,nombre,slug_web,visible_web,activo)";

type FamiliaRef = { nombre: string | null } | null;
type CategoriaRef = {
  nombre: string | null;
  slug_web: string | null;
  visible_web: boolean | null;
  activo: boolean | null;
} | null;
type MarcaRef = {
  id: string | null;
  nombre: string | null;
  slug_web: string | null;
  visible_web: boolean | null;
  activo: boolean | null;
} | null;

type ProductoRaw = {
  id: string;
  slug: string | null;
  nombre: string | null;
  marca: string | null;
  precio_web: number | null;
  precio_venta: number | null;
  precio_oferta: number | null;
  oferta_hasta: string | null;
  nuevo_hasta: string | null;
  imagen_url: string | null;
  descripcion_corta: string | null;
  destacado: boolean | null;
  stock_actual: number | null;
  stock_minimo: number | null;
  proximamente: boolean | null;
  concentracion: string | null;
  volumen_ml: number | null;
  genero: string | null;
  orden_web: number | null;
  precio_mayorista: number | null;
  cantidad_minima_mayorista: number | null;
  visible_mayorista_web: boolean | null;
  tiene_presentaciones: boolean | null;
  presentaciones:
    | {
        precio_venta: number | null;
        precio_web: number | null;
        precio_oferta: number | null;
        oferta_hasta: string | null;
        activo: boolean | null;
        visible_web: boolean | null;
        stock_actual: number | null;
      }[]
    | null;
  familia: FamiliaRef;
  categoria: CategoriaRef;
  marca_ref: MarcaRef;
};

export type ProductoPublico = {
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
  categoria_nombre: string | null;
  categoria_slug: string | null;
  marca_id: string | null;
  marca_nombre: string | null;
  marca_slug: string | null;
  orden_web: number | null;
  /** Precio mayorista informativo (Fase Mayorista). Solo se exponen los 3
   *  campos si visible_mayorista_web=true Y precio>0 Y cantidad>=1. */
  mayorista: { precio: number; cantidad_minima: number } | null;
  /** Fase Presentaciones: true si el producto tiene >=1 presentación visible.
   *  La card debe llevar al detalle y obligar a elegir un ml. */
  tiene_presentaciones: boolean;
  /** Mínimo precio efectivo entre presentaciones visibles. Útil para
   *  "Desde Gs. X" en la card. Null si no aplica. */
  precio_desde: number | null;
};

function isOfertaActiva(precio_oferta: number | null, oferta_hasta: string | null): boolean {
  if (precio_oferta == null) return false;
  if (!oferta_hasta) return true;
  const t = Date.parse(oferta_hasta);
  if (Number.isNaN(t)) return true;
  return t > Date.now();
}

function isNuevo(nuevo_hasta: string | null): boolean {
  if (!nuevo_hasta) return false;
  // nuevo_hasta es date; comparar lex (YYYY-MM-DD) contra hoy local UTC suficiente
  const today = new Date().toISOString().slice(0, 10);
  return nuevo_hasta >= today;
}

export function toPublico(r: ProductoRaw): ProductoPublico {
  // Regla Elevate: precio base = precio_venta (precio_web queda como legacy,
  // no se usa para el precio normal mostrado en la web).
  const precioBase =
    typeof r.precio_venta === "number" && Number.isFinite(r.precio_venta)
      ? r.precio_venta
      : typeof r.precio_web === "number" && Number.isFinite(r.precio_web)
      ? r.precio_web
      : 0;
  const ofertaActiva = isOfertaActiva(r.precio_oferta, r.oferta_hasta);
  const precio = ofertaActiva ? (r.precio_oferta as number) : precioBase;
  const precio_anterior = ofertaActiva ? precioBase : null;

  const stock = typeof r.stock_actual === "number" ? r.stock_actual : 0;
  const stockMin = typeof r.stock_minimo === "number" ? r.stock_minimo : 0;
  const proximamente = r.proximamente === true;
  const disponible = stock > 0 && !proximamente;
  const ultimasUnidades = !proximamente && stock > 0 && stock <= stockMin;

  let status_label: ProductoPublico["status_label"];
  if (proximamente) status_label = "Próximamente";
  else if (stock <= 0) status_label = "Sin stock";
  else if (ultimasUnidades) status_label = "Últimas unidades";
  else status_label = "Disponible";

  let promo_label: string | null = null;
  if (ofertaActiva) promo_label = "Promo especial";
  else if (ultimasUnidades) promo_label = "Últimas unidades";

  return {
    id: r.id,
    slug: r.slug,
    nombre: r.nombre,
    marca: r.marca,
    precio,
    precio_anterior,
    precio_oferta: ofertaActiva ? r.precio_oferta : null,
    oferta_hasta: ofertaActiva ? r.oferta_hasta : null,
    imagen_url: r.imagen_url,
    descripcion_corta: r.descripcion_corta,
    destacado: r.destacado === true,
    disponible,
    is_new: isNuevo(r.nuevo_hasta),
    promo_label,
    status_label,
    concentracion: r.concentracion,
    volumen_ml: r.volumen_ml,
    genero: r.genero,
    familia_olfativa: r.familia?.nombre ?? null,
    // Solo exponemos la categoría real si está visible/activa.
    categoria_nombre:
      r.categoria && r.categoria.visible_web !== false && r.categoria.activo !== false
        ? r.categoria.nombre ?? null
        : null,
    categoria_slug:
      r.categoria && r.categoria.visible_web !== false && r.categoria.activo !== false
        ? r.categoria.slug_web ?? null
        : null,
    // Marca formal (Fase Marcas). Si la marca está oculta o inactiva, no la
    // exponemos en el catálogo público (igual que con categoría).
    marca_id:
      r.marca_ref && r.marca_ref.visible_web !== false && r.marca_ref.activo !== false
        ? r.marca_ref.id ?? null
        : null,
    marca_nombre:
      r.marca_ref && r.marca_ref.visible_web !== false && r.marca_ref.activo !== false
        ? r.marca_ref.nombre ?? r.marca ?? null
        : r.marca ?? null,
    marca_slug:
      r.marca_ref && r.marca_ref.visible_web !== false && r.marca_ref.activo !== false
        ? r.marca_ref.slug_web ?? null
        : null,
    orden_web: r.orden_web,
    // Fase Presentaciones: si el producto tiene presentaciones visibles,
    // calculamos el precio "desde" (mínimo precio efectivo entre las
    // visibles+activas con stock). Si no, queda null y el card usa precio normal.
    tiene_presentaciones: r.tiene_presentaciones === true,
    precio_desde: (() => {
      const rows = Array.isArray(r.presentaciones) ? r.presentaciones : [];
      const visibles = rows.filter((p) => p && p.activo && p.visible_web);
      if (visibles.length === 0) return null;
      const precios: number[] = [];
      for (const p of visibles) {
        const venta =
          typeof p.precio_venta === "number" && p.precio_venta > 0
            ? p.precio_venta
            : typeof p.precio_web === "number" && p.precio_web > 0
              ? p.precio_web
              : 0;
        const ofertaActiva =
          typeof p.precio_oferta === "number" &&
          p.precio_oferta > 0 &&
          (!p.oferta_hasta || Date.parse(p.oferta_hasta) > Date.now());
        const precio = ofertaActiva ? (p.precio_oferta as number) : venta;
        if (Number.isFinite(precio) && precio > 0) precios.push(precio);
      }
      return precios.length > 0 ? Math.min(...precios) : null;
    })(),
    // Mayorista: solo se expone si está visible y los valores son sanos.
    mayorista:
      r.visible_mayorista_web === true &&
      typeof r.precio_mayorista === "number" &&
      r.precio_mayorista > 0 &&
      typeof r.cantidad_minima_mayorista === "number" &&
      r.cantidad_minima_mayorista >= 1
        ? {
            precio: r.precio_mayorista,
            cantidad_minima: r.cantidad_minima_mayorista,
          }
        : null,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: elevatePublicCorsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const pageRaw = parseInt(url.searchParams.get("page") ?? "1", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
    const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
    const offset = (page - 1) * limit;
    const destacadoOnly = url.searchParams.get("destacado") === "true";
    const nuevosOnly = url.searchParams.get("nuevos") === "true";
    const promosOnly = url.searchParams.get("promos") === "true";
    // Filtros de catálogo Fase Marcas. Se aceptan slug (preferido) o id.
    const marcaSlug = url.searchParams.get("marca")?.trim().toLowerCase() || null;
    const categoriaSlug = url.searchParams.get("categoria")?.trim().toLowerCase() || null;
    // Búsqueda libre (Fase Buscador): match en nombre, marca text y slug.
    // Limitado a 60 chars para no abusar de PostgREST. Escape de comodines.
    const qRaw = url.searchParams.get("q")?.trim() || "";
    const q = qRaw.slice(0, 60).replace(/[%_,]/g, "");

    // Para filtrar productos por slug de marca/categoría usamos `!inner` en el
    // embed correspondiente: convierte el LEFT JOIN en INNER JOIN y permite
    // que el filtro `tablename.col=eq.X` aplique al rowset principal.
    const select = PUBLIC_SELECT
      .replace(
        "marca_ref:marca_id(",
        marcaSlug ? "marca_ref:marca_id!inner(" : "marca_ref:marca_id("
      )
      .replace(
        "categoria:categoria_principal_id(",
        categoriaSlug
          ? "categoria:categoria_principal_id!inner("
          : "categoria:categoria_principal_id("
      );

    const qs = new URLSearchParams({
      select,
      activo: "eq.true",
      visible_web: "eq.true",
      order: "orden_web.asc.nullslast,destacado_web.desc,nombre.asc",
      limit: String(limit),
      offset: String(offset),
    });
    if (destacadoOnly) qs.set("destacado_web", "eq.true");
    if (nuevosOnly) qs.set("nuevo_hasta", `gte.${new Date().toISOString().slice(0, 10)}`);
    if (promosOnly) qs.set("precio_oferta", "not.is.null");
    if (marcaSlug) qs.append("marca_ref.slug_web", `eq.${marcaSlug}`);
    if (categoriaSlug) qs.append("categoria.slug_web", `eq.${categoriaSlug}`);
    // Búsqueda libre: PostgREST `or=` con ilike sobre nombre, marca text y
    // slug_web. La marca text (legacy) refleja el nombre de la marca formal
    // tras la sincronización del ERP, así que cubre Armani/VERSACE/etc.
    if (q) {
      qs.append("or", `(nombre.ilike.*${q}*,marca.ilike.*${q}*,slug_web.ilike.*${q}*)`);
    }

    const result = await postgrestGet<ProductoRaw>("productos", qs.toString());
    if (!result.ok) {
      console.error("[/api/public/elevate/productos GET]", result.error);
      return NextResponse.json(
        { error: "No se pudieron cargar los productos." },
        { status: 502, headers: elevatePublicCorsHeaders() }
      );
    }
    const productos = result.rows.map(toPublico);

    return NextResponse.json(
      { productos, page, limit, count: productos.length },
      {
        status: 200,
        headers: { ...PUBLIC_CATALOG_CACHE, ...elevatePublicCorsHeaders() },
      }
    );
  } catch (err) {
    console.error(
      "[/api/public/elevate/productos GET] uncaught",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "No se pudieron cargar los productos." },
      { status: 500, headers: elevatePublicCorsHeaders() }
    );
  }
}
