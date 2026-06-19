import { BestsellerCard } from "./BestsellerCard";
import { SectionTitle } from "./SectionTitle";
import type { Product } from "@/lib/elevate-public/products-mock";

/**
 * Sección Bestsellers en home. Recibe `products` desde el server component
 * (productos destacados ya filtrados de la API). Se muestra como un carrusel
 * horizontal continuo (marquee): la lista se duplica visualmente para lograr
 * un loop infinito sin cortes. El movimiento, la pausa en hover y el degradado
 * de bordes son CSS puro (ver `.bestseller-marquee` en elevate-theme.css).
 */
export function Bestsellers({ products }: { products: Product[] }) {
  if (products.length === 0) return null;

  // Una "copia" del carrusel. Si hay pocos productos, repetimos la lista real
  // para que el track llene el ancho y el loop no muestre huecos. No altera los
  // datos: solo duplica referencias para el desplazamiento visual.
  const repeat = Math.max(1, Math.ceil(4 / products.length));
  const oneCopy = Array.from({ length: repeat }, () => products).flat();
  // El track son DOS copias seguidas; la animación traslada -50% (una copia
  // completa) en loop, por eso el empalme es invisible.
  const loop = [...oneCopy, ...oneCopy];

  return (
    <section id="mas-vendidos" className="py-24 lg:py-32 bg-background">
      <div className="container mx-auto px-6 lg:px-10">
        <SectionTitle
          eyebrow="Más vendidos"
          title="Las fragancias preferidas de la casa"
          subtitle="Aquellas que vuelven una y otra vez. Carácter, presencia y aprobación unánime."
        />
      </div>

      <div className="mt-14 bestseller-marquee">
        <div className="bestseller-marquee__edge bestseller-marquee__edge--left" aria-hidden="true" />
        <div className="bestseller-marquee__edge bestseller-marquee__edge--right" aria-hidden="true" />
        <ul className="bestseller-marquee__track flex w-max">
          {loop.map((p, i) => (
            <li
              key={`${p.id}-${i}`}
              className="bestseller-marquee__item flex shrink-0 pr-3 sm:pr-4 w-[80vw] sm:w-[300px] lg:w-[320px]"
              aria-hidden={i >= oneCopy.length ? true : undefined}
            >
              <BestsellerCard product={p} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
