"use client";
import { confirm } from "@/components/ui/dialog";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

interface Presentacion {
  id: string;
  producto_id: string;
  sku: string;
  codigo_barras: string | null;
  volumen_ml: number;
  costo_promedio: number;
  precio_venta: number;
  precio_web: number | null;
  precio_oferta: number | null;
  precio_mayorista: number | null;
  cantidad_minima_mayorista: number | null;
  visible_mayorista_web: boolean;
  stock_actual: number;
  stock_minimo: number;
  imagen_url: string | null;
  visible_web: boolean;
  activo: boolean;
  orden: number;
}

interface Props {
  productoId: string;
  /** URL de imagen principal del producto base, para mostrar como herencia. */
  fallbackImagenUrl?: string | null;
  /** Notifica al padre cuando el conteo de presentaciones cambia (para que
   *  el form refresque productos.tiene_presentaciones desde server). */
  onChange?: (info: { total: number }) => void;
}

const inputCls =
  "w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:ring-1 focus:ring-emerald-400 focus:outline-none";

/**
 * Sección "Presentaciones por ml" del editor de producto.
 *
 * - Lista filas con SKU, vol, precio, stock, visible, activo y acciones.
 * - Form de alta inline al pie.
 * - Botón "Generar SKU" reusa /api/productos/generar-sku (mismo backend que
 *   el producto base; los SKUs ELE_PER comparten secuencia con productos).
 * - Edita en línea (PATCH al perder foco / cambiar checkbox).
 * - Elimina con confirm.
 *
 * NO permite descuentos automáticos. NO toca precio/stock del producto base.
 */
