import Link from "next/link";
import { Hero } from "@/components/elevate-public/Hero";
import { Bestsellers } from "@/components/elevate-public/Bestsellers";
import { Promos } from "@/components/elevate-public/Promos";
import { NewArrivals } from "@/components/elevate-public/NewArrivals";
import { Reviews } from "@/components/elevate-public/Reviews";
import { fetchCatalog } from "@/lib/elevate-public/catalog-fetch";
import { fetchResenasVideos } from "@/lib/elevate-public/resenas-fetch";

export const metadata = {
  title: "Elevate Import Export — Perfumería Premium Original",
  description:
    "Elevate: perfumería premium con fragancias nicho, ultranicho, de diseñador y árabes originales. Asesoramiento exclusivo y envíos a todo el país.",
};

// Dinámico explícito: el self-fetch al API pública desde el mismo Node
// causaba colgar el prerender durante `next build` cuando el ERP estaba
// bajo carga. La performance se gana ahora con `unoptimized` en las
// imágenes (eliminamos /_next/image del catálogo) y con middleware
// matcher restrictivo, no con ISR.
export const dynamic = "force-dynamic";

/**
 * Home pública Elevate — server component.
 *
 * Carga el catálogo completo desde la API real (`/api/public/elevate/productos`)
 * y deriva los listados para Bestsellers (destacado), Promos (precio_oferta
 * vigente) y NewArrivals (nuevo_hasta >= hoy). Mock como fallback global
 * cuando la API falla o no devuelve productos.
 */
export default async function ElevatePublicHome() {
  const [{ products }, resenasVideos] = await Promise.all([
    fetchCatalog({ limit: 100 }),
    fetchResenasVideos(),
  ]);

  const bestsellers = products.filter((p) => p.bestseller).slice(0, 6);
  const promos = products.filter((p) => p.oldPrice != null);
  const newArrivals = products.filter((p) => p.isNew);

  return (
    <>
      <Hero />
      <Bestsellers products={bestsellers.length > 0 ? bestsellers : products.slice(0, 6)} />
      {promos.length > 0 && <Promos products={promos} />}
      {newArrivals.length > 0 && <NewArrivals products={newArrivals} />}
      <Reviews videos={resenasVideos} />

      <section className="py-24 lg:py-32 bg-cream/30">
        <div className="container mx-auto px-6 lg:px-10 text-center max-w-2xl">
          <span className="text-xs tracking-[0.4em] uppercase text-gold">Catálogo completo</span>
          <h2 className="font-display text-4xl md:text-5xl text-primary mt-4 text-balance">
            Explorá toda nuestra curaduría
          </h2>
          <div className="gold-divider w-24 mx-auto my-6" />
          <p className="font-editorial italic text-lg text-muted-foreground">
            Filtrá por marca, categoría, familia olfativa o buscá por nombre.
            Todas las fragancias seleccionadas en un solo lugar.
          </p>
          <Link
            href="/catalogo"
            className="inline-flex items-center justify-center mt-8 px-10 py-4 bg-primary text-primary-foreground text-xs tracking-[0.3em] uppercase hover:bg-primary-glow transition-elegant shadow-elegant"
          >
            Ir al catálogo
          </Link>
        </div>
      </section>
    </>
  );
}
