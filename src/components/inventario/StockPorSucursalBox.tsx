"use client";

import { useEffect, useState } from "react";

interface StockRow { sucursal_id: string; nombre: string; es_principal: boolean; stock_actual: number; incluido?: boolean }

interface Props {
  productoId: string;
  /** Solo admin puede editar — operativos ven el desglose en modo lectura. */
  canEdit: boolean;
}

/**
 * Caja con desglose de stock per-sucursal del producto.
 * Para admin: cada sucursal tiene input editable + botón Guardar; también
 * incluye un checkbox "Incluir en esta sucursal" — destildarlo borra la
 * fila y el producto deja de aparecer para los operativos de esa sucursal.
 */
export default function StockPorSucursalBox({ productoId, canEdit }: Props) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    fetch(`/api/inventario/stock-sucursal?producto_id=${encodeURIComponent(productoId)}`, {
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
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-700 mb-3">Stock por sucursal</p>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <SucursalRow
            key={r.sucursal_id}
            row={r}
            productoId={productoId}
            canEdit={canEdit}
            onChanged={() => setRefresh((x) => x + 1)}
          />
        ))}
      </ul>
      {canEdit && (
        <p className="text-xs text-slate-500 mt-2">
          Destildar &quot;Incluir&quot; quita el producto del inventario de esa sucursal (no borra el producto del catálogo).
        </p>
      )}
    </div>
  );
}

function SucursalRow({
  row, productoId, canEdit, onChanged,
}: { row: StockRow; productoId: string; canEdit: boolean; onChanged: () => void }) {
  const [stock, setStock] = useState<string>(String(row.stock_actual));
  const [incluido, setIncluido] = useState<boolean>(row.incluido !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/inventario/stock-sucursal", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          producto_id: productoId,
          sucursal_id: row.sucursal_id,
          stock_actual: incluido ? Number(stock) || 0 : null,
          incluido,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) { setError(j?.error ?? `Error ${r.status}`); return; }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally { setBusy(false); }
  }

  const dirty = incluido !== (row.incluido !== false) || Number(stock) !== Number(row.stock_actual);

  return (
    <li className="py-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <p className="text-sm text-slate-700 font-medium">
            {row.nombre}
            {row.es_principal && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">Principal</span>
            )}
          </p>
        </div>
        {canEdit ? (
          <>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={incluido}
                onChange={(e) => setIncluido(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]"
              />
              Incluir
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              disabled={!incluido}
              className="w-24 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right disabled:bg-slate-50 disabled:text-slate-400"
            />
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={guardar}
              className="px-3 py-1 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "…" : "Guardar"}
            </button>
          </>
        ) : (
          <span className="text-sm font-semibold tabular-nums text-slate-800">
            {Number(row.stock_actual).toLocaleString("es-PY", { maximumFractionDigits: 3 })}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </li>
  );
}
