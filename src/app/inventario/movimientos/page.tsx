"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getMovimientos } from "@/lib/inventario/storage";
import type { MovimientoInventario, TipoMovimiento, OrigenMovimiento } from "@/lib/inventario/types";

type PageSize = 10 | 50 | 100 | "todos";

const tipoBadge: Record<TipoMovimiento, string> = {
  ENTRADA: "bg-green-100 text-green-700",
  SALIDA: "bg-red-100 text-red-700",
  AJUSTE: "bg-yellow-100 text-yellow-700",
};

const origenLabel: Record<OrigenMovimiento, string> = {
  compra: "Compra",
  venta: "Venta",
  ajuste_manual: "Ajuste manual",
  inventario_inicial: "Inventario inicial",
};

const origenBadge: Record<OrigenMovimiento, string> = {
  compra: "bg-blue-50 text-blue-600",
  venta: "bg-purple-50 text-purple-600",
  ajuste_manual: "bg-gray-100 text-gray-600",
  inventario_inicial: "bg-orange-50 text-orange-600",
};

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
}

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
  } catch {
    return iso;
  }
}

const inputFilterClass =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors bg-white";

export default function MovimientosPage() {
  const [todos, setTodos] = useState<MovimientoInventario[]>([]);

  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoMovimiento | "">("");
  const [filtroOrigen, setFiltroOrigen] = useState<OrigenMovimiento | "">("");
  const [fechaDesde, setFechaDesde] = useState("");  // "YYYY-MM-DD"
  const [fechaHasta, setFechaHasta] = useState(""); // "YYYY-MM-DD"

  // Paginación client-side (mismo patrón que /inventario)
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [paginaActual, setPaginaActual] = useState(0);
  const [cargandoLista, setCargandoLista] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCargandoLista(true);
    getMovimientos()
      .then((data) => { if (!cancelled) setTodos(data); })
      .finally(() => { if (!cancelled) setCargandoLista(false); });
    return () => { cancelled = true; };
  }, []);

  const filtrados = useMemo(() => todos.filter((m) => {
    const texto = busqueda.toLowerCase();
    const coincideTexto =
      texto === "" ||
      m.producto_nombre.toLowerCase().includes(texto) ||
      m.producto_sku.toLowerCase().includes(texto);
    const coincideTipo = filtroTipo === "" || m.tipo === filtroTipo;
    const coincideOrigen = filtroOrigen === "" || m.origen === filtroOrigen;
    const fechaMov = m.fecha.slice(0, 10);
    const coincideDesde = fechaDesde === "" || fechaMov >= fechaDesde;
    const coincideHasta = fechaHasta === "" || fechaMov <= fechaHasta;
    return coincideTexto && coincideTipo && coincideOrigen && coincideDesde && coincideHasta;
  }), [todos, busqueda, filtroTipo, filtroOrigen, fechaDesde, fechaHasta]);

  // Cuando cambia el universo filtrado, volvemos a la página 0 para que el
  // usuario no quede en una página vacía.
  useEffect(() => {
    setPaginaActual(0);
  }, [busqueda, filtroTipo, filtroOrigen, fechaDesde, fechaHasta, pageSize]);

  const totalPaginas = pageSize === "todos" ? 1 : Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginaSegura = Math.min(paginaActual, totalPaginas - 1);
  const filtradosPagina = useMemo(() => {
    if (pageSize === "todos") return filtrados;
    const start = paginaSegura * pageSize;
    return filtrados.slice(start, start + pageSize);
  }, [filtrados, paginaSegura, pageSize]);

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-3xl font-bold text-gray-800">Movimientos de inventario</h1>
        <p className="text-gray-600">Registro de entradas, salidas y ajustes de stock</p>
      </div>

      <div className="bg-white rounded-xl shadow p-6">

        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Historial</h2>
            <Link
              href="/inventario/movimientos/nuevo"
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Nuevo movimiento
            </Link>
            <span className="text-sm text-gray-400">
              {filtrados.length === todos.length
                ? `${todos.length} registro${todos.length === 1 ? "" : "s"}`
                : `${filtrados.length} de ${todos.length} (filtrado)`}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Los movimientos se generan automáticamente desde <span className="font-medium text-gray-500">Compras</span>
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-5 pb-5 border-b border-gray-100">
          {/* Fila 1: búsqueda + tipo + origen */}
          <input
            type="text"
            placeholder="Buscar por producto o SKU..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputFilterClass} min-w-56`}
          />
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as TipoMovimiento | "")}
            className={inputFilterClass}
          >
            <option value="">Todos los tipos</option>
            <option value="ENTRADA">ENTRADA</option>
            <option value="SALIDA">SALIDA</option>
            <option value="AJUSTE">AJUSTE</option>
          </select>
          <select
            value={filtroOrigen}
            onChange={(e) => setFiltroOrigen(e.target.value as OrigenMovimiento | "")}
            className={inputFilterClass}
          >
            <option value="">Todos los orígenes</option>
            <option value="compra">Compra</option>
            <option value="venta">Venta</option>
            <option value="ajuste_manual">Ajuste manual</option>
          </select>

          {/* Separador visual entre grupos */}
          <div className="w-full flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 whitespace-nowrap">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                max={fechaHasta || undefined}
                className={inputFilterClass}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 whitespace-nowrap">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                min={fechaDesde || undefined}
                className={inputFilterClass}
              />
            </div>
            {(busqueda || filtroTipo || filtroOrigen || fechaDesde || fechaHasta) && (
              <button
                onClick={() => {
                  setBusqueda("");
                  setFiltroTipo("");
                  setFiltroOrigen("");
                  setFechaDesde("");
                  setFechaHasta("");
                }}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Paginación TOP (espejo del bloque de abajo). Aparece solo si hay
            registros para evitar UI vacía. */}
        {filtrados.length > 0 && (
          <PaginationBar
            pageSize={pageSize}
            setPageSize={setPageSize}
            paginaSegura={paginaSegura}
            setPaginaActual={setPaginaActual}
            totalPaginas={totalPaginas}
            total={filtrados.length}
            etiqueta="movimiento"
          />
        )}

        {/* Tabla — min-w activa el scroll horizontal en mobile;
            SKU, Origen, Usuario se ocultan en pantallas chicas. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] sm:min-w-0 text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-3 pr-4 font-medium">Producto</th>
                <th className="py-3 pr-4 font-medium hidden md:table-cell">SKU</th>
                <th className="py-3 pr-4 font-medium">Tipo</th>
                <th className="py-3 pr-4 font-medium text-right">Cantidad</th>
                <th className="py-3 pr-4 font-medium text-right hidden lg:table-cell">Costo unit.</th>
                <th className="py-3 pr-4 font-medium hidden md:table-cell">Origen</th>
                <th className="py-3 pr-4 font-medium hidden lg:table-cell">Usuario</th>
                <th className="py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {cargandoLista ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin text-[#4FAEB2]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Cargando movimientos…
                    </div>
                  </td>
                </tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    {todos.length === 0
                      ? "No hay movimientos registrados"
                      : "Ningún movimiento coincide con los filtros"}
                  </td>
                </tr>
              ) : (
                filtradosPagina.map((m) => {
                  const signo =
                    m.tipo === "ENTRADA" ? "+" : m.tipo === "SALIDA" ? "−" : m.cantidad >= 0 ? "+" : "";
                  const cantidadColor =
                    m.tipo === "ENTRADA"
                      ? "text-green-600"
                      : m.tipo === "SALIDA"
                      ? "text-red-600"
                      : "text-yellow-600";

                  return (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-4 pr-4 font-medium text-gray-800">{m.producto_nombre}</td>
                      <td className="py-4 pr-4 text-gray-500 font-mono hidden md:table-cell">{m.producto_sku}</td>
                      <td className="py-4 pr-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${tipoBadge[m.tipo]}`}>
                          {m.tipo}
                        </span>
                      </td>
                      <td className={`py-4 pr-4 text-right font-semibold tabular-nums ${cantidadColor}`}>
                        {signo}{Math.abs(m.cantidad)}
                      </td>
                      <td className="py-4 pr-4 text-right text-gray-700 tabular-nums hidden lg:table-cell">
                        {formatGs(m.costo_unitario)}
                      </td>
                      <td className="py-4 pr-4 hidden md:table-cell">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${origenBadge[m.origen]}`}>
                          {origenLabel[m.origen]}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-gray-600 text-xs hidden lg:table-cell">
                        {m.usuario_nombre ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-4 text-gray-500 text-xs tabular-nums">
                        {formatFecha(m.fecha)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación BOTTOM */}
        {filtrados.length > 0 && (
          <PaginationBar
            pageSize={pageSize}
            setPageSize={setPageSize}
            paginaSegura={paginaSegura}
            setPaginaActual={setPaginaActual}
            totalPaginas={totalPaginas}
            total={filtrados.length}
            etiqueta="movimiento"
          />
        )}

      </div>

    </div>
  );
}

