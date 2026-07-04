"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Star, Trash2, ImageOff } from "lucide-react";
import { getProductos } from "@/lib/inventario/storage";
import { publicProductoImagenUrl } from "@/lib/inventario/imagen-storage";
import type { Producto, MetodoValuacion } from "@/lib/inventario/types";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import StatCard from "@/components/ui/StatCard";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { useUsuarioActual } from "@/shared/hooks/useUsuarioActual";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none";

const metodoBadge: Record<MetodoValuacion, string> = {
  CPP: "bg-blue-100 text-blue-700",
  FIFO: "bg-green-100 text-green-700",
  LIFO: "bg-purple-100 text-purple-700",
};

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
}

/** Cantidad de stock con hasta 3 decimales (los insumos pueden quedar fraccionados). */
function formatStock(valor: number) {
  return valor.toLocaleString("es-PY", { maximumFractionDigits: 3 });
}

function foldText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function calcularMargenVenta(costo: number, precio: number): number {
  if (precio === 0) return 0;
  return ((precio - costo) / precio) * 100;
}

function margenColor(margen: number): string {
  if (margen >= 40) return "text-green-600";
  if (margen >= 20) return "text-yellow-600";
  return "text-red-600";
}

interface UbicacionMin { id: string; nombre: string; tipo: string }
interface CategoriaMin { id: string; nombre: string }

