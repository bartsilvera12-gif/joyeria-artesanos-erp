"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";

type Hit = {
  id: string;
  slug: string | null;
  nombre: string | null;
  marca: string | null;
  imagen_url: string | null;
  precio: number;
};

/**
 * Buscador del header público (Fase Buscador).
 *
 * Botón lupa que despliega un dropdown elegante con resultados en vivo.
 * Llama a /api/public/elevate/productos?q=… (debounce 250ms). RLS+filtros
 * del endpoint garantizan que solo aparezcan productos activos+visibles.
 *
 * Cierra con: botón X, tecla Escape, click fuera.
 * Compatible mobile (full-width) y desktop (panel flotante a la derecha).
 */
export function SearchBox({ variant = "icon" }: { variant?: "icon" | "bar" } = {}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Foco al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Cerrar con click fuera
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Debounce fetch
  const fetchHits = useCallback(async (term: string) => {
    if (!term || term.trim().length < 2) {
      setHits(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(
        `/api/public/elevate/productos?q=${encodeURIComponent(term.trim())}&limit=12`,
        { cache: "no-store" }
      );
      const j = (await r.json().catch(() => null)) as { productos?: Hit[] } | null;
      const list = Array.isArray(j?.productos) ? (j!.productos as Hit[]) : [];
      setHits(list);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => fetchHits(q), 250);
    return () => clearTimeout(t);
  }, [q, open, fetchHits]);

  const closeAndReset = () => {
    setOpen(false);
    setQ("");
    setHits(null);
  };

  return (
    <div className={variant === "bar" ? "relative w-full" : "relative"}>
      {variant === "bar" ? (
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((s) => !s)}
          aria-label="Buscar perfumes y marcas"
          aria-expanded={open}
          className="flex items-center gap-2 w-full h-10 px-4 rounded-full border border-gold/30 bg-cream/50 text-left text-sm text-muted-foreground hover:border-gold/60 transition-smooth"
        >
          <Search size={16} className="text-gold shrink-0" />
          <span className="font-editorial italic truncate">
            Buscar perfumes, marcas…
          </span>
        </button>
      ) : (
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((s) => !s)}
          aria-label="Buscar"
          aria-expanded={open}
          className="p-2.5 text-primary hover:text-gold transition-smooth"
        >
          <Search size={20} />
        </button>
      )}

      {open && (
        <>
          {/* Overlay leve solo en mobile para foco visual */}
          <div
            onClick={closeAndReset}
            className="fixed inset-0 bg-primary/10 backdrop-blur-[1px] z-40 lg:hidden"
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Buscador de perfumes"
            className="fixed lg:absolute top-[120px] sm:top-[152px] lg:top-[calc(100%+8px)] left-0 right-0 lg:left-auto lg:right-0 z-50 lg:w-[420px] bg-background border border-gold/30 shadow-elegant"
          >
            <div className="flex items-center gap-3 p-4 border-b border-border/60">
              <Search size={18} className="text-gold shrink-0" />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre o marca…"
                className="flex-1 bg-transparent outline-none text-sm font-editorial italic placeholder:text-muted-foreground/60"
                aria-label="Término de búsqueda"
              />
              <button
                type="button"
                onClick={closeAndReset}
                aria-label="Cerrar"
                className="p-1 text-muted-foreground hover:text-primary"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {q.trim().length < 2 ? (
                <p className="px-4 py-6 text-xs text-muted-foreground italic font-editorial">
                  Escribí al menos 2 letras para buscar.
                </p>
              ) : loading ? (
                <p className="px-4 py-6 text-xs text-muted-foreground italic font-editorial">
                  Buscando…
                </p>
              ) : hits === null ? null : hits.length === 0 ? (
                <p className="px-4 py-6 text-xs text-muted-foreground italic font-editorial">
                  No encontramos perfumes con esa búsqueda.
                </p>
              ) : (
                <ul>
                  {hits.map((h) => (
                    <li key={h.id} className="border-b border-border/30 last:border-0">
                      <Link
                        href={h.slug ? `/producto/${h.slug}` : "/catalogo"}
                        onClick={closeAndReset}
                        className="flex items-center gap-3 p-3 hover:bg-cream/40 transition-smooth"
                      >
                        <div className="relative w-12 h-14 shrink-0 bg-cream overflow-hidden">
                          {h.imagen_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={h.imagen_url}
                              alt={h.nombre ?? ""}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] tracking-[0.25em] uppercase text-gold truncate">
                            {h.marca ?? ""}
                          </div>
                          <div className="font-display text-sm text-primary truncate">
                            {h.nombre ?? "(sin nombre)"}
                          </div>
                          <div className="text-xs text-primary/80 mt-0.5">
                            Gs. {Math.round(h.precio).toLocaleString("es-PY")}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