interface PaginationBarProps {
  pageSize: PageSize;
  setPageSize: (s: PageSize) => void;
  paginaSegura: number;
  setPaginaActual: (n: number | ((p: number) => number)) => void;
  totalPaginas: number;
  total: number;
  etiqueta: string;
}

function PaginationBar({
  pageSize, setPageSize, paginaSegura, setPaginaActual, totalPaginas, total, etiqueta,
}: PaginationBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm">
      <div className="flex items-center gap-2 text-slate-600">
        <label className="text-xs text-slate-500">Mostrar</label>
        <select
          value={String(pageSize)}
          onChange={(e) => {
            const v = e.target.value;
            setPageSize(v === "todos" ? "todos" : (parseInt(v) as 10 | 50 | 100));
          }}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/30"
        >
          <option value="10">10</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="todos">Todos</option>
        </select>
        <span className="text-xs text-slate-400">
          {pageSize === "todos"
            ? `${total} ${etiqueta}(s)`
            : `${paginaSegura * pageSize + 1}–${Math.min((paginaSegura + 1) * pageSize, total)} de ${total}`}
        </span>
      </div>

      {pageSize !== "todos" && totalPaginas > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPaginaActual(0)} disabled={paginaSegura === 0}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Primera página">«</button>
          <button type="button" onClick={() => setPaginaActual((p) => Math.max(0, p - 1))} disabled={paginaSegura === 0}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
            ‹ Anterior
          </button>
          <span className="px-3 text-xs text-slate-600 tabular-nums">
            Página <span className="font-semibold">{paginaSegura + 1}</span> de {totalPaginas}
          </span>
          <button type="button" onClick={() => setPaginaActual((p) => Math.min(totalPaginas - 1, p + 1))} disabled={paginaSegura >= totalPaginas - 1}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
            Siguiente ›
          </button>
          <button type="button" onClick={() => setPaginaActual(totalPaginas - 1)} disabled={paginaSegura >= totalPaginas - 1}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Última página">»</button>
        </div>
      )}
    </div>
  );
}