export default function InventarioPage() {
  const { isAdmin } = useIsAdmin();
  const { usuario } = useUsuarioActual();
  // Solo Principal (o admin global sin sucursal) puede tocar los toggles de web.
  const puedeEditarWeb =
    !usuario?.sucursal_id || usuario.sucursal_es_principal === true;
  const [todos, setTodos] = useState<Producto[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbicacionMin[]>([]);
  const [categorias, setCategorias] = useState<CategoriaMin[]>([]);
  const [imagenesPrincipales, setImagenesPrincipales] = useState<Map<string, string>>(new Map());
  const [refreshKey, setRefreshKey] = useState(0);

  // Filtros por columna
  const [filtroPorNombre,  setFiltroPorNombre]  = useState("");
  const [filtroPorSku,     setFiltroPorSku]     = useState("");
  const [filtroPorCosto,   setFiltroPorCosto]   = useState("");
  const [filtroPorPrecio,  setFiltroPorPrecio]  = useState("");
  const [filtroValuacion,  setFiltroValuacion]  = useState<MetodoValuacion | "">("");
  const [filtroUbicacion,  setFiltroUbicacion]  = useState<string>(""); // "", "__sin__" o id
  const [filtroTipo,       setFiltroTipo]       = useState<"todos" | "vendibles" | "insumos" | "mixtos">("todos");
  const [tab,              setTab]               = useState<"reventa" | "menu" | "materia">("reventa");
  const [cargandoLista,    setCargandoLista]     = useState(true);
  const [soloStockBajo,    setSoloStockBajo]    = useState(false);
  const [mutandoIds,       setMutandoIds]       = useState<Set<string>>(new Set());
  const [productoABorrar,  setProductoABorrar]  = useState<Producto | null>(null);
  const [errorBorrar,      setErrorBorrar]      = useState<string | null>(null);
  // Filtros nuevos auto-parts (visibles arriba del listado).
  type FiltroStock = "todos" | "sin_stock" | "bajo" | "con_stock";
  const [filtroStock,       setFiltroStock]       = useState<FiltroStock>("todos");
  const [filtroDistribuidor, setFiltroDistribuidor] = useState<string>("");

  // Paginación client-side. Default 50 (chico, legible, no fríe al browser
  // con 6000 filas). El usuario puede subir a 100 o "todos" si quiere ver
  // todo en una sola vista.
  type PageSize = 10 | 50 | 100 | "todos";
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [paginaActual, setPaginaActual] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCargandoLista(true);
    getProductos()
      .then((data) => {
        if (!cancelled) setTodos(data);
      })
      .finally(() => {
        if (!cancelled) setCargandoLista(false);
      });
    // Ubicaciones para el filtro
    fetch("/api/inventario/ubicaciones", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        setUbicaciones((j.data?.ubicaciones ?? []) as UbicacionMin[]);
      })
      .catch(() => undefined);
    // Categorías para mostrar el nombre en la tabla
    fetch("/api/inventario/categorias?todas=1", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        setCategorias((j.data?.categorias ?? j.data ?? []) as CategoriaMin[]);
      })
      .catch(() => undefined);
    // Imagen principal de cada producto (galería — misma fuente que el web).
    fetch("/api/inventario/imagenes-principales", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const m = new Map<string, string>();
        const items = (j.data?.items ?? []) as Array<{ producto_id: string; imagen_url: string | null }>;
        for (const it of items) {
          if (it.imagen_url) m.set(it.producto_id, it.imagen_url);
        }
        setImagenesPrincipales(m);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [refreshKey]);

  const categoriaPorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categorias) m.set(c.id, c.nombre);
    return m;
  }, [categorias]);

  /** Patch optimista de un flag (activo/visible_web/destacado_web). */
  async function toggleFlag(p: Producto, flag: "activo" | "visible_web" | "destacado_web") {
    if (mutandoIds.has(p.id)) return;
    const prev = (p as unknown as Record<string, unknown>)[flag];
    const nuevo = flag === "activo" ? p.activo === false : !((p as unknown as Record<string, boolean | undefined>)[flag] === true);
    // Optimistic update
    setTodos((arr) => arr.map((x) => (x.id === p.id ? { ...x, [flag]: nuevo } : x)));
    setMutandoIds((s) => { const n = new Set(s); n.add(p.id); return n; });
    try {
      const res = await fetch(`/api/productos/${p.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [flag]: nuevo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Revertir si falla
      setTodos((arr) => arr.map((x) => (x.id === p.id ? { ...x, [flag]: prev as boolean } : x)));
      console.error("[inventario] toggle", flag, err);
    } finally {
      setMutandoIds((s) => { const n = new Set(s); n.delete(p.id); return n; });
    }
  }

  function pedirBorrar(p: Producto) {
    if (mutandoIds.has(p.id)) return;
    setErrorBorrar(null);
    setProductoABorrar(p);
  }

  async function confirmarBorrar() {
    const p = productoABorrar;
    if (!p || mutandoIds.has(p.id)) return;
    setMutandoIds((s) => { const n = new Set(s); n.add(p.id); return n; });
    try {
      const res = await fetch(`/api/productos/${p.id}`, { method: "DELETE", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (json && (json.error as string)) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setTodos((arr) => arr.filter((x) => x.id !== p.id));
      setProductoABorrar(null);
    } catch (err) {
      console.error("[inventario] borrar", err);
      setErrorBorrar(err instanceof Error ? err.message : "No se pudo borrar el producto.");
    } finally {
      setMutandoIds((s) => { const n = new Set(s); n.delete(p.id); return n; });
    }
  }

  // Map se reconstruia en cada render del componente (cualquier setState de
  // filtro): O(N) basura por keystroke. useMemo lo cachea hasta que cambia ubicaciones.
  const ubicacionById = useMemo(
    () => new Map(ubicaciones.map((u) => [u.id, u])),
    [ubicaciones],
  );

  // Lista filtrada: el filter recorre `todos` en cada keystroke de los filtros.
  // Con catalogos de 500-5000 productos esto era visible (lag al tipear).
  // useMemo solo recalcula cuando cambian las dependencias relevantes.
  const productos = useMemo(() => todos.filter((p) => {
    // Nombre — fold accents/diacritics ("atun" matchea "ATÚN")
    if (filtroPorNombre.trim() !== "" &&
        !foldText(p.nombre).includes(foldText(filtroPorNombre.trim())))
      return false;

    // SKU
    if (filtroPorSku.trim() !== "" &&
        !foldText(p.sku).includes(foldText(filtroPorSku.trim())))
      return false;

    // Costo promedio — acepta "35000" o "35.000"
    if (filtroPorCosto.trim() !== "") {
      const t = filtroPorCosto.trim();
      const coincide =
        String(p.costo_promedio).includes(t) ||
        p.costo_promedio.toLocaleString("es-PY").includes(t);
      if (!coincide) return false;
    }

    // Precio venta — acepta "75000" o "75.000"
    if (filtroPorPrecio.trim() !== "") {
      const t = filtroPorPrecio.trim();
      const coincide =
        String(p.precio_venta).includes(t) ||
        p.precio_venta.toLocaleString("es-PY").includes(t);
      if (!coincide) return false;
    }

    // Valuación
    if (filtroValuacion !== "" && p.metodo_valuacion !== filtroValuacion) return false;

    // Ubicación
    if (filtroUbicacion === "__sin__") {
      if (p.ubicacion_principal_id) return false;
    } else if (filtroUbicacion !== "") {
      if (p.ubicacion_principal_id !== filtroUbicacion) return false;
    }

    // Solo stock bajo (checkbox legacy)
    if (soloStockBajo && p.stock_actual > p.stock_minimo) return false;

    // Filtro nuevo "Estado de stock" (autopartes)
    if (filtroStock === "sin_stock" && p.stock_actual > 0) return false;
    if (filtroStock === "con_stock" && p.stock_actual <= 0) return false;
    if (filtroStock === "bajo" && p.stock_actual > p.stock_minimo) return false;

    // Filtro nuevo "Distribuidor" — match exacto case-insensitive contra
    // productos.distribuidor_nombre.
    if (filtroDistribuidor) {
      const d = (p.distribuidor_nombre ?? "").trim().toUpperCase();
      if (d !== filtroDistribuidor.trim().toUpperCase()) return false;
    }

    // Tipo gastronómico (vendible/insumo/mixto)
    if (filtroTipo !== "todos") {
      const v = p.es_vendible !== false; // default true si null/undef
      const i = p.es_insumo === true;
      if (filtroTipo === "mixtos" && !(v && i)) return false;
      if (filtroTipo === "vendibles" && !(v && !i)) return false;
      if (filtroTipo === "insumos" && !(i && !v)) return false;
    }

    // Filtro por tab (Reventa | Menú | Materia prima)
    const esVendible    = p.es_vendible !== false;
    const esInsumo      = p.es_insumo === true;
    const controlaStock = p.controla_stock !== false; // default true
    if (tab === "reventa") {
      // vendibles que mueven stock real (gaseosas, postres comprados, etc.)
      if (!esVendible || !controlaStock || esInsumo) return false;
    } else if (tab === "menu") {
      // productos preparados (pizzas, lomitos, combos): vendibles SIN stock
      if (!esVendible || controlaStock || esInsumo) return false;
    } else {
      // materia prima / insumos
      if (!esInsumo) return false;
    }

    return true;
  }), [
    todos,
    filtroPorNombre,
    filtroPorSku,
    filtroPorCosto,
    filtroPorPrecio,
    filtroValuacion,
    filtroUbicacion,
    soloStockBajo,
    filtroStock,
    filtroDistribuidor,
    filtroTipo,
    tab,
  ]);

  // Lista única de distribuidores cargados en algún producto (para el dropdown).
  const distribuidoresDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const p of todos) {
      const d = (p.distribuidor_nombre ?? "").trim();
      if (d) set.add(d);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [todos]);

  // Resetear la página actual cuando cambian filtros o tamaño de página.
  useEffect(() => { setPaginaActual(0); }, [
    filtroPorNombre, filtroPorSku, filtroPorCosto, filtroPorPrecio,
    filtroValuacion, filtroUbicacion, soloStockBajo, filtroStock,
    filtroDistribuidor, filtroTipo, tab, pageSize,
  ]);

  // Slice paginado para renderizar sólo la página actual (la lista filtrada
  // puede tener miles de filas; renderizar todas fríe al browser).
  const totalPaginas = pageSize === "todos" ? 1 : Math.max(1, Math.ceil(productos.length / pageSize));
  const paginaSegura = Math.min(paginaActual, totalPaginas - 1);
  const productosPagina = useMemo(() => {
    if (pageSize === "todos") return productos;
    const start = paginaSegura * pageSize;
    return productos.slice(start, start + pageSize);
  }, [productos, paginaSegura, pageSize]);

  // Resumen del listado visible (por pestaña). Solo productos que controlan stock
  // entran en valorizado / bajo / disponibles; el resto (Menú sin control) se cuenta
  // únicamente en "Total productos".
  const resumen = useMemo(() => {
    // Tienen stock real: Reventa (controla_stock) y Materia prima (insumos, que se
    // mueven por compras/recetas). Solo el Menú "sin control" queda fuera.
    // produccion_previa (Menú fabricado y stockeado) sí maneja stock real del terminado.
    const conStock = productos.filter(
      (p) => !(p.controla_stock === false && p.es_insumo !== true && p.modo_receta !== "produccion_previa")
    );
    const stockValorizado = conStock.reduce((s, p) => s + p.stock_actual * p.costo_promedio, 0);
    const bajo = conStock.filter((p) => p.stock_actual <= p.stock_minimo).length;
    const disponibles = conStock.filter((p) => p.stock_actual > 0).length;
    return { total: productos.length, stockValorizado, bajo, disponibles, conStock: conStock.length };
  }, [productos]);

  const hayFiltrosActivos =
    filtroPorNombre || filtroPorSku || filtroPorCosto ||
    filtroPorPrecio || filtroValuacion || filtroUbicacion || soloStockBajo ||
    filtroStock !== "todos" || filtroDistribuidor ||
    filtroTipo !== "todos";

  function limpiarFiltros() {
    setFiltroPorNombre("");
    setFiltroPorSku("");
    setFiltroPorCosto("");
    setFiltroPorPrecio("");
    setFiltroStock("todos");
    setFiltroDistribuidor("");
    setFiltroValuacion("");
    setFiltroUbicacion("");
    setSoloStockBajo(false);
    setFiltroTipo("todos");
  }

  return (
    <div className="space-y-8">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
              style={{ boxShadow: "0 0 0 3px rgba(79, 174, 178, 0.18)" }}
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Zentra · Stock
            </p>
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Inventario</h1>
          <p className="mt-0.5 text-xs text-slate-500">Gestión de productos y control de stock</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <ExportExcelButton url="/api/inventario/productos/export" />
          <ImportExcelButton
            entidad="Productos"
            previewUrl="/api/inventario/productos/import/preview"
            commitUrl="/api/inventario/productos/import/commit"
            templateUrl="/api/inventario/productos/import/template"
            permiteCrearFaltantes
            visible={isAdmin}
            onCompleted={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </div>

      {/* Tabs gastronómicos ocultos en esta instancia: en Autorepuestos
          Felix Bogado todos los productos son de reventa, por lo que el
          tab fijo en "reventa" (state init) muestra todo lo relevante.
          Mantengo el state para no romper los useMemo / filtros aguas
          abajo que dependen de `tab`. */}

      {/* Resumen por pestaña */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard compact label="Total productos" value={String(resumen.total)} accent
          hint={tab === "reventa" ? "Reventa" : tab === "menu" ? "Menú" : "Materia prima"} />
        <StatCard compact label="Stock valorizado" value={formatGs(Math.round(resumen.stockValorizado))}
          hint="stock × costo prom." />
        <StatCard compact label="Stock bajo" value={String(resumen.bajo)}
          hint="≤ stock mínimo" />
        <StatCard compact
          label={tab === "materia" ? "Materias disponibles" : "Con stock disponible"}
          value={String(resumen.disponibles)} hint="stock > 0" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15 sm:p-5 lg:p-6">

        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold">Productos</h2>
            <Link
              href="/inventario/nuevo"
              className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95"
            >
              Nuevo producto
            </Link>
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={filtroPorNombre}
              onChange={(e) => setFiltroPorNombre(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none sm:w-64 sm:flex-none"
            />
            {/* Filtros auto-parts: estado de stock + distribuidor */}
            <select
              value={filtroStock}
              onChange={(e) => setFiltroStock(e.target.value as FiltroStock)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#4FAEB2]/30"
              title="Estado de stock"
            >
              <option value="todos">Stock: todos</option>
              <option value="con_stock">Con stock (&gt;0)</option>
              <option value="sin_stock">Sin stock (=0)</option>
              <option value="bajo">Stock bajo (≤ mín.)</option>
            </select>
            <select
              value={filtroDistribuidor}
              onChange={(e) => setFiltroDistribuidor(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#4FAEB2]/30 max-w-[14rem] truncate"
              title="Proveedor"
              disabled={distribuidoresDisponibles.length === 0}
            >
              <option value="">
                {distribuidoresDisponibles.length === 0
                  ? "Sin proveedores cargados"
                  : "Proveedor: todos"}
              </option>
              {distribuidoresDisponibles.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            {(filtroStock !== "todos" || filtroDistribuidor) && (
              <button
                type="button"
                onClick={() => { setFiltroStock("todos"); setFiltroDistribuidor(""); }}
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Filtros por columna — fila 1 (SKU/Costo/Precio) oculta para UX simplificada */}
        <div className="hidden space-y-3 mb-5 pb-5 border-b border-gray-100">

          {/* Fila 1: filtros de texto por columna */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nombre</label>
              <input
                type="text"
                placeholder="Buscar nombre..."
                value={filtroPorNombre}
                onChange={(e) => setFiltroPorNombre(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">SKU</label>
              <input
                type="text"
                placeholder="Buscar SKU..."
                value={filtroPorSku}
                onChange={(e) => setFiltroPorSku(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Costo promedio</label>
              <input
                type="text"
                placeholder="Ej: 35000"
                value={filtroPorCosto}
                onChange={(e) => setFiltroPorCosto(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Precio venta</label>
              <input
                type="text"
                placeholder="Ej: 75000"
                value={filtroPorPrecio}
                onChange={(e) => setFiltroPorPrecio(e.target.value)}
                className={inputFilterClass}
              />
            </div>
          </div>

          {/* Fila 2: valuación, ubicación, stock bajo, limpiar y contador
              Ocultada para instancia En lo de Mari — la lógica de filtros sigue activa pero sin UI. */}
          <div className="hidden flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Valuación</label>
              <select
                value={filtroValuacion}
                onChange={(e) => setFiltroValuacion(e.target.value as MetodoValuacion | "")}
                className={inputFilterClass}
              >
                <option value="">Todos los métodos</option>
                <option value="CPP">CPP</option>
                <option value="FIFO">FIFO</option>
                <option value="LIFO">LIFO</option>
              </select>
            </div>
            <div className="min-w-[14rem]">
              <label className="block text-xs text-gray-400 mb-1">Depósito / Ubicación</label>
              <select
                value={filtroUbicacion}
                onChange={(e) => setFiltroUbicacion(e.target.value)}
                className={`${inputFilterClass} w-full`}
              >
                <option value="">Todas las ubicaciones</option>
                <option value="__sin__">Sin ubicación asignada</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} — {u.tipo}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none mt-4">
              <input
                type="checkbox"
                checked={soloStockBajo}
                onChange={(e) => setSoloStockBajo(e.target.checked)}
                className="rounded"
              />
              Solo stock bajo
            </label>
            <div className="mt-4 flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-0.5">
              {(["todos","vendibles","insumos","mixtos"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFiltroTipo(opt)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition ${
                    filtroTipo === opt
                      ? "bg-white text-amber-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {opt === "todos" ? "Todos" : opt[0].toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
            {hayFiltrosActivos && (
              <button
                onClick={limpiarFiltros}
                className="mt-4 text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
              >
                Limpiar filtros
              </button>
            )}
            <span className="ml-auto text-sm text-gray-400 self-end mb-0.5">
              {productos.length} de {todos.length} productos
            </span>
          </div>

        </div>

        {/* Controles de paginación — versión TOP (mismo bloque que el de abajo) */}
        {productos.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <label htmlFor="page-size-top" className="text-xs text-slate-500">Mostrar</label>
              <select
                id="page-size-top"
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
                  ? `${productos.length} producto(s)`
                  : `${paginaSegura * pageSize + 1}–${Math.min((paginaSegura + 1) * pageSize, productos.length)} de ${productos.length}`}
              </span>
            </div>

            {pageSize !== "todos" && totalPaginas > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPaginaActual(0)}
                  disabled={paginaSegura === 0}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Primera página"
                >«</button>
                <button
                  type="button"
                  onClick={() => setPaginaActual((p) => Math.max(0, p - 1))}
                  disabled={paginaSegura === 0}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >‹ Anterior</button>
                <span className="px-3 text-xs text-slate-600 tabular-nums">
                  Página <span className="font-semibold">{paginaSegura + 1}</span> de {totalPaginas}
                </span>
                <button
                  type="button"
                  onClick={() => setPaginaActual((p) => Math.min(totalPaginas - 1, p + 1))}
                  disabled={paginaSegura >= totalPaginas - 1}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >Siguiente ›</button>
                <button
                  type="button"
                  onClick={() => setPaginaActual(totalPaginas - 1)}
                  disabled={paginaSegura >= totalPaginas - 1}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Última página"
                >»</button>
              </div>
            )}
          </div>
        )}

        <EdgeScrollArea>
          {/* min-w-[1100px] fuerza scroll horizontal real en mobile; en >=lg
              vuelve a comportarse natural. Columnas no críticas (SKU, Unidad,
              Ubicacion, Valuacion, Margen) se ocultan progresivamente. */}
          <table className="w-full min-w-[780px] lg:min-w-0 text-left text-sm">

            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pr-4 font-medium w-20"></th>
                <th className="py-3 pr-4 font-medium">Nombre</th>
                <th className="hidden py-3 pr-4 font-medium lg:table-cell">Categoría</th>
                <th className="py-3 pr-4 font-medium">Costo Prom.</th>
                {tab !== "materia" && <th className="py-3 pr-4 font-medium">Precio Venta</th>}
                <th className="py-3 pr-4 font-medium text-center">Stock actual</th>
                <th className="py-3 pr-4 font-medium text-center hidden md:table-cell">Sucursal</th>
                <th className="py-3 pr-4 text-center font-medium hidden lg:table-cell">Stock Mín.</th>
                {puedeEditarWeb && (
                  <>
                    <th className="py-3 pr-4 font-medium text-center">Visible web</th>
                    <th className="py-3 pr-4 font-medium text-center">Destacado</th>
                  </>
                )}
                {tab !== "materia" && (
                  <th className="hidden py-3 pr-6 text-right font-medium lg:table-cell">
                    <span title="(precio - costo) / precio × 100">Margen s/venta</span>
                  </th>
                )}
                <th className="py-3 pl-4 font-medium text-center w-32">Acción</th>
              </tr>
            </thead>

            <tbody>
              {cargandoLista && (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-sm text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin text-[#4FAEB2]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Cargando productos…
                    </div>
                  </td>
                </tr>
              )}
              {!cargandoLista && productosPagina.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-sm text-slate-400">
                    {todos.length === 0
                      ? "Todavía no cargaste productos. Probá con \"+ Nuevo producto\" o \"Importar Excel\"."
                      : "No hay productos que coincidan con los filtros aplicados."}
                  </td>
                </tr>
              )}
              {productosPagina.map((p) => {
                const stockBajo = p.stock_actual <= p.stock_minimo;
                const margen = calcularMargenVenta(p.costo_promedio, p.precio_venta);
                // "Sin control" SOLO para Menú (vendible sin stock). Los insumos
                // (Materia prima) sí tienen stock real aunque controla_stock=false.
                const sinControl =
                  p.controla_stock === false && p.es_insumo !== true && p.modo_receta !== "produccion_previa";
                return (
                  <tr key={p.id} className="border-b border-slate-200 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                    <td className="py-2 pr-4">
                      <ProductoThumb
                        producto={p}
                        urlPrincipal={imagenesPrincipales.get(p.id) ?? null}
                      />
                    </td>
                    <td className="py-4 pr-4 font-medium text-gray-800">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{p.nombre}</span>
                        {(() => {
                          const v = p.es_vendible !== false;
                          const i = p.es_insumo === true;
                          // Mixto/Insumo se siguen mostrando; Vendible queda oculto (redundante: ya hay tab).
                          if (v && i) return <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 text-[10px] font-medium px-2 py-0.5">Mixto</span>;
                          if (i) return <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-medium px-2 py-0.5">Insumo</span>;
                          return null;
                        })()}
                      </div>
                    </td>
                    <td className="hidden py-4 pr-4 text-gray-600 lg:table-cell">
                      {categoriaPorId.get(p.categoria_principal_id ?? "") ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.costo_promedio)}</td>
                    {tab !== "materia" && <td className="py-4 pr-4 text-gray-700">{formatGs(p.precio_venta)}</td>}
                    <td className="py-4 pr-4 text-center">
                      {sinControl ? (
                        <span className="text-xs text-gray-400">— sin control</span>
                      ) : (
                        <span className={`font-semibold tabular-nums ${stockBajo ? "text-red-600" : "text-gray-800"}`}>
                          {formatStock(p.stock_actual)}{" "}
                          <span className={`text-xs font-normal ${stockBajo ? "text-red-400" : "text-gray-400"}`}>{p.unidad_medida}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-4 text-center hidden md:table-cell">
                      {(() => {
                        const list = (p.sucursales ?? []).filter((s) => s.stock_actual > 0);
                        if (list.length === 0) {
                          return <span className="text-xs text-slate-300">—</span>;
                        }
                        return (
                          <div className="flex flex-wrap gap-1 justify-center">
                            {list.map((s) => (
                              <span
                                key={s.sucursal_id}
                                className={`inline-flex items-center gap-1 rounded-full text-[10px] font-medium px-2 py-0.5 border ${
                                  s.es_principal
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-sky-50 text-sky-700 border-sky-200"
                                }`}
                                title={`${s.nombre}: ${s.stock_actual}`}
                              >
                                {s.nombre} <span className="tabular-nums opacity-70">·{s.stock_actual}</span>
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-4 pr-4 text-center text-gray-500 hidden lg:table-cell">
                      {sinControl ? "—" : <span className="tabular-nums">{formatStock(p.stock_minimo)}</span>}
                    </td>
                    {puedeEditarWeb && (() => {
                      const mutando = mutandoIds.has(p.id);
                      const visibleWeb = p.visible_web === true;
                      const destacado = p.destacado_web === true;
                      const pillBase =
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
                      const onCls = "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
                      const offCls = "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100";
                      const destOnCls = "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100";
                      return (
                        <>
                          <td className="py-4 pr-4 text-center">
                            <button
                              type="button"
                              disabled={mutando}
                              onClick={() => toggleFlag(p, "visible_web")}
                              title={visibleWeb ? "Publicado en la web — click para ocultar" : "Oculto de la web — click para publicar"}
                              className={`${pillBase} ${visibleWeb ? onCls : offCls} ${mutando ? "opacity-60" : ""}`}
                              aria-pressed={visibleWeb}
                            >
                              {visibleWeb ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                              {visibleWeb ? "Sí" : "No"}
                            </button>
                          </td>
                          <td className="py-4 pr-4 text-center">
                            <button
                              type="button"
                              disabled={mutando}
                              onClick={() => toggleFlag(p, "destacado_web")}
                              title={destacado ? "Destacado en home — click para quitar" : "Click para marcar como destacado"}
                              className={`${pillBase} ${destacado ? destOnCls : offCls} ${mutando ? "opacity-60" : ""}`}
                              aria-pressed={destacado}
                            >
                              <Star className={`h-3.5 w-3.5 ${destacado ? "fill-amber-400" : ""}`} />
                              {destacado ? "Sí" : "No"}
                            </button>
                          </td>
                        </>
                      );
                    })()}
                    {tab !== "materia" && (
                      <td className={`hidden py-4 pr-6 text-right font-semibold tabular-nums lg:table-cell ${margenColor(margen)}`}>
                        {margen.toFixed(2)}%
                      </td>
                    )}
                    <td className="py-4 pl-4 text-center">
                      <div className="inline-flex items-center justify-center gap-2">
                        <Link
                          href={`/inventario/${p.id}/editar`}
                          className="inline-flex items-center justify-center h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                          Editar
                        </Link>
                        <button
                          type="button"
                          disabled={mutandoIds.has(p.id)}
                          onClick={() => pedirBorrar(p)}
                          title="Borrar producto"
                          className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Borrar producto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
        </EdgeScrollArea>

        {/* Controles de paginación */}
        {productos.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-4 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <label htmlFor="page-size" className="text-xs text-slate-500">Mostrar</label>
              <select
                id="page-size"
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
                  ? `${productos.length} producto(s)`
                  : `${paginaSegura * pageSize + 1}–${Math.min((paginaSegura + 1) * pageSize, productos.length)} de ${productos.length}`}
              </span>
            </div>

            {pageSize !== "todos" && totalPaginas > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPaginaActual(0)}
                  disabled={paginaSegura === 0}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Primera página"
                >«</button>
                <button
                  type="button"
                  onClick={() => setPaginaActual((p) => Math.max(0, p - 1))}
                  disabled={paginaSegura === 0}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >‹ Anterior</button>
                <span className="px-3 text-xs text-slate-600 tabular-nums">
                  Página <span className="font-semibold">{paginaSegura + 1}</span> de {totalPaginas}
                </span>
                <button
                  type="button"
                  onClick={() => setPaginaActual((p) => Math.min(totalPaginas - 1, p + 1))}
                  disabled={paginaSegura >= totalPaginas - 1}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >Siguiente ›</button>
                <button
                  type="button"
                  onClick={() => setPaginaActual(totalPaginas - 1)}
                  disabled={paginaSegura >= totalPaginas - 1}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Última página"
                >»</button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Modal de confirmación de borrado */}
      {productoABorrar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !mutandoIds.has(productoABorrar.id)) {
              setProductoABorrar(null);
              setErrorBorrar(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start gap-4 p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50">
                <Trash2 className="h-5 w-5 text-red-600" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">¿Borrar producto?</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Se va a eliminar definitivamente <span className="font-medium text-slate-800">&quot;{productoABorrar.nombre}&quot;</span> del inventario y del catálogo web. Esta acción no se puede deshacer.
                </p>
                {errorBorrar && (
                  <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {errorBorrar}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 rounded-b-2xl bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => { setProductoABorrar(null); setErrorBorrar(null); }}
                disabled={mutandoIds.has(productoABorrar.id)}
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarBorrar}
                disabled={mutandoIds.has(productoABorrar.id)}
                className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mutandoIds.has(productoABorrar.id) ? "Borrando…" : "Sí, borrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Thumbnail con fallback a placeholder cuando la imagen no carga.
 * Cubre 3 casos típicos:
 *   1. imagen_url apunta a un archivo borrado del bucket.
 *   2. signed URL expirada (TTL vencido).
 *   3. imagen_path con typo o re-subida con otro nombre.
 * En cualquiera de esos, `onError` dispara y mostramos el ícono de roto
 * (en gris) en vez del 404 feo del navegador.
 */
function ProductoThumb({
  producto, urlPrincipal,
}: { producto: Producto; urlPrincipal: string | null }) {
  const urlInicial =
    urlPrincipal ?? producto.imagen_url ?? publicProductoImagenUrl(producto.imagen_path);
  const [error, setError] = useState(false);
  // Re-evaluar cuando el producto o la URL principal cambia (cache-bust al
  // re-subir una imagen). El reseteo evita quedar "trancado" en error si el
  // admin re-subió la imagen y volvió a la página.
  useEffect(() => { setError(false); }, [urlInicial, producto.id]);

  if (!urlInicial || error) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-200 text-slate-300">
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200">
      <Image
        src={urlInicial}
        alt={producto.nombre}
        fill
        sizes="64px"
        className="object-cover"
        unoptimized
        onError={() => setError(true)}
      />
    </div>
  );
}
