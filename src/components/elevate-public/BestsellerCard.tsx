"use client";

import Link from "next/link";
import Image from "next/image";
import { type Product, formatPrice } from "@/lib/elevate-public/products-mock";
import { trackProductEvent } from "@/lib/elevate-public/track";
import { useCart } from "./CartContext";

/**
 * Card del carrusel "preferidas de la casa". Variante image-forward inspirada
 * en la sección de marcas de NOKTUM: la imagen domina la card y la marca + el
 * nombre van superpuestos sobre un degradado. Debajo, un pie compacto con
 * precio y el CTA de compra. Se mantiene el tema claro de Elevate.
 *
 * Es una card aparte (no la ProductCard compartida) para no alterar el resto
 * del sitio (catálogo, novedades, etc.).
 */

const statusMap: Record<Product["status"], { label: string; cls: string }> = {
  available: { label: "Disponible", cls: "text-gold border-gold/40" },
  low: { label: "Stock bajo", cls: "text-primary border-primary/40" },
  out: { label: "Sin stock", cls: "text-muted-foreground border-muted-foreground/30" },
  soon: { label: "Próximamente", cls: "text-foreground/70 border-foreground/30" },
};

export function BestsellerCard({ product }: { product: Product }) {
  const s = statusMap[product.status];
  const disabled = product.status === "out" || product.status === "soon";
  const { add } = useCart();

  const tienePresentaciones = product.tienePresentaciones === true;
  const precioDesde =
    typeof product.precioDesde === "number" && product.precioDesde > 0
      ? product.precioDesde
      : null;
  const precioMostrado = tienePresentaciones && precioDesde ? precioDesde : product.price;

  return (
    <article className="group relative w-full bg-background border border-border/60 hover:border-gold/60 transition-elegant shadow-soft hover:shadow-elegant flex flex-col overflow-hidden">
      <Link
        href={`/producto/${product.slug}`}
        onClick={() =>
          trackProductEvent({
            product_id: product.id,
            event_type: "product_click",
            source: "catalogo",
            metadata: { slug: product.slug, name: product.name },
          })
        }
        className="relative aspect-[3/4] overflow-hidden bg-cream block"
        aria-label={`Ver ${product.name}`}
      >
        <Image
          src={product.image}
          alt={`${product.name} de ${product.brand}`}
          fill
          sizes="(min-width:1024px) 25vw, (min-width:768px) 40vw, 80vw"
          className="object-cover transition-elegant group-hover:scale-105"
          unoptimized
        />

        {product.promo && (
          <span className="absolute top-4 left-4 z-10 bg-primary text-primary-foreground text-[10px] tracking-[0.25em] uppercase px-3 py-1.5">
            {product.promo}
          </span>
        )}
        {product.isNew && !product.promo && (
          <span className="absolute top-4 left-4 z-10 bg-gold text-gold-foreground text-[10px] tracking-[0.25em] uppercase px-3 py-1.5">
            Nuevo
          </span>
        )}
        <span
          className={`absolute top-4 right-4 z-10 bg-background/90 text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 border ${s.cls}`}
        >
          {s.label}
        </span>

        {/* Texto superpuesto sobre la imagen (estilo NOKTUM). */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-5 pt-14 pb-5">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gold">{product.brand}</div>
          <h3 className="font-display text-2xl text-cream leading-tight mt-1">{product.name}</h3>
          <div className="text-[10px] tracking-[0.25em] uppercase text-cream/65 mt-1.5">
            {product.type} · Imagen referencial
          </div>
        </div>
      </Link>

      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-baseline gap-3">
          {product.oldPrice && !tienePresentaciones && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(product.oldPrice)}
            </span>
          )}
          {tienePresentaciones && (
            <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              Desde
            </span>
          )}
          <span className="text-lg text-primary font-medium">{formatPrice(precioMostrado)}</span>
        </div>

        <div className="mt-auto">
          {tienePresentaciones ? (
            <Link
              href={`/producto/${product.slug}`}
              onClick={() =>
                trackProductEvent({
                  product_id: product.id,
                  event_type: "product_click",
                  source: "catalogo",
                  metadata: { slug: product.slug, motivo: "elegir_ml" },
                })
              }
              className="block w-full text-center text-[11px] tracking-[0.3em] uppercase py-3 transition-elegant bg-primary text-primary-foreground hover:bg-primary-glow shadow-soft"
            >
              Elegí el ml
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (disabled) return;
                add(product);
                trackProductEvent({
                  product_id: product.id,
                  event_type: "add_to_cart",
                  source: "catalogo",
                });
              }}
              disabled={disabled}
              className={`w-full text-[11px] tracking-[0.3em] uppercase py-3 transition-elegant ${
                disabled
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary-glow shadow-soft"
              }`}
            >
              {disabled ? "No disponible" : "Agregar al carrito"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
