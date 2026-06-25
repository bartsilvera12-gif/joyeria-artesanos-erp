"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, MousePointerClick, ShoppingCart, MessageCircle, TrendingUp } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Range = "7d" | "30d" | "all";

interface TopItem {
  product_id: string;
  nombre: string;
  sku: string;
  imagen_url: string | null;
  total_eventos: number;
  vistas: number;
  clicks: number;
  agregados_carrito: number;
  clicks_whatsapp: number;
}

interface ApiResponse {
  success: boolean;
  data?: {
    range: Range;
    since: string | null;
    count: number;
    items: TopItem[];
  };
  error?: string;
}

const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "all", label: "Todo" },
];

/**
 * Card "Top 10 perfumes más buscados en la web".
 *
 * Lee desde GET /api/inventario/web-top-products?range=...
 * Estado vacío si no hay eventos en el rango. No genera datos sintéticos:
 * si nunca hubo tracking, simplemente muestra el mensaje educativo.
 */
export function WebTopProductsCard() {
  const [range, setRange] = useState<Range>("30d");
  const [items, setItems] = useState<TopItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchWithSupabaseSession(`/api/inventario/web-top-products?range=${range}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as ApiResponse;
        if (cancelled) return;
        if (!r.ok || !j?.success) {
          setItems([]);
          setError(j?.error ?? `Error ${r.status}`);
          return;
        }
        setItems(j.data?.items ?? []);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error de red");
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const isEmpty = useMemo(() => !loading && (items?.length ?? 0) === 0, [loading, items]);

  return (
    <div
      data-testid="web-top-products-card"
      className="bg-gradient-to-br from-sky-50 to-white border-2 border-sky-200 rounded-xl shadow-sm p-6"
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-[#4FAEB2]" aria-hidden="true" />
          <h2 className="text-xl font-bold text-[#0369A1]">
            Top 10 perfumes más buscados en la web
          </h2>
        </div>
        <div className="ml-auto flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                range === r.value
                  ? "bg-white text-[#4FAEB2] shadow-sm"
                  : "text-slate-600 hover:text-slate-800"
              }`}
              aria-pressed={range === r.value}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Cargando…</div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-red-500">
          No se pudo cargar el ranking: {error}
        </div>
      ) : isEmpty ? (
        <div className="py-12 text-center text-sm text-slate-400">
          Todavía no hay búsquedas registradas desde la web.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wide">
                <th className="py-2 pr-2 pl-3 w-10 text-center">#</th>
                <th className="py-2 pr-2">Producto</th>
                <th className="py-2 pr-2 hidden sm:table-cell">SKU</th>
                <th className="py-2 pr-2 text-right" title="Vistas de página de producto">
                  <span className="inline-flex items-center gap-1">
                    <Eye size={12} /> Vistas
                  </span>
                </th>
                <th className="py-2 pr-2 text-right hidden md:table-cell" title="Clicks desde catálogo">
                  <span className="inline-flex items-center gap-1">
                    <MousePointerClick size={12} /> Clicks
                  </span>
                </th>
                <th className="py-2 pr-2 text-right" title="Agregados al carrito">
                  <span className="inline-flex items-center gap-1">
                    <ShoppingCart size={12} /> Carrito
                  </span>
                </th>
                <th className="py-2 pr-2 text-right hidden md:table-cell" title="Clicks a WhatsApp">
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle size={12} /> WhatsApp
                  </span>
                </th>
                <th className="py-2 pr-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {items!.map((it, idx) => (
                <tr
                  key={it.product_id}
                  className="border-b border-slate-200 last:border-0 hover:bg-slate-50"
                >
                  <td className="py-2.5 pr-2 pl-3 text-center text-slate-400 tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 pr-2 font-medium text-gray-800">
                    <div className="flex items-center gap-3">
                      {it.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.imagen_url}
                          alt=""
                          className="h-9 w-9 object-cover rounded border border-slate-200"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded bg-slate-100 border border-slate-200" />
                      )}
                      <span className="truncate max-w-[260px]">{it.nombre}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-2 text-gray-500 font-mono text-xs hidden sm:table-cell">
                    {it.sku}
                  </td>
                  <td className="py-2.5 pr-2 text-right text-gray-700 tabular-nums">{it.vistas}</td>
                  <td className="py-2.5 pr-2 text-right text-gray-700 tabular-nums hidden md:table-cell">
                    {it.clicks}
                  </td>
                  <td className="py-2.5 pr-2 text-right text-gray-700 tabular-nums">
                    {it.agregados_carrito}
                  </td>
                  <td className="py-2.5 pr-2 text-right text-gray-700 tabular-nums hidden md:table-cell">
                    {it.clicks_whatsapp}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold text-gray-800 tabular-nums">
                    {it.total_eventos}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
