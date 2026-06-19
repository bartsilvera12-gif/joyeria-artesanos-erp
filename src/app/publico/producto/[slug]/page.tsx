import {
  ProductDetailClient,
  ProductNotFoundClient,
} from "@/components/elevate-public/ProductDetailClient";
import { fetchProductoDetalle } from "@/lib/elevate-public/catalog-fetch";
import { getElevateWhatsappNumber } from "@/lib/elevate-public/whatsapp";

// Dinámico explícito (ver nota en /publico/page.tsx).
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await fetchProductoDetalle(slug);
  if (!found) return { title: "Producto no encontrado · Elevate" };
  const p = found.product;
  return {
    title: `${p.name} — ${p.brand} · Elevate`,
    description: p.description,
  };
}

/**
 * Detalle producto. API primaria (incluye descripcion_web, concentración,
 * volumen, género, familia olfativa, pirámide top/heart/base) con fallback
 * al mock cuando la API devuelve 404/error.
 */
export default async function ProductoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await fetchProductoDetalle(slug);
  if (!found) return <ProductNotFoundClient />;
  // Server-side: lee env (prefiere ELEVATE_WHATSAPP_NUMBER, fallback
  // NEXT_PUBLIC_ELEVATE_WHATSAPP_NUMBER). Lo pasa al client component vía
  // prop para que la página de producto pueda armar el wa.me con el SKU
  // sin depender de NEXT_PUBLIC_ en runtime.
  const whatsappNumber = getElevateWhatsappNumber();
  return (
    <ProductDetailClient product={found.product} whatsappNumber={whatsappNumber} />
  );
}
