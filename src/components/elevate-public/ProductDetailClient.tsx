"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Minus, Plus, ChevronLeft, ChevronRight, ShoppingBag, MessageCircle } from "lucide-react";
import { type Product, formatPrice, products } from "@/lib/elevate-public/products-mock";
import { buildProductWhatsappLink } from "@/lib/elevate-public/whatsapp";
import { trackProductEvent } from "@/lib/elevate-public/track";
import { useCart } from "./CartContext";
import type { WebPresentacion } from "@/lib/elevate-public/products-mock";
import { ProductCard } from "./ProductCard";
import { SectionTitle } from "./SectionTitle";
import { UsdEquivalent } from "./UsdEquivalent";
import { MayoristaLine } from "./MayoristaLine";

const statusMap = {
  available: { label: "Disponible", cls: "text-gold border-gold/40" },
  low: { label: "Stock bajo", cls: "text-primary border-primary/40" },
  out: { label: "Sin stock", cls: "text-muted-foreground border-muted-foreground/30" },
  soon: { label: "Próximamente", cls: "text-foreground/70 border-foreground/30" },
} as const;

export function ProductDetailClient({
  product,
  whatsappNumber,
}: {
  product: Product;
  /** Número WhatsApp (digits only). Si null/undefined, el botón WhatsApp se oculta. */
  whatsappNumber?: string | null;
}) {
  const router = useRouter();
  const { add, addWithPresentacion, setOpen } = useCart();
  const [qty, setQty] = useState(1);

  // Fase Presentaciones: si el producto tiene variantes por ml, el usuario
  // debe elegir una antes de agregar al carrito. La presentación elegida
  // sobreescribe precio, imagen, stock y mayorista del producto base.
  const presentaciones: WebPresentacion[] = product.presentaciones ?? [];
  const tienePresentaciones = product.tienePresentaciones === true && presentaciones.length > 0;
  const [presentacionIdSeleccionada, setPresentacionIdSeleccionada] = useState<string | null>(
    null
  );
  // Auto-seleccionar la primera presentación visible al montar (UX: el usuario
  // siempre ve un precio concreto al abrir el detalle).
  useEffect(() => {
    if (tienePresentaciones && !presentacionIdSeleccionada) {
      const primera = presentaciones.find((p) => p.disponible) ?? presentaciones[0];
      if (primera) setPresentacionIdSeleccionada(primera.id);
    }
  }, [tienePresentaciones, presentaciones, presentacionIdSeleccionada]);
  const presentacionElegida =
    presentaciones.find((p) => p.id === presentacionIdSeleccionada) ?? null;
  const precioEfectivo = presentacionElegida?.precio ?? product.price;
  const mayoristaEfectivo = presentacionElegida?.mayorista ?? product.mayorista ?? null;
  const stockDisponiblePresentacion =
    presentacionElegida == null || presentacionElegida.disponible;

  // Galería (Fase Galería). Si el adapter devolvió `gallery`, la usamos; si
  // está vacío, fallback a la imagen única `product.image`. Si hay
  // presentación elegida con imagen propia, esa imagen tiene prioridad como
  // primera de la galería.
  const galleryImages = useMemo(() => {
    const presImg = presentacionElegida?.imagen_url ?? null;
    const base =
      product.gallery && product.gallery.length > 0
        ? product.gallery
        : product.image
          ? [{ url: product.image, alt: null as string | null }]
          : [];
    if (!presImg) return base;
    // Insertamos la imagen de la presentación al inicio si no estaba ya.
    if (base.some((b) => b.url === presImg)) return base;
    return [{ url: presImg, alt: null }, ...base];
  }, [product.gallery, product.image, presentacionElegida?.imagen_url]);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  // Reset al cambiar de producto.
  useEffect(() => {
    setActiveImageIdx(0);
  }, [product.id]);
  const activeImage = galleryImages[activeImageIdx]?.url ?? product.image;

  const s = statusMap[product.status];
  const disabled = product.status === "out" || product.status === "soon";
  const related = products
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, 3);

  // Tracking product_view en mount.
  useEffect(() => {
    trackProductEvent({
      product_id: product.id,
      event_type: "product_view",
      source: "detalle",
      metadata: { slug: product.slug, name: product.name },
    });
    // Solo al montar (o cambiar de producto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const productUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/producto/${product.slug}`;
  }, [product.slug]);

  const whatsappHref = useMemo(
    () =>
      buildProductWhatsappLink({
        number: whatsappNumber ?? null,
        productName: product.name,
        sku: product.sku ?? null,
        productUrl,
      }),
    [whatsappNumber, product.name, product.sku, productUrl]
  );

  const handleAdd = () => {
    if (disabled) return;
    if (tienePresentaciones) {
      if (!presentacionElegida) return;
      if (!presentacionElegida.disponible) return;
      addWithPresentacion(product, presentacionElegida, qty);
      trackProductEvent({
        product_id: product.id,
        event_type: "add_to_cart",
        source: "detalle",
        metadata: { qty, presentacion_id: presentacionElegida.id, volumen_ml: presentacionElegida.volumen_ml },
      });
      return;
    }
    add(product, qty);
    trackProductEvent({
      product_id: product.id,
      event_type: "add_to_cart",
      source: "detalle",
      metadata: { qty },
    });
  };

  const handleWhatsappClick = () => {
    trackProductEvent({
      product_id: product.id,
      event_type: "whatsapp_click",
      source: "detalle",
    });
  };

  return (
    <>
      <section className="pt-24 pb-12 sm:pt-32 sm:pb-20 lg:pb-28">
        <div className="container mx-auto px-6 lg:px-10">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-[11px] tracking-[0.3em] uppercase text-muted-foreground hover:text-primary mb-6 sm:mb-10 transition-elegant"
          >
            <ChevronLeft size={14} /> Volver
          </button>

          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-20 items-start">
            <div className="relative bg-cream overflow-hidden shadow-elegant group">
              <div className="aspect-[4/5] relative">
                {/* Fase Galería: capas apiladas con fade. Solo la imagen
                    activa es opaca; las demás quedan invisibles pero
                    cargadas, permitiendo cambio instantáneo y suave. */}
                {galleryImages.map((img, idx) => (
                  <Image
                    key={`${img.url}-${idx}`}
                    src={img.url}
                    alt={img.alt ?? `${product.name} de ${product.brand}`}
                    fill
                    sizes="(min-width:1024px) 50vw, 100vw"
                    priority={idx === 0}
                    className={`object-cover transition-opacity duration-500 ease-in-out motion-reduce:transition-none ${
                      idx === activeImageIdx ? "opacity-100" : "opacity-0"
                    }`}
                    // unoptimized: imagen pública del bucket Storage. Evita
                    // /_next/image y libera CPU del Node de Hostinger.
                    unoptimized
                  />
                ))}
              </div>
              {product.promo && (
                <span className="absolute top-6 left-6 bg-primary text-primary-foreground text-[10px] tracking-[0.25em] uppercase px-3 py-1.5 z-10">
                  {product.promo}
                </span>
              )}
              {product.isNew && !product.promo && (
                <span className="absolute top-6 left-6 bg-gold text-gold-foreground text-[10px] tracking-[0.25em] uppercase px-3 py-1.5 z-10">
                  Nuevo
                </span>
              )}

              {/* Flechas overlay (solo si hay >1 imagen). Semitransparentes,
                  centradas verticalmente, ganan opacidad en hover. En mobile
                  son siempre visibles para descubrir la funcionalidad. */}
              {galleryImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveImageIdx(
                        (i) => (i - 1 + galleryImages.length) % galleryImages.length
                      )
                    }
                    aria-label="Imagen anterior"
                    className="absolute top-1/2 left-3 -translate-y-1/2 z-10 inline-flex items-center justify-center w-10 h-10 rounded-full bg-background/40 hover:bg-background/80 text-primary backdrop-blur-sm transition-elegant lg:opacity-0 lg:group-hover:opacity-100 motion-reduce:transition-none"
                  >
                    <ChevronLeft size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveImageIdx((i) => (i + 1) % galleryImages.length)
                    }
                    aria-label="Imagen siguiente"
                    className="absolute top-1/2 right-3 -translate-y-1/2 z-10 inline-flex items-center justify-center w-10 h-10 rounded-full bg-background/40 hover:bg-background/80 text-primary backdrop-blur-sm transition-elegant lg:opacity-0 lg:group-hover:opacity-100 motion-reduce:transition-none"
                  >
                    <ChevronRight size={20} aria-hidden="true" />
                  </button>
                  {/* Indicador discreto N/M abajo a la derecha. */}
                  <span
                    className="absolute bottom-3 right-3 z-10 text-[10px] tracking-[0.2em] uppercase text-primary bg-background/70 backdrop-blur-sm px-2 py-1"
                    aria-live="polite"
                  >
                    {activeImageIdx + 1} / {galleryImages.length}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-col">
              <div className="text-[11px] tracking-[0.4em] uppercase text-gold mb-3">{product.brand}</div>
              <h1 className="font-display text-4xl lg:text-5xl text-primary leading-tight">{product.name}</h1>
              <p className="font-editorial italic text-lg text-muted-foreground mt-3">{product.type}</p>

              <div
                className={`inline-flex self-start mt-5 text-[10px] tracking-[0.25em] uppercase px-2.5 py-1 border bg-background ${s.cls}`}
              >
                {s.label}
              </div>

              <div className="mt-6 flex items-baseline gap-4">
                {product.oldPrice && !tienePresentaciones && (
                  <span className="text-lg text-muted-foreground line-through">
                    {formatPrice(product.oldPrice)}
                  </span>
                )}
                <span className="font-display text-3xl text-primary">{formatPrice(precioEfectivo)}</span>
              </div>
              <UsdEquivalent priceGs={precioEfectivo} className="mt-2 text-sm" />
              {mayoristaEfectivo && (
                <div className="mt-3 inline-flex items-center gap-2 border border-gold/40 bg-gold/5 px-4 py-2 text-foreground/85">
                  <MayoristaLine mayorista={mayoristaEfectivo} className="text-sm not-italic font-sans tracking-normal text-foreground/85" />
                </div>
              )}

              {/* Fase Presentaciones: selector de ml */}
              {tienePresentaciones && (
                <div className="mt-6">
                  <h2 className="text-[11px] tracking-[0.3em] uppercase text-gold mb-3">Volumen</h2>
                  <div className="flex flex-wrap gap-3">
                    {presentaciones.map((pres) => {
                      const elegida = pres.id === presentacionIdSeleccionada;
                      const noStock = !pres.disponible;
                      return (
                        <button
                          key={pres.id}
                          type="button"
                          onClick={() => setPresentacionIdSeleccionada(pres.id)}
                          disabled={noStock}
                          className={`flex flex-col items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full border text-[10px] tracking-[0.15em] uppercase transition-elegant ${
                            elegida
                              ? "bg-primary text-primary-foreground border-primary shadow-elegant"
                              : "border-border text-foreground/80 hover:border-gold hover:text-primary"
                          } ${noStock ? "opacity-50 cursor-not-allowed" : ""}`}
                          aria-pressed={elegida}
                          title={noStock ? "Sin stock" : `${pres.volumen_ml} ml`}
                        >
                          <span className="font-display text-sm tracking-normal normal-case leading-none">
                            {pres.volumen_ml}
                          </span>
                          <span className="mt-0.5 text-[8px] tracking-[0.2em]">ml</span>
                          {noStock && <span className="mt-0.5 text-[8px]">s/stock</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="h-px bg-border my-8" />

              <p className="text-foreground/80 leading-relaxed">{product.description}</p>

              <dl className="grid grid-cols-2 gap-6 mt-8 text-sm">
                <div>
                  <dt className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-1">
                    Concentración
                  </dt>
                  <dd className="text-primary">{product.concentration}</dd>
                </div>
                <div>
                  <dt className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-1">Tamaño</dt>
                  <dd className="text-primary">{product.size}</dd>
                </div>
                <div>
                  <dt className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-1">Categoría</dt>
                  <dd className="text-primary">{product.category}</dd>
                </div>
                <div>
                  <dt className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-1">Familia</dt>
                  <dd className="text-primary">{product.type}</dd>
                </div>
              </dl>

              <div className="mt-8">
                <h2 className="text-[11px] tracking-[0.3em] uppercase text-gold mb-4">Pirámide olfativa</h2>
                <div className="space-y-3">
                  {[
                    { k: "Salida", v: product.notes.top },
                    { k: "Corazón", v: product.notes.heart },
                    { k: "Fondo", v: product.notes.base },
                  ].map((row) => (
                    <div
                      key={row.k}
                      className="grid grid-cols-[100px_1fr] gap-4 items-baseline border-b border-border/60 pb-2"
                    >
                      <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">{row.k}</span>
                      <span className="font-editorial italic text-foreground/85">{row.v.join(" · ")}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-10 flex flex-col sm:flex-row gap-4 items-stretch">
                <div className="flex items-center justify-between border border-border bg-background px-2 sm:w-40">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={disabled}
                    className="p-3 hover:text-primary text-foreground/70 disabled:opacity-40"
                    aria-label="Restar cantidad"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-base text-primary min-w-[2ch] text-center">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => q + 1)}
                    disabled={disabled}
                    className="p-3 hover:text-primary text-foreground/70 disabled:opacity-40"
                    aria-label="Sumar cantidad"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={
                    disabled ||
                    (tienePresentaciones && (!presentacionElegida || !stockDisponiblePresentacion))
                  }
                  className={`flex-1 inline-flex items-center justify-center gap-3 py-4 text-[11px] tracking-[0.3em] uppercase transition-elegant shadow-soft ${
                    disabled || (tienePresentaciones && !stockDisponiblePresentacion)
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-primary text-primary-foreground hover:bg-primary-glow"
                  }`}
                >
                  <ShoppingBag size={16} />
                  {disabled
                    ? "No disponible"
                    : tienePresentaciones && !stockDisponiblePresentacion
                      ? "Sin stock en esta presentación"
                      : `Agregar al carrito · ${formatPrice(precioEfectivo * qty)}`}
                </button>
              </div>

              {!disabled && (!tienePresentaciones || (presentacionElegida && stockDisponiblePresentacion)) && (
                <button
                  type="button"
                  onClick={() => {
                    if (tienePresentaciones && presentacionElegida) {
                      addWithPresentacion(product, presentacionElegida, qty);
                    } else {
                      add(product, qty);
                    }
                    trackProductEvent({
                      product_id: product.id,
                      event_type: "add_to_cart",
                      source: "detalle-comprar-ahora",
                      metadata: {
                        qty,
                        presentacion_id: presentacionElegida?.id ?? null,
                      },
                    });
                    setOpen(false);
                    router.push("/checkout");
                  }}
                  className="mt-3 py-4 text-[11px] tracking-[0.3em] uppercase border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-elegant"
                >
                  Comprar ahora
                </button>
              )}

              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleWhatsappClick}
                  aria-label={`Consultar por WhatsApp sobre ${product.name}`}
                  className="mt-3 inline-flex items-center justify-center gap-3 py-4 text-[11px] tracking-[0.3em] uppercase bg-[#25D366] text-white hover:bg-[#1da851] transition-elegant shadow-soft"
                >
                  <MessageCircle size={16} />
                  Consultar por WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="py-12 sm:py-20 bg-cream/40">
          <div className="container mx-auto px-6 lg:px-10">
            <SectionTitle eyebrow="También te puede interesar" title="Fragancias relacionadas" />
            <div className="mt-8 sm:mt-12 grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-7 max-w-5xl mx-auto [&_article>div:last-child]:p-3 sm:[&_article>div:last-child]:p-6 [&_.items-baseline]:flex-wrap sm:[&_.items-baseline]:flex-nowrap">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

export function ProductNotFoundClient() {
  return (
    <div className="container mx-auto px-6 py-20 sm:py-32 text-center">
      <h1 className="font-display text-4xl text-primary mb-4">Producto no encontrado</h1>
      <p className="text-muted-foreground mb-8">La fragancia que buscás no está disponible.</p>
      <Link
        href="/catalogo"
        className="inline-block px-8 py-3 bg-primary text-primary-foreground text-[11px] tracking-[0.3em] uppercase hover:bg-primary-glow transition-elegant"
      >
        Volver al catálogo
      </Link>
    </div>
  );
}
