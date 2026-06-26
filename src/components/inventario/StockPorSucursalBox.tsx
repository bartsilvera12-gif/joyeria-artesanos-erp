"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";

interface StockRow { sucursal_id: string; nombre: string; es_principal: boolean; stock_actual: number }

interface Props {
  productoId: string;
  /** Admin: muestra botón "Transferir". Operativos solo ven el desglose. */
  canTransfer: boolean;
}

/**
 * Caja informativa con el stock per-sucursal del producto. Permite, a usuarios
 * admin, abrir un modal para mover unidades entre sucursales sin tener que ir
 * al importador. Operativos solo ven el desglose en modo lectura.
 */
export default function StockPorSucursalBox({ productoId, canTransfer }: Props) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    fetch(`/api/inventario/transferencia?producto_id=${encodeURIComponent(productoId)}`, {
      credentials: "include", cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (j?.success) setRows((j.data?.stocks ?? []) as StockRow[]);
      })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [productoId, refresh]);

  if (cargando) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Cargando stock por sucursal…
      </div>
    );
  }

  if (rows.length === 0) {
    return null; // schema sin sucursales o sin datos: caja oculta
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-700">Stock por sucursal</p>
        {canTransfer && rows.length >= 2 && (
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900 border border-indigo-200 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Transferir entre sucursales
          </button>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.sucursal_id} className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-slate-700">
              {r.nombre}
              {r.es_principal && (
                <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">Principal</span>
              )}
            </span>
            <span className="font-semibold tabular-nums text-slate-800">
              {Number(r.stock_actual).toLocaleString("es-PY", { maximumFractionDigits: 3 })}
            </span>
          </li>
        ))}
      </ul>
      {modalAbierto && (
        <TransferirStockModal
          productoId={productoId}
          stocks={rows}
          onClose={() => setModalAbierto(false)}
          onDone={() => { setModalAbierto(false); setRefresh((x) => x + 1); }}
        />
      )}
    </div>
  );
}

interface ModalProps {
  productoId: string;
  stocks: StockRow[];
  onClose: () => void;
  onDone: () => void;
}

function TransferirStockModal({ productoId, stocks, onClose, onDone }: ModalProps) {
  const [desde, setDesde] = useState<string>(stocks.find((s) => s.stock_actual > 0)?.sucursal_id ?? stocks[0]?.sucursal_id ?? "");
  const [hacia, setHacia] = useState<string>(stocks.find((s) => s.sucursal_id !== desde)?.sucursal_id ?? "");
  const [cantidad, setCantidad] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stockDesde = Number(stocks.find((s) => s.sucursal_id === desde)?.stock_actual ?? 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const c = Number(cantidad);
    if (!Number.isFinite(c) || c <= 0) { setError("Ingresá una cantidad mayor a cero."); return; }
    if (desde === hacia) { setError("La sucursal origen y destino deben ser distintas."); return; }
    if (c > stockDesde) { setError(`No hay suficiente stock en origen (disponible: ${stockDesde}).`); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/inventario/transferencia", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ producto_id: productoId, desde_sucursal_id: desde, hacia_sucursal_id: hacia, cantidad: c }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) { setError(j?.error ?? `Error ${r.status}`); return; }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Transferir stock entre sucursales</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-sm bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Desde</label>
            <select
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {stocks.map((s) => (
                <option key={s.sucursal_id} value={s.sucursal_id}>
                  {s.nombre} — stock: {Number(s.stock_actual).toLocaleString("es-PY")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Hacia</label>
            <select
              value={hacia}
              onChange={(e) => setHacia(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {stocks.filter((s) => s.sucursal_id !== desde).map((s) => (
                <option key={s.sucursal_id} value={s.sucursal_id}>{s.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cantidad</label>
            <input
              type="number"
              min={1}
              step={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              placeholder="0"
            />
            <p className="text-xs text-slate-500 mt-1">Disponible en origen: {stockDesde.toLocaleString("es-PY")}</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">Cancelar</button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Transferiendo…" : "Confirmar transferencia"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
