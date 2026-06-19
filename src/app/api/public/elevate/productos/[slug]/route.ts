/**
 * GET /api/public/elevate/productos/[slug]
 *
 * Detalle público del producto. Incluye descripción larga, concentración,
 * volumen, género, familia olfativa, pirámide de notas (top/heart/base),
 * y derivaciones de precio/promo/status.
 */
import { NextRequest, NextResponse } from "next/server";
import { elevatePublicCorsHeaders, PUBLIC_CATALOG_CACHE } from "@/lib/public-api/cors";
import { postgrestGet } from "@/lib/elevate-public/catalog-postgrest";

// Sin `force-dynamic`: respeta el Cache-Control público
// (`public, s-maxage=300, stale-while-revalidate=120`). Filtros activo +
// visible_web + slug_web previenen exposición de productos privados.

// NOTA: NO incluir `sku` aquí. El rol `anon` de PostgREST tiene column-level
// GRANT SELECT en casi todas las columnas de elevate.productos EXCEPTO `sku`
// (decisión histórica: SKU = identificador interno). Si se pide via PostgREST
// con `select=...,sku,...`, devuelve 403 "permission denied for table
// familias_olfativas" (mensaje engañoso pero la causa real es el sku sin
// grant para anon). Si más adelante se quiere exponer SKU al público hace
// falta autorizar una migración: `GRANT SELECT (sku) ON elevate.productos
// TO anon;`. Por ahora el WhatsApp message del botón "Consultar" usa solo
// nombre + URL del producto cuando sku viene null/undefined.
const PUBLIC_DETAIL_SELECT =
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
  "descripcion_web," +
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
  "familia:familias_olfativas(nombre,descripcion)," +
  "categoria:categoria_principal_id(nombre,slug_web,visible_web,activo)," +
  "marca_ref:marca_id(id,nombre,slug_web,visible_web,activo)," +
  "imagenes:producto_imagenes(id,imagen_url,imagen_path,orden,es_principal,alt_text)," +
  "tiene_presentaciones," +
  "presentaciones:producto_presentaciones(id,sku,volumen_ml,precio_venta,precio_web,precio_oferta,oferta_hasta,precio_mayorista,cantidad_minima_mayorista,visible_mayorista_web,stock_actual,stock_minimo,imagen_url,visible_web,activo,orden)," +
  "notas:producto_notas(posicion,orden,nota:notas_olfativas(nombre))";

type FamiliaRef = { nombre: string | null; descripcion: string | null } | null;
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
type NotaRow = {
  posicion: "top" | "heart" | "base";
  orden: number | null;
  nota: { nombre: string | null } | null;
};
type ImagenRow = {
  id: string;
  imagen_url: string | null;
  imagen_path: string | null;
  orden: number | null;
  es_principal: boolean | null;
  alt_text: string | null;
};
type PresentacionRow = {
  id: string;
  sku: string | null;
  volumen_ml: number | null;
  precio_venta: number | null;
  precio_web: number | null;
  precio_oferta: number | null;
  oferta_hasta: string | null;
  precio_mayorista: number | null;
  cantidad_minima_mayorista: number | null;
  visible_mayorista_web: boolean | null;
  stock_actual: number | null;
  stock_minimo: number | null;
  imagen_url: string | null;
  visible_web: boolean | null;
  activo: boolean | null;
  orden: number | null;
};

type ProductoDetalleRaw = {
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
  descripcion_web: string | null;
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
  familia: FamiliaRef;
  categoria: CategoriaRef;
  marca_ref: MarcaRef;
  imagenes: ImagenRow[] | null;
  tiene_presentaciones: boolean | null;
  presentaciones: PresentacionRow[] | null;
  notas: NotaRow[] | null;
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
  return nuevo_hasta >= new Date().toISOString().slice(0, 10);
}

function pickNotas(rows: NotaRow[] | null, pos: "top" | "heart" | "base"): string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((n) => n && n.posicion === pos && n.nota?.nombre)
    .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999))
    .map((n) => n.nota!.nombre as string);
}

