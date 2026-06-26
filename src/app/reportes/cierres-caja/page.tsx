"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import { getCierresCaja } from "@/lib/caja/storage";
import type { CajaResumen } from "@/lib/caja/types";
import { formatGs, formatFechaHora } from "@/lib/reportes/format";

type FiltroEstado = "todas" | "abierta" | "cerrada";

const inputClass = "border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2] bg-white";

export default function CierresCajaPage() {
  const [cajas, setCajas] = useState<CajaResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>("todas");
  const [sucursalFiltro, setSucursalFiltro] = useState<string>("todas");

  useEffect(() => {
    let cancelled = false;
    getCierresCaja().then((d) => {
      if (!cancelled) { setCajas(d); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  const sucursalesUnicas = useMemo(() => {
    const set = new Map<string, string>();
    for (const c of cajas) {
      if (c.sucursal_nombre) set.set(c.sucursal_nombre, c.sucursal_nombre);
    }
    return [...set.keys()].sort();
  }, [cajas]);

  const filtradas = useMemo(() => {
    const dStart = desde ? new Date(`${desde}T00:00:00`) : null;
    const dEnd = hasta ? new Date(`${hasta}T23:59:59.999`) : null;
    return cajas.filter((c) => {
      if (estado !== "todas" && c.caja.estado !== estado) return false;
      if (sucursalFiltro !== "todas" && (c.sucursal_nombre ?? "") !== sucursalFiltro) return false;
      // Filtro por fecha de APERTURA (el turno puede cruzar medianoche; se agrupa por caja).
      const f = new Date(c.caja.fecha_apertura);
      if (dStart && f < dStart) return false;
      if (dEnd && f > dEnd) return false;
      return true;
    });
  }, [cajas, desde, hasta, estado, sucursalFiltro]);

  const hayFiltros = desde || hasta || estado !== "todas" || sucursalFiltro !== "todas";

  /** Agregado por sucursal sobre el set filtrado (admin ve breakdown). */
  const totalesPorSucursal = useMemo(() => {
    const map = new Map<string, { vendido: number; efectivo: number; transferencia: number; tarjeta: number; cajas: number }>();
    for (const c of filtradas) {
      const k = c.sucursal_nombre ?? "Sin sucursal";
      const acc = map.get(k) ?? { vendido: 0, efectivo: 0, transferencia: 0, tarjeta: 0, cajas: 0 };
      acc.vendido += c.total_vendido;
      acc.efectivo += c.total_efectivo;
      acc.transferencia += c.total_transferencia;
      acc.tarjeta += c.total_tarjeta;
      acc.cajas += 1;
      map.set(k, acc);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtradas]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reportes" className="text-xs text-[#4FAEB2] hover:underline">← Reportes</Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Cierres de caja</h1>
        <p className="mt-0.5 text-xs text-slate-500">Aperturas, cierres, movimientos y diferencias por turno.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {/* Filtros */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)} className={inputClass}>
              <option value="todas">Todas</option>
              <option value="abierta">Abierta</option>
              <option value="cerrada">Cerrada</option>
            </select>
          </div>
          {sucursalesUnicas.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Sucursal</label>
              <select value={sucursalFiltro} onChange={(e) => setSucursalFiltro(e.target.value)} className={inputClass}>
                <option value="todas">Todas</option>
                {sucursalesUnicas.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          {hayFiltros && (
            <button onClick={() => { setDesde(""); setHasta(""); setEstado("todas"); setSucursalFiltro("todas"); }} className="px-2 py-2 text-sm text-slate-400 hover:text-slate-600">
              Limpiar
            </button>
          )}
          <span className="ml-auto text-sm text-slate-400">{filtradas.length} de {cajas.length} cajas</span>
        </div>

        {totalesPorSucursal.length > 1 && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {totalesPorSucursal.map(([nombre, t]) => (
              <div key={nombre} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{nombre}</span>
                  <span className="text-[11px] text-slate-400">{t.cajas} {t.cajas === 1 ? "caja" : "cajas"}</span>
                </div>
                <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-800">{formatGs(t.vendido)}</p>
                <p className="text-[11px] text-slate-500">vendido</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                  <div><span className="block text-slate-400">Efvo.</span><span className="tabular-nums">{formatGs(t.efectivo)}</span></div>
                  <div><span className="block text-slate-400">Transf.</span><span className="tabular-nums">{formatGs(t.transferencia)}</span></div>
                  <div><span className="block text-slate-400">Tarjeta</span><span className="tabular-nums">{formatGs(t.tarjeta)}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Cargando…</p>
        ) : filtradas.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No hay cajas para los filtros seleccionados.</p>
        ) : (
          <EdgeScrollArea>
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2.5">N°</th>
                  <th className="px-3 py-2.5">Sucursal</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5">Apertura</th>
                  <th className="px-3 py-2.5">Cierre</th>
                  <th className="px-3 py-2.5 text-right">Apertura Gs</th>
                  <th className="px-3 py-2.5 text-right">Vendido</th>
                  <th className="px-3 py-2.5 text-right">Efectivo</th>
                  <th className="px-3 py-2.5 text-right">Transfer.</th>
                  <th className="px-3 py-2.5 text-right">Tarjeta</th>
                  <th className="px-3 py-2.5 text-right">Esperado</th>
                  <th className="px-3 py-2.5 text-right">Contado</th>
                  <th className="px-3 py-2.5 text-right">Diferencia</th>
                  <th className="px-3 py-2.5 text-center">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c) => {
                  const dif = c.caja.diferencia;
                  const esperado = c.caja.monto_esperado_efectivo ?? (c.caja.estado === "abierta" ? c.efectivo_esperado : null);
                  return (
                    <tr key={c.caja.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-medium tabular-nums">{c.caja.numero_caja}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">{c.sucursal_nombre ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.caja.estado === "abierta" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          {c.caja.estado === "abierta" ? "Abierta" : "Cerrada"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {formatFechaHora(c.caja.fecha_apertura)}
                        <span className="block text-[11px] text-slate-400">{c.abierta_por_nombre ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {formatFechaHora(c.caja.fecha_cierre)}
                        <span className="block text-[11px] text-slate-400">{c.cerrada_por_nombre ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(c.caja.monto_apertura)}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatGs(c.total_vendido)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(c.total_efectivo)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(c.total_transferencia)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(c.total_tarjeta)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(esperado)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(c.caja.monto_cierre_contado)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${dif == null ? "text-slate-400" : dif === 0 ? "text-emerald-600" : dif > 0 ? "text-sky-600" : "text-red-600"}`}>
                        {dif == null ? "—" : formatGs(dif)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Link href={`/reportes/cierres-caja/${c.caja.id}`} className="text-xs font-medium text-[#4FAEB2] hover:underline">
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </EdgeScrollArea>
        )}
      </div>
    </div>
  );
}
