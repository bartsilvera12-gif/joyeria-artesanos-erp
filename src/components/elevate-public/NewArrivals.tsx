import { ProductCard } from "./ProductCard";
import { SectionTitle } from "./SectionTitle";
import type { Product } from "@/lib/elevate-public/products-mock";

/**
 * Sección NewArrivals. Recibe `products` con `isNew=true` filtrados.
 */
export function NewArrivals({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <section id="nuevos" className="py-24 lg:py-32 bg-cream/40">
      <div className="container mx-auto px-6 lg:px-10">
        <SectionTitle
          eyebrow="Recién llegados"
          title="Nuevas incorporaciones"
          subtitle="Descubrí las fragancias recién incorporadas a nuestra selección."
        />
        {/* Mobile: 2 columnas → imágenes más chicas. Ajustes scoped a estas
            cards (no afectan ProductCard del catálogo): menos padding interno
            y precios que envuelven si no entran en el ancho angosto. Desde sm
            vuelve al diseño original. */}
        <div className="mt-14 grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-7 max-w-5xl mx-auto [&_article>div:last-child]:p-3 sm:[&_article>div:last-child]:p-6 [&_.items-baseline]:flex-wrap sm:[&_.items-baseline]:flex-nowrap">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
