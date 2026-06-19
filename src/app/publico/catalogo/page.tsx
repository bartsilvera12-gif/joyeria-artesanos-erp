import { fetchCatalog, fetchCategoriasPublic, fetchMarcasPublic } from "@/lib/elevate-public/catalog-fetch";
import { CatalogClient } from "./CatalogClient";

export const metadata = {
  title: "Catálogo · Elevate Import Export",
  description:
    "Explorá nuestra curaduría completa de perfumes nicho, ultranicho, de diseñador y árabes premium.",
};

// Dinámico explícito (ver nota en /publico/page.tsx): evita el cuelgue del
// prerender durante `next build` por self-fetch al API pública.
export const dynamic = "force-dynamic";

/**
 * Catálogo público — server component.
 *
 * Fetchea desde `/api/public/elevate/productos` (server-side). Si la API
 * devuelve [] o falla, cae al mock visual. El client component
 * (CatalogClient) recibe la lista ya resuelta y maneja filtros + búsqueda.
 */
export default async function CatalogoPage() {
  // Marcas en el primer render: todas las visibles. El cliente vuelve a
  // pedirlas con `?categoria=` cuando el usuario filtra por categoría.
  const [{ products }, categorias, marcas] = await Promise.all([
    fetchCatalog(),
    fetchCategoriasPublic(),
    fetchMarcasPublic(),
  ]);
  return <CatalogClient products={products} categorias={categorias} marcas={marcas} />;
}