function toDetalle(r: ProductoDetalleRaw) {
  // Regla Elevate: precio base = precio_venta (precio_web legacy, no
  // se prioriza).
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

  let status_label: "Disponible" | "Últimas unidades" | "Sin stock" | "Próximamente";
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
    descripcion_web: r.descripcion_web,
    destacado: r.destacado === true,
    disponible,
    is_new: isNuevo(r.nuevo_hasta),
    promo_label,
    status_label,
    concentracion: r.concentracion,
    volumen_ml: r.volumen_ml,
    genero: r.genero,
    familia_olfativa: r.familia?.nombre ?? null,
    categoria_nombre:
      r.categoria && r.categoria.visible_web !== false && r.categoria.activo !== false
        ? r.categoria.nombre ?? null
        : null,
    categoria_slug:
      r.categoria && r.categoria.visible_web !== false && r.categoria.activo !== false
        ? r.categoria.slug_web ?? null
        : null,
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
    // Galería ordenada con la principal primero (fallback al imagen_url
     // legacy cuando todavía no hay backfill). Solo URL pública + alt_text.
    imagenes: (() => {
      const rows = Array.isArray(r.imagenes) ? r.imagenes : [];
      if (rows.length === 0) {
        // Fallback legacy: si no hay galería, devolvemos un único elemento
        // con la imagen_url del producto si existe — esto permite que la
        // web pública no tenga que ramificar.
        return r.imagen_url
          ? [
              {
                id: "legacy",
                url: r.imagen_url,
                orden: 0,
                es_principal: true,
                alt_text: null,
              },
            ]
          : [];
      }
      return rows
        .filter((x) => x && x.imagen_url)
        .sort((a, b) => {
          if (a.es_principal && !b.es_principal) return -1;
          if (!a.es_principal && b.es_principal) return 1;
          return (a.orden ?? 999) - (b.orden ?? 999);
        })
        .map((x) => ({
          id: x.id,
          url: x.imagen_url as string,
          orden: x.orden ?? 0,
          es_principal: x.es_principal === true,
          alt_text: x.alt_text,
        }));
    })(),
    // Mayorista informativo (Fase Mayorista). Mismo shape que el listado.
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
    // Presentaciones (Fase Presentaciones). Solo las activas y visibles, con
    // shape simplificado para la web. Precio efectivo: oferta vigente o
    // precio_venta (con fallback a precio_web legacy).
    tiene_presentaciones: r.tiene_presentaciones === true,
    presentaciones: (() => {
      const rows = Array.isArray(r.presentaciones) ? r.presentaciones : [];
      const filtradas = rows.filter((p) => p && p.activo && p.visible_web);
      filtradas.sort(
        (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || (a.volumen_ml ?? 0) - (b.volumen_ml ?? 0)
      );
      return filtradas.map((p) => {
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
        const stock = typeof p.stock_actual === "number" ? p.stock_actual : 0;
        const mayoristaOk =
          p.visible_mayorista_web === true &&
          typeof p.precio_mayorista === "number" &&
          p.precio_mayorista > 0 &&
          typeof p.cantidad_minima_mayorista === "number" &&
          p.cantidad_minima_mayorista >= 1;
        return {
          id: p.id,
          sku: p.sku,
          volumen_ml: p.volumen_ml,
          precio,
          precio_normal: venta,
          precio_web: p.precio_web,
          precio_oferta: ofertaActiva ? p.precio_oferta : null,
          stock_actual: stock,
          disponible: stock > 0,
          imagen_url: p.imagen_url ?? null,
          visible_web: p.visible_web === true,
          mayorista: mayoristaOk
            ? { precio: p.precio_mayorista as number, cantidad_minima: p.cantidad_minima_mayorista as number }
            : null,
        };
      });
    })(),
    notas_top: pickNotas(r.notas, "top"),
    notas_heart: pickNotas(r.notas, "heart"),
    notas_base: pickNotas(r.notas, "base"),
    orden_web: r.orden_web,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: elevatePublicCorsHeaders() });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const cleanSlug = (slug ?? "").trim();
    if (!cleanSlug || cleanSlug.length > 200) {
      return NextResponse.json(
        { error: "Slug inválido" },
        { status: 400, headers: elevatePublicCorsHeaders() }
      );
    }

    const qs = new URLSearchParams({
      select: PUBLIC_DETAIL_SELECT,
      activo: "eq.true",
      visible_web: "eq.true",
      slug_web: `eq.${cleanSlug}`,
      limit: "1",
    });

    const result = await postgrestGet<ProductoDetalleRaw>("productos", qs.toString());
    if (!result.ok) {
      console.error("[/api/public/elevate/productos/[slug] GET]", result.error);
      return NextResponse.json(
        { error: "No se pudo cargar el producto." },
        { status: 502, headers: elevatePublicCorsHeaders() }
      );
    }
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404, headers: elevatePublicCorsHeaders() }
      );
    }
    return NextResponse.json(
      { producto: toDetalle(result.rows[0]) },
      {
        status: 200,
        headers: { ...PUBLIC_CATALOG_CACHE, ...elevatePublicCorsHeaders() },
      }
    );
  } catch (err) {
    console.error(
      "[/api/public/elevate/productos/[slug] GET] uncaught",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "No se pudo cargar el producto." },
      { status: 500, headers: elevatePublicCorsHeaders() }
    );
  }
}
