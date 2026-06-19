"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { ProductCard } from "@/components/elevate-public/ProductCard";
import { SectionTitle } from "@/components/elevate-public/SectionTitle";
import type { Product } from "@/lib/elevate-public/products-mock";
import type { CategoriaWeb, MarcaWeb } from "@/lib/elevate-public/catalog-fetch";

const FILTERS = ["Todos", "Más vendidos", "Promociones", "Nuevos", "En stock"] as const;

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type CategoryTab = "Todos" | string;

export function CatalogClient({
  products,
  categorias,
  marcas,
}: {
  products: Product[];
  categorias: CategoriaWeb[];
  marcas: MarcaWeb[];
}) {
  // "Todos" siempre presente. El resto sale de DB con orden_web.
  const categoryTabs: CategoryTab[] = [
    "Todos",
    ...categorias.map((c) => c.nombre),
  ];

  const router = useRouter();
  const searchParams = useSearchParams();

  // Estado inicial desde la URL (?categoria=&marca=) para que el link
  // "Diseñador → Giorgio Armani" sea compartible.
  const initialCatSlug = searchParams.get("categoria")?.trim().toLowerCase() || null;
  const initialMarcaSlug = searchParams.get("marca")?.trim().toLowerCase() || null;
  const initialCatName =
    (initialCatSlug && categorias.find((c) => c.slug === initialCatSlug)?.nombre) || "Todos";

  const [cat, setCat] = useState<CategoryTab>(initialCatName);
  const [marcaSlug, setMarcaSlug] = useState<string | null>(initialMarcaSlug);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todos");
  const [query, setQuery] = useState("");

  // Mantiene la URL sincronizada (replace, sin agregar entrada al history).
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const catObj = categorias.find((c) => c.nombre === cat);
    if (catObj?.slug) sp.set("categoria", catObj.slug);
    else sp.delete("categoria");
    if (marcaSlug) sp.set("marca", marcaSlug);
    else sp.delete("marca");
    const qs = sp.toString();
    router.replace(qs ? `/catalogo?${qs}` : "/catalogo", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, marcaSlug]);

  // Marcas a mostrar como chips. Fase Categorías↔Marcas:
  //   - "Todos": usamos las marcas globales que llegaron por prop (SSR).
  //   - Categoría seleccionada: consultamos al endpoint público
  //     /api/public/elevate/marcas?categoria=<slug> que prioriza la relación
  //     formal `marca_categorias`. Eso significa que el chip aparece aunque
  //     la marca todavía no tenga productos visibles (caso de carga inicial
  //     de marcas desde el ERP). Si el cliente filtra por esa marca y aún
  //     no hay productos, el catálogo muestra "sin resultados" — UX OK.
  const [marcasCat, setMarcasCat] = useState<MarcaWeb[] | null>(null);
  const [marcasLoading, setMarcasLoading] = useState(false);
  useEffect(() => {
    if (cat === "Todos") {
      setMarcasCat(null);
      setMarcasLoading(false);
      return;
    }
    const catObj = categorias.find((c) => c.nombre === cat);
    const slug = catObj?.slug;
    if (!slug) {
      setMarcasCat([]);
      setMarcasLoading(false);
      return;
    }
    let cancelled = false;
    setMarcasLoading(true);
    fetch(`/api/public/elevate/marcas?categoria=${encodeURIComponent(slug)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return [] as MarcaWeb[];
        const j = (await r.json().catch(() => null)) as { marcas?: MarcaWeb[] } | null;
        return Array.isArray(j?.marcas) ? (j!.marcas as MarcaWeb[]) : [];
      })
      .then((list) => {
        if (!cancelled) setMarcasCat(list);
      })
      .catch(() => {
        if (!cancelled) setMarcasCat([]);
      })
      .finally(() => {
        if (!cancelled) setMarcasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cat, categorias]);

  const marcasDisponibles: MarcaWeb[] = cat === "Todos" ? marcas : marcasCat ?? [];

  // Si el usuario cambia de categoría y la marca activa ya no aplica, se limpia.
  useEffect(() => {
    if (!marcaSlug) return;
    if (cat === "Todos") return; // "Todos" no filtra por marca de categoría
    if (marcasLoading) return; // esperar a que termine el fetch antes de descartar
    if (marcasCat && !marcasCat.some((m) => m.slug === marcaSlug)) {
      setMarcaSlug(null);
    }
  }, [marcaSlug, cat, marcasCat, marcasLoading]);

  const list = useMemo(() => {
    const q = norm(query.trim());
    return products.filter((p) => {
      if (cat !== "Todos" && p.category !== cat) return false;
      if (marcaSlug && p.marca_slug !== marcaSlug) return false;
      if (filter === "Más vendidos" && !p.bestseller) return false;
      if (filter === "Promociones" && !p.oldPrice) return false;
      if (filter === "Nuevos" && !p.isNew) return false;
      if (filter === "En stock" && (p.status === "out" || p.status === "soon")) return false;
      if (q) {
        const haystack = norm(
          [
            p.name, p.brand, p.category, p.type, p.description, p.concentration,
            ...p.notes.top, ...p.notes.heart, ...p.notes.base,
          ].join(" ")
        );
        if (!q.split(/\s+/).every((token) => haystack.includes(token))) return false;
      }
      return true;
    });
  }, [cat, marcaSlug, filter, query, products]);

  const suggestions = useMemo(() => {
    if (!query || list.length > 0) return [];
    return ["oud", "rosa", "amaderada", "cítrica", "vainilla", "ámbar"];
  }, [query, list.length]);

  return (
    <>
      <section className="pt-24 pb-8 sm:pt-32 sm:pb-12 bg-gradient-to-b from-cream/40 to-background">
        <div className="container mx-auto px-6 lg:px-10">
          <SectionTitle
            eyebrow="Catálogo"
            title="Una selección con criterio"
            subtitle="Buscá por nombre, marca, nota olfativa o familia. Filtrá por categoría y estado."
          />

          <div className="mt-8 sm:mt-12 max-w-2xl mx-auto">
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gold" size={18} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, marca, nota, familia olfativa…"
                className="w-full pl-14 pr-12 py-4 bg-background border border-border focus:border-gold outline-none text-base font-editorial italic placeholder:text-muted-foreground/60 transition-smooth shadow-soft"
                aria-label="Buscar perfumes"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                  aria-label="Limpiar búsqueda"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            {query && (
              <p className="mt-3 text-xs tracking-wide text-muted-foreground text-center">
                {list.length} resultado{list.length !== 1 ? "s" : ""} para &ldquo;
                <span className="text-primary">{query}</span>&rdquo;
              </p>
            )}
          </div>

          <div className="mt-6 sm:mt-10 flex flex-wrap justify-center gap-2 md:gap-3">
            {categoryTabs.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCat(c);
                  setMarcaSlug(null);
                }}
                className={`px-5 py-2.5 text-[11px] tracking-[0.25em] uppercase border transition-elegant ${
                  cat === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-foreground/70 hover:border-gold hover:text-primary"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Chips de marcas (Fase Marcas): visibles cuando hay categoría
              elegida y al menos una marca disponible para esa categoría. */}
          {marcasDisponibles.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2 md:gap-3">
              <button
                type="button"
                onClick={() => setMarcaSlug(null)}
                className={`px-4 py-1.5 text-[10px] tracking-[0.25em] uppercase border transition-smooth ${
                  marcaSlug === null
                    ? "bg-gold/15 border-gold text-primary"
                    : "border-border text-muted-foreground hover:border-gold hover:text-primary"
                }`}
              >
                Todas las marcas
              </button>
              {marcasDisponibles.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMarcaSlug(m.slug)}
                  className={`px-4 py-1.5 text-[10px] tracking-[0.25em] uppercase border transition-smooth ${
                    marcaSlug === m.slug
                      ? "bg-gold/15 border-gold text-primary"
                      : "border-border text-muted-foreground hover:border-gold hover:text-primary"
                  }`}
                >
                  {m.nombre}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-center gap-2 md:gap-3">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 text-[10px] tracking-[0.25em] uppercase transition-smooth ${
                  filter === f
                    ? "text-primary border-b border-gold"
                    : "text-muted-foreground hover:text-primary"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-12 sm:pb-24 lg:pb-32">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-7">
            {list.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>

          {list.length === 0 && (
            <div className="text-center py-12 sm:py-20 max-w-md mx-auto">
              <p className="text-muted-foreground font-editorial italic text-lg">
                No encontramos fragancias con esa búsqueda.
              </p>
              {suggestions.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs tracking-[0.3em] uppercase text-gold mb-3">Probá con</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setQuery(s)}
                        className="px-4 py-1.5 text-xs border border-border hover:border-gold hover:text-primary transition-smooth"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
