"use client";

import { useEffect, useMemo, useState } from "react";

interface StockRow { sucursal_id: string; nombre: string; es_principal: boolean; stock_actual: number; incluido?: boolean }

interface Props {
  productoId: string;
  /** Solo admin puede editar — operativos ven el desglose en modo lectura. */
  canEdit: boolean;
}

/**
 * Caja con desglose de stock per-sucursal.
 *
 * Modelo: Principal es el "pool" del total. Admin edita las sucursales
 * NO-principales; lo que se asigna a Sucursal 2 se descuenta de Principal
 * automáticamente. Total (productos.stock_actual) no cambia desde acá.
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

  const total = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.stock_actual ?? 0), 0),
    [rows],
  );
  const principalRow = rows.find((r) => r.es_principal);
  const otrasRows = rows.filter((r) => !r.es_principal);

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
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-700">Stock por sucursal</p>
        <span className="text-xs text-slate-500">
          Total disponible: <strong className="tabular-nums text-slate-800">{total}</strong>
        </span>
      </div>

      {/* Principal: lectura. No tiene checkbox ni botón porque siempre
          contiene lo que la web pública refleja; el split es elección
          solo si se manda algo a otras sucursales. */}
      {principalRow && (
        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-2">
          <span className="text-sm text-slate-700 font-medium">
            {principalRow.nombre}
            <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">Principal · web</span>
          </span>
          <span className="text-sm font-semibold tabular-nums text-slate-800">
            {Number(principalRow.stock_actual).toLocaleString("es-PY", { maximumFractionDigits: 3 })}
          </span>
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {otrasRows.map((r) => (
          <SucursalRow
            key={r.sucursal_id}
            row={r}
            principalStock={Number(principalRow?.stock_actual ?? 0)}
            productoId={productoId}
            canEdit={canEdit}
            onChanged={() => setRefresh((x) => x + 1)}
          />
        ))}
      </ul>

      {canEdit && otrasRows.length > 0 && (
        <p className="text-xs text-slate-500 mt-2">
          Lo que asignás a otra sucursal se descuenta de Principal automáticamente. El total no cambia.
        </p>
      )}
    </div>
  );
}

function SucursalRow({
  row, principalStock, productoId, canEdit, onChanged,
}: { row: StockRow; principalStock: number; productoId: string; canEdit: boolean; onChanged: () => void }) {
  const [stock, setStock] = useState<string>(String(row.stock_actual));
  const [incluido, setIncluido] = useState<boolean>(row.incluido !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stockNum = Number(stock) || 0;
  const delta = stockNum - Number(row.stock_actual);
  // Máximo disponible para asignar a esta sucursal = lo que ya tenía + lo
  // que hay en Principal.
  const maxDisponible = Number(row.stock_actual) + principalStock;
  const excede = incluido && stockNum > maxDisponible;

  async function guardar() {
    setError(null);
    if (excede) {
      setError(`No alcanza el stock. Hay ${maxDisponible} disponible en total.`);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/inventario/stock-sucursal", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          producto_id: productoId,
          sucursal_id: row.sucursal_id,
          stock_actual: incluido ? stockNum : null,
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

  const dirty = incluido !== (row.incluido !== false) || stockNum !== Number(row.stock_actual);

  return (
    <li className="py-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <p className="text-sm text-slate-700 font-medium">{row.nombre}</p>
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
              className={`w-24 border rounded-lg px-2 py-1 text-sm text-right disabled:bg-slate-50 disabled:text-slate-400 ${
                excede ? "border-red-400 bg-red-50" : "border-slate-300"
              }`}
            />
            <button
              type="button"
              disabled={!dirty || busy || excede}
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
      {canEdit && incluido && dirty && !excede && (
        <p className="text-[11px] text-slate-500 mt-1">
          {delta > 0
            ? `Principal pasará de ${principalStock} a ${principalStock - delta}.`
            : delta < 0
              ? `Principal pasará de ${principalStock} a ${principalStock + (-delta)}.`
              : ""}
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {excede && !error && (
        <p className="text-xs text-red-600 mt-1">
          Excede el stock disponible (máximo {maxDisponible}).
        </p>
      )}
    </li>
  );
}