export function PresentacionesEditor({ productoId, fallbackImagenUrl, onChange }: Props) {
  const [items, setItems] = useState<Presentacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form alta
  const [nVolumen, setNVolumen] = useState("");
  const [nSku, setNSku] = useState("");
  const [nPrecioVenta, setNPrecioVenta] = useState("");
  const [nStock, setNStock] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/productos/${productoId}/presentaciones`,
        { cache: "no-store" }
      );
      const j = await r.json();
      if (r.ok && j?.success) {
        const list = (j.data.presentaciones ?? []) as Presentacion[];
        setItems(list);
        onChange?.({ total: list.length });
      } else {
        setError(j?.error ?? "No se pudo cargar presentaciones");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [productoId, onChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleGenerarSku() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetchWithSupabaseSession("/api/productos/generar-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefijo: "ELE_PER" }),
      });
      const j = await r.json();
      if (r.ok && j?.success && typeof j.data?.sku === "string") {
        setNSku(j.data.sku);
      } else {
        setError(j?.error ?? "No se pudo generar SKU");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCrear() {
    if (busy) return;
    setError(null);
    const vol = Number(nVolumen);
    const precio = Number(nPrecioVenta);
    const stock = Number(nStock);
    if (!Number.isFinite(vol) || vol <= 0) {
      setError("Volumen (ml) debe ser > 0");
      return;
    }
    if (!nSku.trim()) {
      setError("SKU obligatorio");
      return;
    }
    if (!Number.isFinite(precio) || precio < 0) {
      setError("Precio inválido");
      return;
    }
    setBusy(true);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/productos/${productoId}/presentaciones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            volumen_ml: vol,
            sku: nSku.trim(),
            precio_venta: precio,
            stock_actual: Number.isFinite(stock) ? stock : 0,
            visible_web: true,
            activo: true,
          }),
        }
      );
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo crear presentación");
      } else {
        setNVolumen("");
        setNSku("");
        setNPrecioVenta("");
        setNStock("0");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function patchPres(id: string, patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/productos/${productoId}/presentaciones/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo actualizar");
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ message: "¿Eliminar esta presentación? No se puede deshacer.", variant: "danger", confirmText: "Aceptar" }))) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/productos/${productoId}/presentaciones/${id}`,
        { method: "DELETE" }
      );
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo eliminar");
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-slate-100 pt-6 mt-2">
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-slate-800">Presentaciones por ml</h2>
        <p className="text-xs text-slate-500">
          Cada presentación tiene SKU, precio y stock propios. Cuando hay al menos
          una, la web obliga a elegir un ml antes de agregar al carrito.{" "}
          <strong>No tocar precio/stock del producto base.</strong>
        </p>
      </header>

      {/* Lista */}
      {loading ? (
        <p className="text-xs text-slate-400">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-slate-400">
          Aún no hay presentaciones. Crear la primera convierte al producto en
          "con presentaciones" en la web.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase">
              <tr>
                <th className="text-left px-2 py-1.5">ml</th>
                <th className="text-left px-2 py-1.5">SKU</th>
                <th className="text-right px-2 py-1.5">Precio venta</th>
                <th className="text-right px-2 py-1.5">Stock</th>
                <th className="text-center px-2 py-1.5">Visible</th>
                <th className="text-center px-2 py-1.5">Activo</th>
                <th className="text-right px-2 py-1.5">Orden</th>
                <th className="text-center px-2 py-1.5">Imagen</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      defaultValue={p.volumen_ml}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v > 0 && v !== p.volumen_ml)
                          patchPres(p.id, { volumen_ml: v });
                      }}
                      className={`${inputCls} w-16`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      defaultValue={p.sku}
                      onBlur={(e) => {
                        const v = e.target.value.trim().toUpperCase();
                        if (v && v !== p.sku) patchPres(p.id, { sku: v });
                      }}
                      className={`${inputCls} w-32 font-mono`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      defaultValue={p.precio_venta}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 0 && v !== p.precio_venta)
                          patchPres(p.id, { precio_venta: v });
                      }}
                      className={`${inputCls} w-24 text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      defaultValue={p.stock_actual}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 0 && v !== p.stock_actual)
                          patchPres(p.id, { stock_actual: v });
                      }}
                      className={`${inputCls} w-16 text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={p.visible_web}
                      onChange={(e) => patchPres(p.id, { visible_web: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={p.activo}
                      onChange={(e) => patchPres(p.id, { activo: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      defaultValue={p.orden}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== p.orden)
                          patchPres(p.id, { orden: v });
                      }}
                      className={`${inputCls} w-14 text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {p.imagen_url ? (
                      <span className="text-emerald-700">propia</span>
                    ) : fallbackImagenUrl ? (
                      <span className="text-slate-500" title="Hereda imagen del producto base">
                        hereda
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      disabled={busy}
                      className="text-red-600 hover:text-red-800 underline disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Alta — grid responsive, sin superposición. SKU ocupa más ancho y el
          botón Generar va abajo del input para no encimarse. */}
      <div className="mt-4 border border-slate-200 rounded-lg p-4 bg-slate-50">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Nueva presentación
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 items-start">
          <div className="xl:col-span-1">
            <label className="block text-xs text-slate-600 mb-1">ml</label>
            <input
              type="number"
              value={nVolumen}
              onChange={(e) => setNVolumen(e.target.value)}
              placeholder="50"
              className={`${inputCls} text-sm`}
            />
          </div>
          <div className="sm:col-span-2 xl:col-span-2">
            <label className="block text-xs text-slate-600 mb-1">SKU</label>
            <input
              value={nSku}
              onChange={(e) => setNSku(e.target.value.toUpperCase())}
              placeholder="ELE_PER_####"
              className={`${inputCls} text-sm font-mono w-full`}
            />
            <button
              type="button"
              onClick={handleGenerarSku}
              disabled={busy}
              className="mt-1 text-[11px] text-emerald-700 hover:text-emerald-900 underline disabled:opacity-50 disabled:cursor-not-allowed"
              title="Generar el próximo SKU disponible"
            >
              Generar SKU automático
            </button>
          </div>
          <div className="xl:col-span-1">
            <label className="block text-xs text-slate-600 mb-1">Precio venta</label>
            <input
              type="number"
              value={nPrecioVenta}
              onChange={(e) => setNPrecioVenta(e.target.value)}
              placeholder="45000"
              className={`${inputCls} text-sm`}
            />
          </div>
          <div className="xl:col-span-1">
            <label className="block text-xs text-slate-600 mb-1">Stock</label>
            <input
              type="number"
              value={nStock}
              onChange={(e) => setNStock(e.target.value)}
              className={`${inputCls} text-sm`}
            />
          </div>
          <div className="xl:col-span-1 flex sm:items-end">
            <button
              type="button"
              onClick={handleCrear}
              disabled={busy}
              className="w-full bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Guardando…" : "Agregar"}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
